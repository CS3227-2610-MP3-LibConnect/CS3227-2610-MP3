import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPROVED_SOCLAAS_MODEL,
  SoCLlmClient,
  SoCLlmError,
} from '../dist/apps/api/src/integrations/soclaas/client.js';

const request = {
  feature: 'librarian-assistant',
  actorId: 'librarian-1',
  messages: [{ role: 'user', content: '{"task":"summary"}' }],
};
const successResponse = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
    status: 200,
  });

test('SoCLaaS adapter fails closed when configuration is missing', async () => {
  let calls = 0;
  const client = new SoCLlmClient({
    apiKey: undefined,
    baseUrl: undefined,
    fetcher: async () => {
      calls += 1;
      return successResponse();
    },
    audit: () => undefined,
  });
  await assert.rejects(
    client.complete(request),
    (error) => error instanceof SoCLlmError && error.code === 'CONFIGURATION',
  );
  assert.equal(calls, 0);
});

test('SoCLaaS adapter selects only the approved model and sends server-only credentials', async () => {
  const calls = [];
  const client = new SoCLlmClient({
    apiKey: 'test-provider-key',
    baseUrl: 'https://soclaas.example.test/v1',
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return successResponse();
    },
    audit: () => undefined,
  });
  const result = await client.complete(request);
  assert.equal(result.model, APPROVED_SOCLAAS_MODEL);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://soclaas.example.test/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-provider-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: APPROVED_SOCLAAS_MODEL,
    messages: request.messages,
    reasoning_effort: 'none',
  });
});

test('non-retryable provider errors are not retried', async () => {
  let calls = 0;
  const client = new SoCLlmClient({
    apiKey: 'test-provider-key',
    baseUrl: 'https://soclaas.example.test/v1',
    fetcher: async () => {
      calls += 1;
      return new Response('{}', { status: 401 });
    },
    sleep: async () => undefined,
    audit: () => undefined,
  });
  await assert.rejects(
    client.complete(request),
    (error) =>
      error instanceof SoCLlmError && error.code === 'UNAVAILABLE' && error.retryCount === 0,
  );
  assert.equal(calls, 1);
});

test('safe transient provider errors receive one bounded retry', async () => {
  let calls = 0;
  const client = new SoCLlmClient({
    apiKey: 'test-provider-key',
    baseUrl: 'https://soclaas.example.test/v1',
    fetcher: async () => {
      calls += 1;
      return calls === 1 ? new Response('{}', { status: 503 }) : successResponse();
    },
    sleep: async (milliseconds) => assert.equal(milliseconds, 250),
    audit: () => undefined,
  });
  const result = await client.complete(request);
  assert.equal(result.model, APPROVED_SOCLAAS_MODEL);
  assert.equal(calls, 2);
});

test('per-user limit rejects the sixth request without calling the provider', async () => {
  let calls = 0;
  const client = new SoCLlmClient({
    apiKey: 'test-provider-key',
    baseUrl: 'https://soclaas.example.test/v1',
    fetcher: async () => {
      calls += 1;
      return successResponse();
    },
    audit: () => undefined,
  });
  for (let index = 0; index < 5; index += 1) await client.complete(request);
  await assert.rejects(
    client.complete(request),
    (error) => error instanceof SoCLlmError && error.code === 'RATE_LIMITED',
  );
  assert.equal(calls, 5);
});

test('retryable failures open the circuit and suppress the next provider call', async () => {
  let calls = 0;
  const client = new SoCLlmClient({
    apiKey: 'test-provider-key',
    baseUrl: 'https://soclaas.example.test/v1',
    fetcher: async () => {
      calls += 1;
      return new Response('{}', { status: 503 });
    },
    sleep: async () => undefined,
    audit: () => undefined,
  });
  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(
      client.complete({ ...request, actorId: `librarian-${index}` }),
      (error) => error instanceof SoCLlmError && error.code === 'UNAVAILABLE',
    );
  }
  const callsBeforeCircuit = calls;
  await assert.rejects(
    client.complete({ ...request, actorId: 'librarian-circuit' }),
    (error) => error instanceof SoCLlmError && error.code === 'UNAVAILABLE',
  );
  assert.equal(calls, callsBeforeCircuit);
});

test('retryable failures remain in the rolling window across successful requests', async () => {
  const outcomes = [
    'failure',
    'success',
    'failure',
    'success',
    'failure',
    'success',
    'failure',
    'success',
    'failure',
  ];
  const responses = outcomes.flatMap((outcome) =>
    outcome === 'failure'
      ? [new Response('{}', { status: 503 }), new Response('{}', { status: 503 })]
      : [successResponse()],
  );
  let calls = 0;
  const client = new SoCLlmClient({
    apiKey: 'test-provider-key',
    baseUrl: 'https://soclaas.example.test/v1',
    fetcher: async () => responses[calls++],
    sleep: async () => undefined,
    audit: () => undefined,
  });

  for (let index = 0; index < outcomes.length; index += 1) {
    const actorId = `librarian-interleaved-${index}`;
    if (outcomes[index] === 'failure') {
      await assert.rejects(
        client.complete({ ...request, actorId }),
        (error) => error instanceof SoCLlmError && error.code === 'UNAVAILABLE',
      );
    } else {
      await client.complete({ ...request, actorId });
    }
  }

  const callsBeforeCircuit = calls;
  await assert.rejects(
    client.complete({ ...request, actorId: 'librarian-interleaved-final' }),
    (error) => error instanceof SoCLlmError && error.code === 'UNAVAILABLE',
  );
  assert.equal(calls, callsBeforeCircuit);
  assert.equal(callsBeforeCircuit, 14);
});

test('oversized provider response is rejected before the body is fully read', async () => {
  let reads = 0;
  let cancelled = false;
  const response = {
    ok: true,
    headers: new Headers(),
    body: {
      getReader() {
        return {
          async read() {
            reads += 1;
            if (reads === 1)
              return { done: false, value: new TextEncoder().encode('{"choices":[') };
            if (reads === 2) return { done: false, value: new Uint8Array(16 * 1024) };
            return { done: true, value: undefined };
          },
          async cancel() {
            cancelled = true;
          },
          releaseLock() {},
        };
      },
    },
  };
  const client = new SoCLlmClient({
    apiKey: 'test-provider-key',
    baseUrl: 'https://soclaas.example.test/v1',
    fetcher: async () => response,
    audit: () => undefined,
  });

  await assert.rejects(
    client.complete(request),
    (error) => error instanceof SoCLlmError && error.code === 'UNAVAILABLE',
  );
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});

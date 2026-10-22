import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSoCLlmClient, SoCLlmAdapterError } from '../../dist/apps/api/src/integrations/soclaas/client.js';

const validEnv = {
  SOCLAAS_BASE_URL: 'https://soclaas.example.test/v1',
  SOCLAAS_API_KEY: 'test-secret-do-not-print',
  SOCLAAS_MODEL: 'approved-test-model',
};

function completionResponse(content = 'A safe answer.', model = 'approved-test-model') {
  return new Response(JSON.stringify({
    choices: [{ message: { role: 'assistant', content } }],
    model,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function request(overrides = {}) {
  return {
    feature: 'member-assistant',
    messages: [{ role: 'user', content: 'Where is My Loans?' }],
    ...overrides,
  };
}

test('sends configured endpoint, Bearer auth, model, messages, and reasoning_effort none', async () => {
  let captured;
  const client = createSoCLlmClient({
    env: validEnv,
    fetch: async (url, options) => {
      captured = { url, options };
      return completionResponse();
    },
  });

  const result = await client.complete(request());

  assert.equal(captured.url, 'https://soclaas.example.test/v1/chat/completions');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, `Bearer ${validEnv.SOCLAAS_API_KEY}`);
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(captured.options.body), {
    model: validEnv.SOCLAAS_MODEL,
    messages: request().messages,
    reasoning_effort: 'none',
  });
  assert.deepEqual(result, { content: 'A safe answer.', model: 'approved-test-model' });
});

test('request type and runtime do not permit caller-selected models', async () => {
  const client = createSoCLlmClient({ env: validEnv, fetch: async (_url, options) => {
    assert.equal(Object.hasOwn(JSON.parse(options.body), 'model'), true);
    assert.equal(JSON.parse(options.body).model, validEnv.SOCLAAS_MODEL);
    return completionResponse();
  } });

  await client.complete(request({ model: 'attacker-selected-model' }));
});

test('missing or invalid configuration disables the adapter without throwing during construction', async () => {
  for (const env of [
    {},
    { ...validEnv, SOCLAAS_BASE_URL: 'not a URL' },
    { ...validEnv, SOCLAAS_BASE_URL: 'file:///tmp/provider' },
    { ...validEnv, SOCLAAS_BASE_URL: 'http://soclaas.example.test/v1' },
    { ...validEnv, SOCLAAS_API_KEY: '' },
    { ...validEnv, SOCLAAS_MODEL: '' },
  ]) {
    let providerCalls = 0;
    assert.doesNotThrow(() => createSoCLlmClient({
      env,
      fetch: async () => { providerCalls += 1; return completionResponse(); },
    }));
    const client = createSoCLlmClient({
      env,
      fetch: async () => { providerCalls += 1; return completionResponse(); },
    });

    await assert.rejects(client.complete(request()), (error) => {
      assert.ok(error instanceof SoCLlmAdapterError);
      assert.equal(error.code, 'CONFIGURATION_ERROR');
      return true;
    });
    assert.equal(providerCalls, 0);
  }
});

test('rejects malformed provider success responses', async () => {
  const malformed = [
    new Response('{not-json', { status: 200 }),
    new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null } }] }), { status: 200 }),
    new Response(JSON.stringify({ choices: [{ message: { role: 'user', content: 'wrong role' } }] }), { status: 200 }),
  ];

  for (const response of malformed) {
    const client = createSoCLlmClient({ env: validEnv, fetch: async () => response });
    await assert.rejects(client.complete(request()), (error) => {
      assert.ok(error instanceof SoCLlmAdapterError);
      assert.equal(error.code, 'PROVIDER_UNAVAILABLE');
      return true;
    });
  }
});

test('provider failures become safe errors without credentials, provider body, or prompt leakage', async () => {
  const privatePrompt = 'private member prompt marker';
  const providerSecret = 'upstream private body marker';
  const client = createSoCLlmClient({
    env: validEnv,
    fetch: async () => new Response(providerSecret, { status: 401 }),
  });

  await assert.rejects(client.complete(request({ messages: [{ role: 'user', content: privatePrompt }] })), (error) => {
    assert.ok(error instanceof SoCLlmAdapterError);
    assert.equal(error.code, 'PROVIDER_UNAVAILABLE');
    assert.doesNotMatch(error.message, /test-secret-do-not-print|upstream private body marker|private member prompt marker/i);
    return true;
  });
});

test('retries one transient provider failure and does not retry authentication failures', async () => {
  let calls = 0;
  const retryingClient = createSoCLlmClient({ env: validEnv, fetch: async () => {
    calls += 1;
    return calls === 1 ? new Response('temporary', { status: 503 }) : completionResponse();
  } });

  assert.deepEqual(await retryingClient.complete(request()), { content: 'A safe answer.', model: 'approved-test-model' });
  assert.equal(calls, 2);

  calls = 0;
  const unauthorizedClient = createSoCLlmClient({ env: validEnv, fetch: async () => {
    calls += 1;
    return new Response('private auth response', { status: 401 });
  } });
  await assert.rejects(unauthorizedClient.complete(request()));
  assert.equal(calls, 1);
});

test('one 15-second total deadline bounds a stalled attempt and its retry', { timeout: 18_000 }, async () => {
  const signals = [];
  let calls = 0;
  const client = createSoCLlmClient({ env: validEnv, fetch: async (_url, options) => {
    calls += 1;
    signals.push(options.signal);
    if (calls === 1) return new Response('temporary', { status: 503 });
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  } });
  const startedAt = Date.now();

  await assert.rejects(client.complete(request()), (error) => {
    assert.equal(error.code, 'PROVIDER_UNAVAILABLE');
    return true;
  });

  assert.equal(calls, 2);
  assert.ok(Date.now() - startedAt < 16_500, `deadline elapsed ${Date.now() - startedAt}ms`);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
});

test('injectable fake transport needs no real provider credentials', async () => {
  let called = false;
  const client = createSoCLlmClient({
    env: { ...validEnv, SOCLAAS_API_KEY: 'fake-only' },
    fetch: async () => { called = true; return completionResponse('mocked'); },
  });

  assert.equal((await client.complete(request())).content, 'mocked');
  assert.equal(called, true);
});

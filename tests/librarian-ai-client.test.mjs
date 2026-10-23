import assert from 'node:assert/strict';
import { test } from 'node:test';
import { librarianAssistantApi } from '../dist/apps/client/src/api/librarian-assistant.js';

test('client API sends only approved assistant request fields', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await librarianAssistantApi.summarize(['loan-1']);
    await librarianAssistantApi.draft('loan-1', 'RETURN_FOLLOW_UP');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(JSON.parse(requests[0].init.body), { loanIds: ['loan-1'] });
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    sourceType: 'PENDING_REPORT',
    sourceId: 'loan-1',
    purpose: 'RETURN_FOLLOW_UP',
  });
  assert.equal(
    requests.some(
      (item) => String(item.url).includes('soclaas') || String(item.url).includes('firestore'),
    ),
    false,
  );
});

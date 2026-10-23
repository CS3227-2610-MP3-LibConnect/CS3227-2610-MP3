import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memberAccountsApi } from '../dist/apps/client/src/api/members.js';

test('member account client API uses the protected route and strict status body', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).includes('/status'))
      return new Response(
        JSON.stringify({ member: { userId: 'member-1', accountStatus: 'INACTIVE' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    return new Response(JSON.stringify({ items: [], page: { limit: 20, nextCursor: null } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await memberAccountsApi.list({ status: 'ACTIVE', limit: 20, cursor: 'opaque.cursor' });
    await memberAccountsApi.updateStatus('member-1', 'INACTIVE');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(
    requests[0].url,
    /\/api\/v1\/librarian\/members\?status=ACTIVE&limit=20&cursor=opaque.cursor$/,
  );
  assert.match(requests[1].url, /\/api\/v1\/librarian\/members\/member-1\/status$/);
  assert.deepEqual(JSON.parse(requests[1].init.body), { status: 'INACTIVE' });
  assert.equal('accountType' in JSON.parse(requests[1].init.body), false);
  assert.equal('isManager' in JSON.parse(requests[1].init.body), false);
});

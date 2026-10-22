import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClientError } from '../../dist/apps/client/src/api/errors.js';
import { memberProfileApi } from '../../dist/apps/client/src/api/member-profile.js';

const safeUser = {
  userId: 'member-1',
  name: 'Member One',
  email: 'member@example.test',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'M-1',
};

async function withFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('profile API reads the safe current account through the cookie-authenticated API client', async () => {
  await withFetch(async (url, init) => {
    assert.match(String(url), /\/api\/v1\/member\/profile$/);
    assert.equal(init.method, undefined);
    assert.equal(init.credentials, 'include');
    return Response.json({ user: safeUser });
  }, async () => {
    assert.deepEqual(await memberProfileApi.get(), { user: safeUser });
  });
});

test('name and email mutations return the updated safe user and do not send client identity or auth version', async () => {
  const cases = [
    { method: 'updateName', path: '/name', body: { name: 'Updated Name' } },
    { method: 'updateEmail', path: '/email', body: { email: 'updated@example.test' } },
  ];

  for (const item of cases) {
    await withFetch(async (url, init) => {
      assert.match(String(url), new RegExp(`/api/v1/member/profile${item.path}$`));
      assert.equal(init.method, 'PATCH');
      assert.equal(init.credentials, 'include');
      assert.deepEqual(JSON.parse(init.body), item.body);
      assert.equal(Object.hasOwn(JSON.parse(init.body), 'userId'), false);
      assert.equal(Object.hasOwn(JSON.parse(init.body), 'authVersion'), false);
      return Response.json({ user: safeUser });
    }, async () => {
      const result = await memberProfileApi[item.method](Object.values(item.body)[0]);
      assert.deepEqual(result, { user: safeUser });
    });
  }
});

test('password mutation uses the cookie session and never includes account identifiers or auth version', async () => {
  const input = { currentPassword: 'old-pass-1', newPassword: 'new-pass-2', confirmPassword: 'new-pass-2' };
  await withFetch(async (url, init) => {
    assert.match(String(url), /\/api\/v1\/member\/profile\/password$/);
    assert.equal(init.method, 'PATCH');
    assert.equal(init.credentials, 'include');
    assert.deepEqual(JSON.parse(init.body), input);
    assert.equal(Object.hasOwn(JSON.parse(init.body), 'userId'), false);
    assert.equal(Object.hasOwn(JSON.parse(init.body), 'authVersion'), false);
    return Response.json({ user: safeUser });
  }, async () => {
    assert.deepEqual(await memberProfileApi.changePassword(input), { user: safeUser });
  });
});

test('profile API failures reject with the original API error for page-level feedback', async () => {
  await withFetch(async () => Response.json({ error: { code: 'EMAIL_IN_USE', message: 'Email is already in use.' } }, { status: 409 }), async () => {
    await assert.rejects(memberProfileApi.updateEmail('taken@example.test'), (error) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 409);
      assert.match(error.message, /already in use/i);
      return true;
    });
  });
});

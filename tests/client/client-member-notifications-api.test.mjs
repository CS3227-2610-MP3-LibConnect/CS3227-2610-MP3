import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClientError } from '../../dist/apps/client/src/api/errors.js';
import { notificationsApi } from '../../dist/apps/client/src/api/notifications.js';

const notification = {
  notificationId: 'notice-1',
  recipientUserId: 'member-1',
  notificationType: 'LIBRARIAN_MESSAGE',
  referenceType: null,
  referenceId: null,
  message: 'Your requested item is available.',
  createdAt: '2026-10-20T08:30:00.000Z',
  read: false,
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

test('preview reads the member preview envelope through the cookie-authenticated API client', async () => {
  const response = { items: [notification] };
  await withFetch(
    async (url, init) => {
      assert.equal(new URL(url).pathname, '/api/v1/member/notifications/preview');
      assert.equal(init.method, undefined);
      assert.equal(init.credentials, 'include');
      return Response.json(response);
    },
    async () => {
      assert.deepEqual(await notificationsApi.getPreview(), response);
    },
  );
});

test('history sends the bounded limit and opaque cursor and returns the typed page shape', async () => {
  const page = { items: [notification], page: { limit: 10, nextCursor: 'next+/=' } };
  await withFetch(
    async (url, init) => {
      const requestUrl = new URL(url);
      assert.equal(requestUrl.pathname, '/api/v1/member/notifications');
      assert.equal(requestUrl.searchParams.get('limit'), '10');
      assert.equal(requestUrl.searchParams.get('cursor'), 'opaque cursor+/=');
      assert.equal(init.method, undefined);
      assert.equal(init.credentials, 'include');
      return Response.json(page);
    },
    async () => {
      assert.deepEqual(
        await notificationsApi.list({ limit: 10, cursor: 'opaque cursor+/=' }),
        page,
      );
    },
  );
});

test('detail encodes the notification ID and returns its notification envelope', async () => {
  const response = { notification };
  await withFetch(
    async (url, init) => {
      assert.equal(new URL(url).pathname, '/api/v1/member/notifications/notice%2Fone');
      assert.equal(init.method, undefined);
      assert.equal(init.credentials, 'include');
      return Response.json(response);
    },
    async () => {
      assert.deepEqual(await notificationsApi.get('notice/one'), response);
    },
  );
});

test('markRead uses PATCH and accepts the API 204 response', async () => {
  await withFetch(
    async (url, init) => {
      assert.equal(new URL(url).pathname, '/api/v1/member/notifications/notice-1/read');
      assert.equal(init.method, 'PATCH');
      assert.equal(init.credentials, 'include');
      assert.equal(init.body, undefined);
      return new Response(null, { status: 204 });
    },
    async () => {
      assert.equal(await notificationsApi.markRead('notice-1'), undefined);
    },
  );
});

test('notification API errors preserve ApiClientError status and payload details', async () => {
  await withFetch(
    async () =>
      Response.json(
        { error: { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification was not found.' } },
        { status: 404 },
      ),
    async () => {
      await assert.rejects(notificationsApi.get('missing'), (error) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.status, 404);
        assert.equal(error.code, 'NOTIFICATION_NOT_FOUND');
        assert.equal(error.message, 'Notification was not found.');
        return true;
      });
    },
  );
});

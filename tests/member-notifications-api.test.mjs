import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { Timestamp } from 'firebase-admin/firestore';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';
import { createMemberNotificationsRouter } from '../dist/apps/api/src/routes/member-notifications.js';

const member = { userId: 'notifications-member', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'member-id' };
const otherMember = { userId: 'notifications-other', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'other-id' };
const librarian = { userId: 'notifications-librarian', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'employee-id' };
const inactiveMember = { ...member, userId: 'notifications-inactive', accountStatus: 'INACTIVE' };
const usersById = new Map([member, otherMember, librarian, inactiveMember].map((user) => [user.userId, user]));
const users = { getById: async (userId) => usersById.get(userId) };
const notification = {
  notificationId: 'notification-one', recipientUserId: member.userId, notificationType: 'RESERVATION_READY',
  message: 'Your reservation is ready.', referenceType: null, referenceId: null,
  createdAt: Timestamp.fromDate(new Date('2026-10-19T10:20:30.000Z')), read: false,
};
const calls = [];
let readCalls = 0;
let failReadUpdate = false;
let nextCursor = null;
const repository = {
  async notificationPreview(actor) { calls.push({ method: 'preview', actor }); return [notification]; },
  async notificationHistory(actor, limit, cursor) {
    calls.push({ method: 'history', actor, limit, cursor });
    return { items: [notification], nextCursor };
  },
  async getNotification(id, actor) {
    calls.push({ method: 'detail', id, actor });
    if (id === 'foreign-notification') throw new StorageError('FORBIDDEN', 'Notification belongs to another account.');
    return notification;
  },
  async markNotificationRead(id, actor) {
    calls.push({ method: 'read', id, actor });
    readCalls += 1;
    if (failReadUpdate) throw new Error('simulated Firestore write failure');
    notification.read = true;
  },
};

const app = express();
app.use(session({ secret: 'member-notifications-api-test-secret', resave: false, saveUninitialized: false }));
app.get('/__test/session/:userId', (request, response) => {
  request.session.userId = request.params.userId;
  request.session.accountType = usersById.get(request.params.userId)?.accountType;
  response.json({ ok: true });
});
app.use('/api/v1/member/notifications', createMemberNotificationsRouter(repository, users));
app.use(apiErrorHandler);

let server;
let apiOrigin;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

async function signedInCookie(userId) {
  const response = await fetch(`${apiOrigin}/__test/session/${userId}`);
  return response.headers.getSetCookie().find((value) => value.startsWith('connect.sid='))?.split(';')[0];
}
async function get(path, cookie) {
  return fetch(`${apiOrigin}/api/v1/member/notifications${path}`, { headers: cookie ? { Cookie: cookie } : {} });
}

test('preview and history expose member envelopes, actor scope, ISO timestamps, and a serialized cursor', async () => {
  calls.length = 0;
  const cookie = await signedInCookie(member.userId);
  const previewResponse = await get('/preview', cookie);
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.deepEqual(preview.items[0], { ...notification, createdAt: '2026-10-19T10:20:30.000Z' });

  const historyResponse = await get('/?limit=7', cookie);
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.deepEqual(history, {
    items: [{ ...notification, createdAt: '2026-10-19T10:20:30.000Z' }],
    page: { limit: 7, nextCursor: null },
  });
  assert.equal(calls[0].actor.userId, member.userId);
  assert.equal(calls[1].actor.userId, member.userId);
  assert.equal(calls[1].limit, 7);
});

test('history accepts a member-matched cursor and rejects unknown, out-of-range, malformed, or mismatched query values', async () => {
  const cookie = await signedInCookie(member.userId);
  nextCursor = { recipientUserId: member.userId, createdAtSeconds: 10, createdAtNanoseconds: 2, notificationId: 'n1' };
  const firstPage = await get('/', cookie);
  assert.equal(firstPage.status, 200);
  const encodedNextCursor = (await firstPage.json()).page.nextCursor;
  assert.deepEqual(JSON.parse(Buffer.from(encodedNextCursor, 'base64url').toString('utf8')), nextCursor);
  nextCursor = null;
  const cursor = Buffer.from(JSON.stringify({ recipientUserId: member.userId, createdAtSeconds: 10, createdAtNanoseconds: 2, notificationId: 'n1' })).toString('base64url');
  assert.equal((await get(`/?limit=3&cursor=${cursor}`, cookie)).status, 200);
  assert.deepEqual(calls.at(-1).cursor, { recipientUserId: member.userId, createdAtSeconds: 10, createdAtNanoseconds: 2, notificationId: 'n1' });

  for (const query of ['?unexpected=1', '?limit=0', '?limit=101', '?cursor=not-json', `?cursor=${Buffer.from(JSON.stringify({ recipientUserId: otherMember.userId, createdAtSeconds: 10, createdAtNanoseconds: 2, notificationId: 'n1' })).toString('base64url')}`]) {
    const response = await get(`/${query}`, cookie);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', query);
  }
});

test('members can read and mark their own notification, while foreign IDs are denied', async () => {
  notification.read = false;
  failReadUpdate = false;
  const cookie = await signedInCookie(member.userId);
  const detail = await get('/notification-one', cookie);
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), { notification: { ...notification, createdAt: '2026-10-19T10:20:30.000Z' } });

  const foreign = await get('/foreign-notification', cookie);
  assert.equal(foreign.status, 403);
  const foreignRead = await fetch(`${apiOrigin}/api/v1/member/notifications/foreign-notification/read`, { method: 'PATCH', headers: { Cookie: cookie } });
  assert.equal(foreignRead.status, 403);
  const read = await fetch(`${apiOrigin}/api/v1/member/notifications/notification-one/read`, { method: 'PATCH', headers: { Cookie: cookie } });
  assert.equal(read.status, 204);
  assert.equal(await read.text(), '');
  const repeatedRead = await fetch(`${apiOrigin}/api/v1/member/notifications/notification-one/read`, { method: 'PATCH', headers: { Cookie: cookie } });
  assert.equal(repeatedRead.status, 204);
  assert.equal(readCalls, 1);
  assert.equal(calls.at(-1).actor.userId, member.userId);
});

test('failed read update returns an error and leaves the notification unread for retry', async () => {
  notification.read = false;
  failReadUpdate = true;
  const cookie = await signedInCookie(member.userId);
  const failed = await fetch(`${apiOrigin}/api/v1/member/notifications/notification-one/read`, {
    method: 'PATCH', headers: { Cookie: cookie },
  });
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).error.code, 'INTERNAL_ERROR');
  assert.equal(notification.read, false, 'the API must not expose a successful read state after a failed write');
  assert.equal(calls.at(-1).method, 'read');

  failReadUpdate = false;
  const retried = await fetch(`${apiOrigin}/api/v1/member/notifications/notification-one/read`, {
    method: 'PATCH', headers: { Cookie: cookie },
  });
  assert.equal(retried.status, 204);
  assert.equal(notification.read, true);
  failReadUpdate = false;
});

test('signed-out, inactive, and librarian sessions cannot use member notification routes', async () => {
  const signedOut = await get('/preview');
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');
  for (const user of [inactiveMember, librarian]) {
    const response = await get('/preview', await signedInCookie(user.userId));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'FORBIDDEN');
  }
});

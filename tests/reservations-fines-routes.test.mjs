import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { createReservationsFinesRouter } from '../dist/apps/api/src/routes/reservations-fines.js';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';

const usersById = new Map([
  ['member-1', { userId: 'member-1', name: 'Member', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'MEMBER-1' }],
  ['inactive-1', { userId: 'inactive-1', name: 'Inactive', accountType: 'LIBRARIAN', accountStatus: 'INACTIVE', employeeId: 'EMP-2', isManager: false }],
  ['librarian-1', { userId: 'librarian-1', name: 'Librarian', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'EMP-1', isManager: false }],
]);
const calls = [];
const reservation = { reservationId: 'reservation-1', memberId: 'MEMBER-1', isbn: '978-1', copyId: null, reservationDateTime: '2026-01-01T00:00:00.000Z', expiryDate: null, status: 'PENDING' };
const fine = { fineId: 'fine-1', loanId: 'loan-1', memberId: 'MEMBER-1', bookTitle: 'Book', amountMinorUnits: 500, currency: 'SGD', reason: 'Overdue loan', status: 'OUTSTANDING', issuedDateTime: '2026-01-01T00:00:00.000Z', paidDateTime: null, waivedDateTime: null };
const notification = { notificationId: 'message-1', recipientUserId: 'member-1', notificationType: 'LIBRARIAN_MESSAGE', referenceType: null, referenceId: null, message: 'Please visit the library.', createdAt: '2026-01-01T00:00:00.000Z', read: false };
const workflows = {
  async listReservations(input, actor) { calls.push(['reservations', input, actor.userId]); return { items: [reservation], nextCursor: null }; },
  async getLibrarianReservation(id, actor) { calls.push(['reservation', id, actor.userId]); return reservation; },
  async listFines(input, actor) { calls.push(['fines', input, actor.userId]); return { items: [fine], nextCursor: null }; },
  async getLibrarianFine(id, actor) { calls.push(['fine', id, actor.userId]); return fine; },
  async waiveFine(id, actor) { calls.push(['waive', id, actor.userId]); return { fine: { ...fine, status: 'WAIVED' }, notification: { ...notification, notificationId: 'fine-updated-fine-1', notificationType: 'FINE_UPDATED' } }; },
  async sendLibrarianMessage(input, actor, key) { calls.push(['message', input, actor.userId, key]); return { notification }; },
};

const app = express();
app.use(express.json());
app.use(session({ secret: 'reservation-fine-route-test-session-secret-long', resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' } }));
app.get('/__test/session/:userId', (request, response) => {
  const user = usersById.get(request.params.userId);
  if (!user) return response.sendStatus(404);
  request.session.userId = user.userId;
  request.session.accountType = user.accountType;
  response.json({ ok: true });
});
app.use('/api/v1', createReservationsFinesRouter(workflows, { async getById(userId) { return usersById.get(userId); } }, 'reservation-fine-route-cursor-secret-long'));
app.use(apiErrorHandler);

let server;
let apiOrigin;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function sessionCookie(userId) {
  const response = await fetch(`${apiOrigin}/__test/session/${userId}`);
  return response.headers.getSetCookie().find((value) => value.startsWith('connect.sid=')).split(';')[0];
}
async function request(path, init = {}) {
  return fetch(`${apiOrigin}${path}`, { ...init, headers: { ...(init.headers ?? {}) } });
}

test('librarian reservation/fine routes require a current active librarian', async () => {
  assert.equal((await request('/api/v1/librarian/reservations')).status, 401);
  assert.equal((await request('/api/v1/librarian/reservations', { headers: { Cookie: await sessionCookie('inactive-1') } })).status, 403);
  assert.equal((await request('/api/v1/librarian/reservations', { headers: { Cookie: await sessionCookie('member-1') } })).status, 403);
  assert.equal((await request('/api/v1/librarian/reservations', { headers: { Cookie: await sessionCookie('librarian-1') } })).status, 200);
});

test('bounded list routes use safe DTOs and reject forged query fields', async () => {
  const cookie = await sessionCookie('librarian-1');
  const before = calls.length;
  const invalid = await request('/api/v1/librarian/fines?status=OUTSTANDING&recipientUserId=member-1', { headers: { Cookie: cookie } });
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, before);
  const reservations = await request('/api/v1/librarian/reservations?limit=1&status=PENDING', { headers: { Cookie: cookie } });
  assert.equal(reservations.status, 200);
  assert.equal((await reservations.json()).items[0].passwordHash, undefined);
  const fines = await request('/api/v1/librarian/fines?limit=1', { headers: { Cookie: cookie } });
  const fineBody = await fines.json();
  assert.equal(fines.status, 200);
  assert.equal(fineBody.items[0].passwordHash, undefined);
  assert.equal(fineBody.items[0].amountMinorUnits, 500);
});

test('waiver and message routes enforce strict mutation/idempotency contracts', async () => {
  const cookie = await sessionCookie('librarian-1');
  const before = calls.length;
  const invalidWaiver = await request('/api/v1/librarian/fines/fine-1/waive', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'WAIVED' }) });
  assert.equal(invalidWaiver.status, 400);
  assert.equal(calls.length, before);
  const missingKey = await request('/api/v1/librarian/notifications', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'MEMBER-1', message: 'Please visit.' }) });
  assert.equal(missingKey.status, 400);
  const waived = await request('/api/v1/librarian/fines/fine-1/waive', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(waived.status, 200);
  const waivedBody = await waived.json();
  assert.equal(waivedBody.fine.status, 'WAIVED');
  assert.equal(waivedBody.notification.recipientUserId, undefined);
  const message = await request('/api/v1/librarian/notifications', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': 'message-2026-10-22-0001' }, body: JSON.stringify({ memberId: 'MEMBER-1', message: 'Please visit.' }) });
  assert.equal(message.status, 201);
  const messageBody = await message.json();
  assert.equal(messageBody.notification.notificationType, 'LIBRARIAN_MESSAGE');
  assert.equal(messageBody.notification.recipientUserId, undefined);
});

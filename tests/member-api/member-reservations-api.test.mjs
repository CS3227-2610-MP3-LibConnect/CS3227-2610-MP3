import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { apiErrorHandler } from '../../dist/apps/api/src/http/errors.js';
import { StorageError } from '../../dist/apps/api/src/storage/repositories.js';
import { createMemberReservationRouter } from '../../dist/apps/api/src/routes/member-reservations.js';

const member = {
  userId: 'reservation-member', name: 'Reservation Member', email: 'reservation@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'reservation-member-id',
};
const librarian = {
  userId: 'reservation-librarian', name: 'Reservation Librarian', email: 'librarian@example.test',
  accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'reservation-employee-id',
};
const inactiveMember = { ...member, userId: 'inactive-reservation-member', accountStatus: 'INACTIVE' };
const usersById = new Map([[member.userId, member], [librarian.userId, librarian], [inactiveMember.userId, inactiveMember]]);
const users = { getById: async (userId) => usersById.get(userId) };
const pending = {
  reservationId: 'reservation-1', memberId: member.memberId, isbn: '9780000000001', status: 'PENDING',
  reservationDateTime: '2026-10-20T00:00:00.000Z', copyId: null, expiryDate: null,
};
const calls = [];
let createError;
let cancelError;
let listError;
const reservationCursor = {
  memberId: member.memberId, view: 'pending', reservationDateTimeSeconds: 1792454400,
  reservationDateTimeNanoseconds: 0, reservationId: 'reservation-1',
};
const reservationItem = { ...pending, bookTitle: 'Example Book' };
const repository = {
  async memberReservations(actor, view, limit, cursor) {
    calls.push({ operation: 'list', actor, view, limit, cursor });
    if (listError) throw listError;
    return { items: [reservationItem], nextCursor: reservationCursor };
  },
};
const workflows = {
  async memberReservation(isbn, actor) {
    calls.push({ operation: 'lookup', isbn, actor });
    return isbn === pending.isbn ? pending : null;
  },
  async createMemberReservation(isbn, actor) {
    calls.push({ operation: 'create', isbn, actor });
    if (createError) throw createError;
    return { ...pending, isbn, reservationDateTime: new Date().toISOString() };
  },
  async cancelMemberReservation(reservationId, actor) {
    calls.push({ operation: 'cancel', reservationId, actor });
    if (cancelError) throw cancelError;
  },
};

const app = express();
app.use(session({ secret: 'member-reservations-api-test-session-secret', resave: false, saveUninitialized: false }));
app.use(express.json());
app.get('/__test/session/:userId', (request, response) => {
  request.session.userId = request.params.userId;
  request.session.accountType = usersById.get(request.params.userId)?.accountType;
  response.json({ ok: true });
});
app.use('/api/v1/member', createMemberReservationRouter(repository, workflows, users));
app.use(apiErrorHandler);

let server;
let apiOrigin;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function signedInCookie(userId) {
  const response = await fetch(`${apiOrigin}/__test/session/${userId}`);
  return response.headers.getSetCookie().find((value) => value.startsWith('connect.sid='))?.split(';')[0];
}

test('GET reservation lookup returns the member pending reservation or null and uses authenticated identity', async () => {
  const cookie = await signedInCookie(member.userId);
  const found = await fetch(`${apiOrigin}/api/v1/member/reservations/by-isbn/${pending.isbn}`, { headers: { Cookie: cookie } });
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), pending);
  assert.equal(calls.at(-1).operation, 'lookup');
  assert.equal(calls.at(-1).actor.memberId, member.memberId);

  const absent = await fetch(`${apiOrigin}/api/v1/member/reservations/by-isbn/9780000000002`, { headers: { Cookie: cookie } });
  assert.equal(absent.status, 200);
  assert.equal(await absent.json(), null);
});

test('GET reservation list returns the paginated envelope with default limit and encoded cursor', async () => {
  const cookie = await signedInCookie(member.userId);
  const response = await fetch(`${apiOrigin}/api/v1/member/reservations`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.items, [reservationItem]);
  assert.equal(body.page.limit, 20);
  assert.deepEqual(JSON.parse(Buffer.from(body.page.nextCursor, 'base64url').toString('utf8')), reservationCursor);
  assert.deepEqual(calls.at(-1), {
    operation: 'list', actor: member, view: 'pending', limit: 20, cursor: undefined,
  });
});

test('GET reservation list parses view, limit, and cursor and delegates them with the authenticated actor', async () => {
  const cookie = await signedInCookie(member.userId);
  const encoded = Buffer.from(JSON.stringify(reservationCursor)).toString('base64url');
  const response = await fetch(`${apiOrigin}/api/v1/member/reservations?view=pending&limit=7&cursor=${encoded}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1).operation, 'list');
  assert.equal(calls.at(-1).actor.memberId, member.memberId);
  assert.equal(calls.at(-1).view, 'pending');
  assert.equal(calls.at(-1).limit, 7);
  assert.deepEqual(calls.at(-1).cursor, reservationCursor);

  const history = await fetch(`${apiOrigin}/api/v1/member/reservations?view=history&limit=50`, { headers: { Cookie: cookie } });
  assert.equal(history.status, 200);
  assert.equal(calls.at(-1).view, 'history');
  assert.equal(calls.at(-1).limit, 50);
});

test('GET reservation list rejects invalid query parameters and malformed or cross-bound cursors', async () => {
  const cookie = await signedInCookie(member.userId);
  const foreignMember = Buffer.from(JSON.stringify({ ...reservationCursor, memberId: 'someone-else' })).toString('base64url');
  const foreignView = Buffer.from(JSON.stringify({ ...reservationCursor, view: 'history' })).toString('base64url');
  const invalidJson = Buffer.from('not json').toString('base64url');
  const invalidShape = Buffer.from(JSON.stringify({ memberId: member.memberId, view: 'pending' })).toString('base64url');
  for (const query of [
    '?view=other', '?limit=0', '?limit=51', '?limit=1.5', '?cursor=not-a-cursor',
    `?cursor=${foreignMember}`, `?cursor=${foreignView}`, `?cursor=${invalidJson}`, `?cursor=${invalidShape}`,
  ]) {
    const beforeCount = calls.length;
    const response = await fetch(`${apiOrigin}/api/v1/member/reservations${query}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', query);
    assert.equal(calls.length, beforeCount, query);
  }
});

test('GET reservation list maps storage failures to the established error envelope', async () => {
  const cookie = await signedInCookie(member.userId);
  listError = new StorageError('CONFLICT', 'Reservation data changed.');
  try {
    const response = await fetch(`${apiOrigin}/api/v1/member/reservations?view=history`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: { code: 'CONFLICT', message: 'Reservation data changed.' } });
  }
  finally { listError = undefined; }
});

test('reservation list rejects signed-out and non-member callers before workflow invocation', async () => {
  const beforeCount = calls.length;
  const signedOut = await fetch(`${apiOrigin}/api/v1/member/reservations`);
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');
  for (const userId of [librarian.userId, inactiveMember.userId]) {
    const cookie = await signedInCookie(userId);
    const denied = await fetch(`${apiOrigin}/api/v1/member/reservations`, { headers: { Cookie: cookie } });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'FORBIDDEN');
  }
  assert.equal(calls.length, beforeCount);
});

test('POST accepts only a strict ISBN body and creates for the authenticated member', async () => {
  const cookie = await signedInCookie(member.userId);
  const created = await fetch(`${apiOrigin}/api/v1/member/reservations`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ isbn: pending.isbn }),
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).isbn, pending.isbn);
  assert.equal(calls.at(-1).operation, 'create');
  assert.equal(calls.at(-1).actor.memberId, member.memberId);

  for (const body of [{ isbn: '' }, { isbn: pending.isbn, memberId: 'forged-member' }, { isbn: pending.isbn, userId: 'forged-user' }]) {
    const rejected = await fetch(`${apiOrigin}/api/v1/member/reservations`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(rejected.status, 400, JSON.stringify(body));
    assert.equal((await rejected.json()).error.code, 'VALIDATION_ERROR');
  }
});

test('DELETE returns 204 and passes authenticated actor to the cancellation workflow', async () => {
  const cookie = await signedInCookie(member.userId);
  const response = await fetch(`${apiOrigin}/api/v1/member/reservations/${pending.reservationId}`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(response.status, 204);
  assert.equal(calls.at(-1).operation, 'cancel');
  assert.equal(calls.at(-1).reservationId, pending.reservationId);
  assert.equal(calls.at(-1).actor.memberId, member.memberId);
});

test('DELETE rejects invalid reservation identifiers before invoking the cancellation workflow', async () => {
  const cookie = await signedInCookie(member.userId);
  const beforeCount = calls.length;
  const response = await fetch(`${apiOrigin}/api/v1/member/reservations/${'r'.repeat(129)}`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  assert.equal(calls.length, beforeCount);
});

test('DELETE rejects signed-out, librarian, and inactive callers before cancellation', async () => {
  const beforeCount = calls.length;
  const signedOut = await fetch(`${apiOrigin}/api/v1/member/reservations/${pending.reservationId}`, { method: 'DELETE' });
  assert.equal(signedOut.status, 401);
  for (const userId of [librarian.userId, inactiveMember.userId]) {
    const cookie = await signedInCookie(userId);
    const denied = await fetch(`${apiOrigin}/api/v1/member/reservations/${pending.reservationId}`, { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal(denied.status, 403);
  }
  assert.equal(calls.length, beforeCount);
});

test('signed-out, librarian, and inactive member requests are denied before workflow invocation', async () => {
  const beforeCount = calls.length;
  const signedOut = await fetch(`${apiOrigin}/api/v1/member/reservations/by-isbn/${pending.isbn}`);
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');

  for (const userId of [librarian.userId, inactiveMember.userId]) {
    const cookie = await signedInCookie(userId);
    const denied = await fetch(`${apiOrigin}/api/v1/member/reservations/by-isbn/${pending.isbn}`, { headers: { Cookie: cookie } });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'FORBIDDEN');
  }
  assert.equal(calls.length, beforeCount);
});

test('duplicate or stale workflow conflict returns a safe 409 API error envelope', async () => {
  const cookie = await signedInCookie(member.userId);
  createError = new StorageError('CONFLICT', 'A pending reservation already exists for this title.');
  try {
    const response = await fetch(`${apiOrigin}/api/v1/member/reservations`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ isbn: pending.isbn }),
    });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, 'CONFLICT');
    assert.equal(typeof body.error.message, 'string');
    assert.deepEqual(Object.keys(body), ['error']);
  }
  finally { createError = undefined; }
});

test('ownership failure maps to 403 without leaking storage details', async () => {
  const cookie = await signedInCookie(member.userId);
  cancelError = new StorageError('FORBIDDEN', 'Members may access only their own reservations.');
  try {
    const response = await fetch(`${apiOrigin}/api/v1/member/reservations/another-members-reservation`, { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'FORBIDDEN');
  }
  finally { cancelError = undefined; }
});

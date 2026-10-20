import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { apiErrorHandler } from '../../dist/apps/api/src/http/errors.js';
import { StorageError } from '../../dist/apps/api/src/storage/repositories.js';
import { createMemberFinesRouter } from '../../dist/apps/api/src/routes/member-fines.js';

const member = { userId: 'fine-member', name: 'Fine Member', email: 'fine@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'fine-member-id' };
const otherMember = { ...member, userId: 'other-fine-member', memberId: 'other-fine-member-id' };
const librarian = { userId: 'fine-librarian', name: 'Fine Librarian', email: 'librarian@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'fine-employee-id' };
const inactiveMember = { ...member, userId: 'inactive-fine-member', accountStatus: 'INACTIVE' };
const usersById = new Map([member, otherMember, librarian, inactiveMember].map((user) => [user.userId, user]));
const users = { getById: async (userId) => usersById.get(userId) };
const calls = [];
const fine = { fineId: 'fine-1', memberId: member.memberId, loanId: 'loan-1', bookTitle: 'A Book', amountMinorUnits: 250, currency: 'SGD', reason: 'Late return', status: 'OUTSTANDING' };
const repository = {
  async memberFines(actor, view, limit, cursor) {
    calls.push({ operation: 'list', actor, view, limit, cursor });
    return { items: [fine], nextCursor: view === 'history' ? {
      memberId: actor.memberId, view: 'history', issuedDateTimeSeconds: 1_797_840_000,
      issuedDateTimeNanoseconds: 0, fineId: 'fine-1',
    } : null };
  },
};
const workflows = {
  async payFine(fineId, actor) {
    calls.push({ operation: 'pay', fineId, actor });
    if (fineId === 'foreign') throw new StorageError('FORBIDDEN', 'Fine belongs to another member.');
    if (fineId === 'paid') throw new StorageError('CONFLICT', 'Fine is not outstanding.');
    return { ...fine, fineId, status: 'PAID', paidDateTime: '2026-10-20T00:00:00.000Z' };
  },
};

const app = express();
app.use(session({ secret: 'member-fines-api-test-session-secret', resave: false, saveUninitialized: false }));
app.use(express.json());
app.get('/__test/session/:userId', (request, response) => {
  request.session.userId = request.params.userId;
  request.session.accountType = usersById.get(request.params.userId)?.accountType;
  response.json({ ok: true });
});
app.use('/api/v1/member', createMemberFinesRouter(repository, workflows, users));
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

test('fine list defaults to outstanding view and page size 20, scoped to authenticated actor', async () => {
  const cookie = await signedInCookie(member.userId);
  const response = await fetch(`${apiOrigin}/api/v1/member/fines`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [fine], page: { limit: 20, nextCursor: null } });
  assert.deepEqual({ operation: calls.at(-1).operation, view: calls.at(-1).view, limit: calls.at(-1).limit, actorId: calls.at(-1).actor.memberId },
    { operation: 'list', view: 'outstanding', limit: 20, actorId: member.memberId });
});

test('fine history accepts bounded pages and returns an opaque cursor in the standard envelope', async () => {
  const cookie = await signedInCookie(member.userId);
  const response = await fetch(`${apiOrigin}/api/v1/member/fines?view=history&limit=50`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.items, [fine]);
  assert.equal(body.page.limit, 50);
  assert.equal(typeof body.page.nextCursor, 'string');
  assert.ok(body.page.nextCursor.length > 0);
  assert.equal(calls.at(-1).view, 'history');
  assert.equal(calls.at(-1).limit, 50);
  const next = await fetch(`${apiOrigin}/api/v1/member/fines?view=history&limit=50&cursor=${encodeURIComponent(body.page.nextCursor)}`, { headers: { Cookie: cookie } });
  assert.equal(next.status, 200);
  assert.deepEqual(calls.at(-1).cursor, {
    memberId: member.memberId, view: 'history', issuedDateTimeSeconds: 1_797_840_000,
    issuedDateTimeNanoseconds: 0, fineId: fine.fineId,
  });
});

test('fine list rejects unknown query keys, invalid limits, and malformed or view-mismatched cursors with validation envelope', async () => {
  const cookie = await signedInCookie(member.userId);
  const listCallsBeforeInvalidRequests = calls.filter((call) => call.operation === 'list').length;
  for (const query of ['?memberId=forged', '?view=all', '?limit=0', '?limit=51', '?limit=1.5', '?cursor=not-a-cursor', '?view=outstanding&cursor=eyJ2aWV3IjoiaGlzdG9yeSJ9']) {
    const response = await fetch(`${apiOrigin}/api/v1/member/fines${query}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', query);
  }
  assert.equal(calls.filter((call) => call.operation === 'list').length, listCallsBeforeInvalidRequests, 'invalid queries must not reach storage');
});

test('payment takes no payment details and delegates fine ID with authenticated actor', async () => {
  const cookie = await signedInCookie(member.userId);
  const response = await fetch(`${apiOrigin}/api/v1/member/fines/fine-1/pay`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 200);
  await response.json();
  assert.deepEqual(calls.at(-1), { operation: 'pay', fineId: 'fine-1', actor: member });
  const withDetails = await fetch(`${apiOrigin}/api/v1/member/fines/fine-1/pay`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ cardNumber: '4111111111111111' }),
  });
  assert.equal(withDetails.status, 400);
  assert.equal((await withDetails.json()).error.code, 'VALIDATION_ERROR');
});

test('payment maps cross-member ownership and stale status failures to safe API errors', async () => {
  const cookie = await signedInCookie(member.userId);
  for (const [fineId, status, code] of [['foreign', 403, 'FORBIDDEN'], ['paid', 409, 'CONFLICT']]) {
    const response = await fetch(`${apiOrigin}/api/v1/member/fines/${fineId}/pay`, { method: 'POST', headers: { Cookie: cookie }, body: '{}' });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.equal(Object.hasOwn(body, 'stack'), false);
  }
});

test('signed-out, inactive, and librarian users cannot list or pay member fines', async () => {
  const signedOut = await fetch(`${apiOrigin}/api/v1/member/fines`);
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');
  for (const user of [inactiveMember, librarian]) {
    const cookie = await signedInCookie(user.userId);
    for (const [path, options] of [['fines', {}], ['fines/fine-1/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }]]) {
      const response = await fetch(`${apiOrigin}/api/v1/member/${path}`, { ...options, headers: { ...options.headers, Cookie: cookie } });
      assert.equal(response.status, 403, `${user.userId} ${path}`);
      assert.equal((await response.json()).error.code, 'FORBIDDEN');
    }
  }
  assert.equal(calls.some((call) => call.actor?.accountType === 'LIBRARIAN'), false);
});

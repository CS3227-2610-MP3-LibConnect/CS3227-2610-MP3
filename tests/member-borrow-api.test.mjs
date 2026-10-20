import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';
import { createMemberBorrowRouter } from '../dist/apps/api/src/routes/member-borrow.js';

const member = {
  userId: 'borrow-member', name: 'Borrow Member', email: 'borrow@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'borrow-member-id',
};
const librarian = {
  userId: 'borrow-librarian', name: 'Borrow Librarian', email: 'librarian@example.test',
  accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'borrow-employee-id',
};
const inactiveMember = { ...member, userId: 'inactive-borrow-member', accountStatus: 'INACTIVE' };
const usersById = new Map([[member.userId, member], [librarian.userId, librarian], [inactiveMember.userId, inactiveMember]]);
const users = { getById: async (userId) => usersById.get(userId) };
const copy = { copyId: 'copy-1', isbn: '9780000000001', status: 'AVAILABLE', shelfLocation: 'A1' };
const book = { isbn: copy.isbn, title: 'A Borrowable Book', author: 'A. Author' };
const calls = [];
const workflows = {
  async memberBorrowCapacity(actor) {
    calls.push({ operation: 'capacity', actor });
    return { activeLoanCount: 2, remainingSlots: 8 };
  },
  async checkMemberBorrowCopy(copyId, actor) {
    calls.push({ operation: 'stage', copyId, actor });
    if (copyId === 'missing') {
      const error = new Error('Record was not found.');
      error.code = 'NOT_FOUND';
      throw error;
    }
    return { copy: { ...copy, copyId }, book };
  },
  async confirmMemberBorrow(copyIds, actor) {
    calls.push({ operation: 'confirm', copyIds, actor });
    return copyIds.map((copyId) => copyId === 'copy-unavailable'
      ? { copyId, success: false, reason: 'Copy is not available to borrow.' }
      : { copyId, success: true, loan: { loanId: `loan-${copyId}`, memberId: actor.memberId, copyId, status: 'ACTIVE' } });
  },
};

const app = express();
app.use(session({ secret: 'member-borrow-api-test-session-secret', resave: false, saveUninitialized: false }));
app.use(express.json());
app.get('/__test/session/:userId', (request, response) => {
  request.session.userId = request.params.userId;
  request.session.accountType = usersById.get(request.params.userId)?.accountType;
  response.json({ ok: true });
});
app.use('/api/v1/member', createMemberBorrowRouter(workflows, users));
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

test('member capacity endpoint returns current count and remaining slots for authenticated actor', async () => {
  const cookie = await signedInCookie(member.userId);
  const response = await fetch(`${apiOrigin}/api/v1/member/borrow-capacity`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { activeLoanCount: 2, remainingSlots: 8 });
  assert.equal(calls.at(-1).actor.memberId, member.memberId);
});

test('add-copy accepts copyId, returns card data, and maps unknown IDs through the API error envelope', async () => {
  const cookie = await signedInCookie(member.userId);
  const success = await fetch(`${apiOrigin}/api/v1/member/borrow-items`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ copyId: copy.copyId }),
  });
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { copy, book });
  assert.equal(calls.at(-1).operation, 'stage');

  const missing = await fetch(`${apiOrigin}/api/v1/member/borrow-items`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ copyId: 'missing' }),
  });
  assert.equal(missing.status, 404);
  assert.deepEqual((await missing.json()).error.code, 'NOT_FOUND');
});

test('borrow request bodies reject malformed values and unknown fields using validation envelope', async () => {
  const cookie = await signedInCookie(member.userId);
  const invalidBodies = [
    ['borrow-items', { copyId: '' }],
    ['borrow-items', { copyId: 'copy-1', memberId: 'forged-member' }],
    ['loans', { copyIds: [] }],
    ['loans', { copyIds: ['copy-1'], memberId: 'forged-member' }],
    ['loans', { copyIds: ['copy-1', ''] }],
  ];
  for (const [path, body] of invalidBodies) {
    const response = await fetch(`${apiOrigin}/api/v1/member/${path}`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', JSON.stringify(body));
  }
});

test('confirmation uses authenticated member identity and returns one outcome per submitted copy ID', async () => {
  const cookie = await signedInCookie(member.userId);
  const copyIds = ['copy-1', 'copy-unavailable', 'copy-2'];
  const response = await fetch(`${apiOrigin}/api/v1/member/loans`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ copyIds }),
  });
  assert.equal(response.status, 201);
  const { outcomes } = await response.json();
  assert.deepEqual(outcomes.map((outcome) => outcome.copyId), copyIds);
  assert.equal(outcomes.length, copyIds.length);
  assert.equal(outcomes[0].success, true);
  assert.equal(outcomes[1].success, false);
  assert.match(outcomes[1].reason, /available/i);
  assert.equal(outcomes[2].success, true);
  assert.equal(outcomes[0].loan.memberId, member.memberId);
  assert.equal(calls.at(-1).actor.memberId, member.memberId);
});

test('signed-out, librarian, and inactive member requests cannot invoke member borrow operations', async () => {
  const signedOut = await fetch(`${apiOrigin}/api/v1/member/borrow-capacity`);
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');

  const librarianCookie = await signedInCookie(librarian.userId);
  const forbidden = await fetch(`${apiOrigin}/api/v1/member/borrow-capacity`, { headers: { Cookie: librarianCookie } });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, 'FORBIDDEN');
  assert.notEqual(calls.at(-1).actor?.accountType, 'LIBRARIAN');

  const inactiveCookie = await signedInCookie(inactiveMember.userId);
  const inactive = await fetch(`${apiOrigin}/api/v1/member/borrow-capacity`, { headers: { Cookie: inactiveCookie } });
  assert.equal(inactive.status, 403);
  assert.equal((await inactive.json()).error.code, 'FORBIDDEN');
});

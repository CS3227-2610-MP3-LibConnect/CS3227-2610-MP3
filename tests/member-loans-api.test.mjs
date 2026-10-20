import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';
import { createMemberBorrowRouter } from '../dist/apps/api/src/routes/member-borrow.js';

const member = {
  userId: 'loans-member', name: 'Loans Member', email: 'loans@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'loans-member-id',
};
const otherMember = {
  userId: 'loans-other-member', name: 'Other Member', email: 'other@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'other-member-id',
};
const librarian = {
  userId: 'loans-librarian', name: 'Loans Librarian', email: 'librarian@example.test',
  accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'loans-employee-id',
};
const inactiveMember = { ...member, userId: 'loans-inactive-member', accountStatus: 'INACTIVE' };
const usersById = new Map([member, otherMember, librarian, inactiveMember].map((user) => [user.userId, user]));
const users = { getById: async (userId) => usersById.get(userId) };

const ownLoan = {
  loanId: 'own-loan', memberId: member.memberId, bookTitle: 'A Member Book',
  dueDate: '2026-11-20T00:00:00.000Z', status: 'ACTIVE', returnDateTime: null,
};
const foreignLoan = {
  loanId: 'foreign-loan', memberId: otherMember.memberId, bookTitle: 'Another Member Book',
  dueDate: '2026-11-19T00:00:00.000Z', status: 'ACTIVE', returnDateTime: null,
};
const calls = [];
let failure;
let writeCalls = 0;
const workflows = {
  async memberLoans(actor) {
    calls.push({ actor });
    if (failure) throw failure;
    // Model the storage boundary: the authenticated actor's member ID selects records.
    return [ownLoan, foreignLoan].filter((loan) => loan.memberId === actor.memberId);
  },
  async memberBorrowCapacity() { return { activeLoanCount: 0, remainingSlots: 10 }; },
  async checkMemberBorrowCopy() { return {}; },
  async confirmMemberBorrow() { writeCalls += 1; return []; },
};

const app = express();
app.use(session({ secret: 'member-loans-api-test-session-secret', resave: false, saveUninitialized: false }));
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

test('GET member loans uses authenticated actor ownership and returns only safe loan data', async () => {
  calls.length = 0;
  const cookie = await signedInCookie(member.userId);
  const response = await fetch(`${apiOrigin}/api/v1/member/loans?memberId=${otherMember.memberId}`, {
    headers: { Cookie: cookie },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.loans, [ownLoan]);
  assert.equal(JSON.stringify(body).includes(foreignLoan.loanId), false);
  assert.equal(JSON.stringify(body).includes('passwordHash'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actor.memberId, member.memberId);
  assert.equal(calls[0].actor.userId, member.userId);
  assert.equal(writeCalls, 0);
});

test('signed-out, non-member, and inactive-member requests cannot list loans', async () => {
  calls.length = 0;
  const signedOut = await fetch(`${apiOrigin}/api/v1/member/loans`);
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');

  const librarianCookie = await signedInCookie(librarian.userId);
  const librarianResponse = await fetch(`${apiOrigin}/api/v1/member/loans`, { headers: { Cookie: librarianCookie } });
  assert.equal(librarianResponse.status, 403);
  assert.equal((await librarianResponse.json()).error.code, 'FORBIDDEN');

  const inactiveCookie = await signedInCookie(inactiveMember.userId);
  const inactiveResponse = await fetch(`${apiOrigin}/api/v1/member/loans`, { headers: { Cookie: inactiveCookie } });
  assert.equal(inactiveResponse.status, 403);
  assert.equal((await inactiveResponse.json()).error.code, 'FORBIDDEN');
  assert.equal(calls.length, 0);
});

test('loan-list storage errors use the API error envelope and do not mutate loans or copies', async () => {
  const cookie = await signedInCookie(member.userId);
  failure = new StorageError('NOT_FOUND', 'Loan records were not found.');
  try {
    const response = await fetch(`${apiOrigin}/api/v1/member/loans`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: 'NOT_FOUND', message: 'Loan records were not found.' },
    });
    assert.equal(writeCalls, 0);
  }
  finally {
    failure = undefined;
  }
});

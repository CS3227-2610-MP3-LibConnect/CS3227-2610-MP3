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
const reportCalls = [];
const renewalCalls = [];
let failure;
let reportFailure;
let renewalFailure;
let renewalResult;
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
  async reportClosure(loanId, reportType, actor) {
    reportCalls.push({ loanId, reportType, actor });
    if (reportFailure) throw reportFailure;
    return { loanId, memberId: actor.memberId, status: 'PENDING_CLOSE', closureReportType: reportType };
  },
  async renewMemberLoan(loanId, actor) {
    renewalCalls.push({ loanId, actor });
    if (renewalFailure) throw renewalFailure;
    return renewalResult;
  },
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

test('closure report accepts only the strict report body and delegates using the active session actor', async () => {
  reportCalls.length = 0;
  const cookie = await signedInCookie(member.userId);
  const response = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/closure-report`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType: 'RETURNED' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(reportCalls, [{ loanId: 'own-loan', reportType: 'RETURNED', actor: member }]);
  assert.equal(writeCalls, 0);
});

test('closure report rejects invalid or extra body fields with the validation envelope', async () => {
  reportCalls.length = 0;
  const cookie = await signedInCookie(member.userId);
  for (const body of [
    { reportType: 'DAMAGED' },
    { reportType: 'LOST', memberId: otherMember.memberId },
    {},
  ]) {
    const response = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/closure-report`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  }
  assert.equal(reportCalls.length, 0);
});

test('signed-out, inactive, and librarian actors cannot submit closure reports', async () => {
  reportCalls.length = 0;
  const signedOut = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/closure-report`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportType: 'LOST' }),
  });
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');

  for (const [user, expectedCode] of [[inactiveMember, 'FORBIDDEN'], [librarian, 'FORBIDDEN']]) {
    const cookie = await signedInCookie(user.userId);
    const response = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/closure-report`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportType: 'LOST' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, expectedCode);
  }
  assert.equal(reportCalls.length, 0);
});

test('foreign loan ownership and stale loan/copy state return safe workflow errors', async () => {
  const cookie = await signedInCookie(member.userId);
  for (const [loanId, workflowError] of [
    ['foreign-loan', new StorageError('FORBIDDEN', 'The loan does not belong to this member.')],
    ['own-loan', new StorageError('CONFLICT', 'The loan or copy state has changed.')],
  ]) {
    reportFailure = workflowError;
    try {
      const response = await fetch(`${apiOrigin}/api/v1/member/loans/${loanId}/closure-report`, {
        method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'LOST' }),
      });
      assert.equal(response.status, workflowError.code === 'CONFLICT' ? 409 : 403);
      assert.equal((await response.json()).error.code, workflowError.code);
    }
    finally {
      reportFailure = undefined;
    }
  }
});

test('renewal delegates the loan ID and authenticated actor, returning an updated safe summary', async () => {
  renewalCalls.length = 0;
  const cookie = await signedInCookie(member.userId);
  renewalResult = {
    loanId: 'own-loan', bookTitle: 'A Member Book', dueDate: '2026-12-20T00:00:00.000Z',
    status: 'ACTIVE', isRenewed: true, closureReportType: null, returnDateTime: null,
  };
  const response = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/renew?memberId=${otherMember.memberId}`, {
    method: 'POST', headers: { Cookie: cookie },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.loan ?? body, renewalResult);
  assert.equal(JSON.stringify(body).includes('memberId'), false);
  assert.equal(JSON.stringify(body).includes('copyId'), false);
  assert.deepEqual(renewalCalls, [{ loanId: 'own-loan', actor: member }]);
});

test('renewal validates loan IDs and rejects a client-supplied member ID', async () => {
  renewalCalls.length = 0;
  const cookie = await signedInCookie(member.userId);
  const oversizedLoanId = 'x'.repeat(129);
  const invalid = await fetch(`${apiOrigin}/api/v1/member/loans/${oversizedLoanId}/renew`, {
    method: 'POST', headers: { Cookie: cookie },
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');

  const injected = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/renew`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: otherMember.memberId }),
  });
  assert.equal(injected.status, 400);
  assert.equal((await injected.json()).error.code, 'VALIDATION_ERROR');
  assert.equal(renewalCalls.length, 0);
});

test('renewal rejects signed-out, inactive-member, and librarian requests before workflow delegation', async () => {
  renewalCalls.length = 0;
  const signedOut = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/renew`, { method: 'POST' });
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');

  for (const user of [inactiveMember, librarian]) {
    const cookie = await signedInCookie(user.userId);
    const response = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/renew`, {
      method: 'POST', headers: { Cookie: cookie },
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'FORBIDDEN');
  }
  assert.equal(renewalCalls.length, 0);
});

test('renewal maps missing, foreign-owner, and ineligible workflow errors to established API errors', async () => {
  renewalCalls.length = 0;
  const cookie = await signedInCookie(member.userId);
  for (const [error, expectedStatus] of [
    [new StorageError('NOT_FOUND', 'Loan was not found.'), 404],
    [new StorageError('FORBIDDEN', 'Members may renew only their own loans.'), 403],
    [new StorageError('CONFLICT', 'Loan is no longer eligible for renewal.'), 409],
  ]) {
    renewalFailure = error;
    try {
      const response = await fetch(`${apiOrigin}/api/v1/member/loans/own-loan/renew`, {
        method: 'POST', headers: { Cookie: cookie },
      });
      assert.equal(response.status, expectedStatus);
      assert.equal((await response.json()).error.code, error.code);
    }
    finally {
      renewalFailure = undefined;
    }
  }
  assert.equal(renewalCalls.length, 3);
});

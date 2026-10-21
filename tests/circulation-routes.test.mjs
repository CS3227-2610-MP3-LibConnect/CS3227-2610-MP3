import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { createCirculationRouter } from '../dist/apps/api/src/routes/circulation.js';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';

const usersById = new Map([
  ['member-1', { userId: 'member-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'MEMBER-1' }],
  ['inactive-1', { userId: 'inactive-1', name: 'Inactive', email: 'inactive@example.test', accountType: 'LIBRARIAN', accountStatus: 'INACTIVE', employeeId: 'EMP-2', isManager: false }],
  ['member-2', { userId: 'member-2', name: 'Second Member', email: 'member2@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'MEMBER-2' }],
  ['librarian-1', { userId: 'librarian-1', name: 'Librarian', email: 'librarian@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'EMP-1', isManager: false }],
]);
const calls = [];
const loan = {
  loanId: 'loan-1', memberId: 'MEMBER-1', copyId: 'copy-1', isbn: 'isbn-1', bookTitle: 'Book',
  borrowDateTime: '2026-01-01T00:00:00.000Z', dueDate: '2026-01-31T00:00:00.000Z',
  returnDateTime: null, closureReportType: 'RETURNED', closureReportedDateTime: null,
  closureReviewedDateTime: null, closureReviewDecision: null, status: 'PENDING_CLOSE', isRenewed: false,
};
const copy = { copyId: 'copy-1', isbn: 'isbn-1', shelfLocation: 'A-1', status: 'IN_TRANSIT', reservationId: null };
const workflows = {
  async createLoan(input, actor) { calls.push(['createLoan', input, actor.userId]); return { loan: { ...loan, status: 'ACTIVE', closureReportType: null }, copy: { ...copy, status: 'ON_LOAN' } }; },
  async listPendingClose(input, actor) { calls.push(['queue', input, actor.userId]); return { items: [{ loan, copy }], nextCursor: { lastBorrowDateTime: '2026-01-01T00:00:00.000Z', lastLoanId: 'loan-1' } }; },
  async returnPreview(loanId, actor) { calls.push(['preview', loanId, actor.userId]); return { loan, copy, earliestReservation: null, allowedDispositions: ['AVAILABLE', 'DAMAGED'] }; },
  async reviewClosure(loanId, decision, disposition, actor) { calls.push(['review', loanId, decision, disposition, actor.userId]); return { loan: { ...loan, status: 'CLOSED_RETURNED' }, copy: { ...copy, status: disposition } }; },
  async reportClosure(loanId, reportType, actor) { calls.push(['report', loanId, reportType, actor.userId]); },
};

const app = express();
app.use(express.json());
app.use(session({ secret: 'circulation-route-test-session-secret-long-enough', resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' } }));
app.get('/__test/session/:userId', (request, response) => {
  const user = usersById.get(request.params.userId);
  if (!user) return response.sendStatus(404);
  request.session.userId = user.userId;
  request.session.accountType = user.accountType;
  response.json({ ok: true });
});
app.use('/api/v1', createCirculationRouter(workflows, { async getById(userId) { return usersById.get(userId); } }, 'circulation-route-cursor-secret-long-enough'));
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

test('librarian circulation routes require the server-loaded active librarian', async () => {
  assert.equal((await request('/api/v1/librarian/loans/pending-close')).status, 401);
  assert.equal((await request('/api/v1/librarian/loans/pending-close', { headers: { Cookie: await sessionCookie('inactive-1') } })).status, 403);
  assert.equal((await request('/api/v1/librarian/loans/pending-close', { headers: { Cookie: await sessionCookie('member-1') } })).status, 403);
  assert.equal((await request('/api/v1/librarian/loans/pending-close', { headers: { Cookie: await sessionCookie('librarian-1') } })).status, 200);
});

test('strict schemas reject forged fields before workflow calls', async () => {
  const cookie = await sessionCookie('librarian-1');
  const before = calls.length;
  const response = await request('/api/v1/librarian/loans', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: 'MEMBER-1', copyId: 'copy-1', accountType: 'LIBRARIAN', status: 'ACTIVE' }),
  });
  assert.equal(response.status, 400);
  assert.equal(calls.length, before);
  const invalidReview = await request('/api/v1/librarian/loans/loan-1/review', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'REJECT', disposition: 'AVAILABLE' }),
  });
  assert.equal(invalidReview.status, 400);
  assert.equal(calls.length, before);
});

test('queue, preview, review, and member report use safe route contracts', async () => {
  const librarianCookie = await sessionCookie('librarian-1');
  const queue = await request('/api/v1/librarian/loans/pending-close?limit=1', { headers: { Cookie: librarianCookie } });
  assert.equal(queue.status, 200);
  const queueBody = await queue.json();
  assert.equal(queueBody.items[0].loan.passwordHash, undefined);
  assert.match(queueBody.page.nextCursor, /^[^.]+\.[^.]+$/);
  const preview = await request('/api/v1/librarian/loans/loan-1/return-preview', { headers: { Cookie: librarianCookie } });
  assert.deepEqual((await preview.json()).allowedDispositions, ['AVAILABLE', 'DAMAGED']);
  const review = await request('/api/v1/librarian/loans/loan-1/review', {
    method: 'POST', headers: { Cookie: librarianCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'CONFIRM', disposition: 'AVAILABLE' }),
  });
  assert.equal(review.status, 200);
  const memberCookie = await sessionCookie('member-1');
  const report = await request('/api/v1/member/loans/loan-1/closure-report', {
    method: 'POST', headers: { Cookie: memberCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType: 'RETURNED' }),
  });
  assert.equal(report.status, 204);
  assert.equal(calls.at(-1)[0], 'report');
});

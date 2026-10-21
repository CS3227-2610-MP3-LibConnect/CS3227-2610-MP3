import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closureReportRequestSchema,
  createLoanRequestSchema,
  pendingCloseQuerySchema,
  reviewRequestSchema,
  safeLoan,
  safeTransitionSummary,
} from '../dist/apps/api/src/http/circulation-contracts.js';

test('circulation request schemas are strict and bounded', () => {
  assert.equal(createLoanRequestSchema.safeParse({ memberId: 'member-1', copyId: 'copy-1' }).success, true);
  assert.equal(createLoanRequestSchema.safeParse({ memberId: 'member-1', copyId: 'copy-1', accountType: 'LIBRARIAN' }).success, false);
  assert.equal(createLoanRequestSchema.safeParse({ memberId: 'member/1', copyId: 'copy-1' }).success, false);
  assert.equal(closureReportRequestSchema.safeParse({ reportType: 'RETURNED', memberId: 'forged' }).success, false);
  assert.equal(reviewRequestSchema.safeParse({ decision: 'REJECT', disposition: 'AVAILABLE' }).success, false);
  assert.equal(reviewRequestSchema.safeParse({ decision: 'CONFIRM', disposition: 'RESERVED' }).success, true);
  assert.deepEqual(pendingCloseQuerySchema.parse({ limit: '10' }), { limit: 10 });
  assert.equal(pendingCloseQuerySchema.safeParse({ limit: '51' }).success, false);
});

test('circulation DTOs allowlist response fields', () => {
  const loan = safeLoan({
    loanId: 'loan-1', memberId: 'member-1', copyId: 'copy-1', isbn: 'isbn-1', bookTitle: 'Book',
    borrowDateTime: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    dueDate: { toDate: () => new Date('2026-01-31T00:00:00.000Z') }, status: 'ACTIVE', isRenewed: false,
    passwordHash: 'must-not-appear', sessionId: 'must-not-appear',
  });
  assert.equal(loan.passwordHash, undefined);
  assert.equal(loan.sessionId, undefined);
  assert.deepEqual(Object.keys(loan).sort(), [
    'bookTitle', 'borrowDateTime', 'closureReportType', 'closureReportedDateTime',
    'closureReviewDecision', 'closureReviewedDateTime', 'copyId', 'dueDate', 'isbn',
    'isRenewed', 'loanId', 'memberId', 'returnDateTime', 'status',
  ].sort());
  const summary = safeTransitionSummary({ loan, copy: { copyId: 'copy-1', isbn: 'isbn-1', shelfLocation: 'A-1', status: 'AVAILABLE' } });
  assert.equal(summary.loan.passwordHash, undefined);
  assert.equal(summary.copy.passwordHash, undefined);
});

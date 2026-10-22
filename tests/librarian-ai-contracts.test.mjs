import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import {
  draftModelOutputSchema,
  notificationDraftRequestSchema,
  pendingReportsSummaryRequestSchema,
  summaryModelOutputSchema,
} from '../dist/apps/api/src/ai/librarian-assistant-contracts.js';
import { LibrarianAssistantContext } from '../dist/apps/api/src/storage/librarian-assistant-context.js';

test('assistant request contracts are strict, bounded, and reject forged authority fields', () => {
  assert.equal(pendingReportsSummaryRequestSchema.safeParse({ loanIds: ['loan-1', 'loan-2'] }).success, true);
  assert.equal(pendingReportsSummaryRequestSchema.safeParse({ loanIds: ['loan-1', 'loan-1'] }).success, false);
  assert.equal(pendingReportsSummaryRequestSchema.safeParse({ loanIds: ['loan-1'], accountType: 'LIBRARIAN' }).success, false);
  assert.equal(pendingReportsSummaryRequestSchema.safeParse({ loanIds: ['loan/1'] }).success, false);
  assert.equal(notificationDraftRequestSchema.safeParse({ sourceType: 'PENDING_REPORT', sourceId: 'loan-1', purpose: 'RETURN_FOLLOW_UP' }).success, true);
  assert.equal(notificationDraftRequestSchema.safeParse({ sourceType: 'PENDING_REPORT', sourceId: 'loan-1', purpose: 'OVERDUE', memberId: 'forged' }).success, false);
});

test('assistant model contracts reject extra authority fields and unsafe HTML-like output', () => {
  const item = { loanId: 'loan-1', reportType: 'RETURNED', facts: 'The report is awaiting review.', action: 'VERIFY_RETURN' };
  assert.equal(summaryModelOutputSchema.safeParse({ summary: 'Review the pending return.', items: [item], uncertainty: null }).success, true);
  assert.equal(summaryModelOutputSchema.safeParse({ summary: 'Review.', items: [{ ...item, approved: true }], uncertainty: null }).success, false);
  assert.equal(draftModelOutputSchema.safeParse({ message: '<script>alert(1)</script>', rationale: 'Follow up.', warning: null }).success, false);
});

function fakeDb(records) {
  return {
    collection(name) {
      return {
        doc(id) {
          return { async get() { const value = records[name]?.[id]; return { exists: value !== undefined, data: () => value }; } };
        },
        where(field, operator, value) {
          return { limit() { return { async get() { const found = Object.entries(records.users ?? {}).find(([, user]) => user[field] === value); return { docs: found ? [{ id: found[0], data: () => found[1] }] : [] }; } }; } };
        },
      };
    },
  };
}

test('context loader re-reads the loan/copy/member and returns minimum fields only', async () => {
  const now = Timestamp.fromDate(new Date('2026-10-22T00:00:00.000Z'));
  const db = fakeDb({
    loans: { 'loan-1': { memberId: 'member-1', copyId: 'copy-1', isbn: 'isbn-1', bookTitle: 'Book', borrowDateTime: now, dueDate: now, returnDateTime: null, closureReportType: 'RETURNED', closureReportedDateTime: now, closureReviewedDateTime: null, closureReviewDecision: null, status: 'PENDING_CLOSE', isRenewed: false } },
    bookCopies: { 'copy-1': { isbn: 'isbn-1', shelfLocation: 'A-1', status: 'IN_TRANSIT', createdAt: now, updatedAt: now } },
    users: { 'user-1': { name: 'Member', email: 'member@example.test', emailCanonical: 'member@example.test', passwordHash: 'hash-not-exposed', registrationDateTime: now, accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'member-1' } },
  });
  const context = await new LibrarianAssistantContext(db).loadPendingReports(['loan-1']);
  assert.deepEqual(context, [{ loanId: 'loan-1', memberId: 'member-1', copyId: 'copy-1', isbn: 'isbn-1', bookTitle: 'Book', dueDate: '2026-10-22T00:00:00.000Z', closureReportType: 'RETURNED', closureReportedDateTime: '2026-10-22T00:00:00.000Z', copyStatus: 'IN_TRANSIT', memberAccountStatus: 'ACTIVE' }]);
  assert.equal(JSON.stringify(context).includes('passwordHash'), false);
});

test('context loader rejects stale state before any provider call can be made', async () => {
  const now = Timestamp.fromDate(new Date('2026-10-22T00:00:00.000Z'));
  const db = fakeDb({
    loans: { 'loan-1': { memberId: 'member-1', copyId: 'copy-1', isbn: 'isbn-1', bookTitle: 'Book', borrowDateTime: now, dueDate: now, returnDateTime: null, closureReportType: null, closureReportedDateTime: null, closureReviewedDateTime: null, closureReviewDecision: null, status: 'ACTIVE', isRenewed: false } },
  });
  await assert.rejects(new LibrarianAssistantContext(db).loadPendingReports(['loan-1']), /no longer awaiting closure review/);
});

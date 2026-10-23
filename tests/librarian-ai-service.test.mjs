import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LibrarianAssistantService } from '../dist/apps/api/src/ai/librarian-assistant-service.js';

const actor = {
  userId: 'librarian-1',
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
  isManager: false,
};
const report = {
  loanId: 'loan-1',
  memberId: 'member-1',
  copyId: 'copy-1',
  isbn: 'isbn-1',
  bookTitle: 'Book',
  dueDate: '2026-10-01T00:00:00.000Z',
  closureReportType: 'RETURNED',
  closureReportedDateTime: '2026-10-20T00:00:00.000Z',
  copyStatus: 'IN_TRANSIT',
  memberAccountStatus: 'ACTIVE',
};

function serviceWith(content, reports = [report]) {
  const calls = [];
  const context = {
    async loadPendingReports(ids) {
      calls.push(ids);
      return reports.filter((item) => ids.includes(item.loanId));
    },
  };
  const llm = {
    async complete(input) {
      calls.push(input);
      return { content, model: 'gemma4:26b', correlationId: 'correlation-1' };
    },
  };
  return { service: new LibrarianAssistantService(context, llm), calls };
}

test('summary service returns server-matched advisory items and excludes raw context fields', async () => {
  const { service, calls } = serviceWith(
    JSON.stringify({
      summary: 'Review the pending return.',
      items: [
        {
          loanId: 'loan-1',
          reportType: 'RETURNED',
          facts: 'The copy is awaiting verification.',
          action: 'VERIFY_RETURN',
        },
      ],
      uncertainty: null,
    }),
  );
  const result = await service.summarize({ loanIds: ['loan-1'] }, actor);
  assert.equal(result.advisory, true);
  assert.equal(result.requiresHumanApproval, true);
  assert.equal(result.items[0].memberId, 'member-1');
  assert.equal(JSON.stringify(calls[1]).includes('passwordHash'), false);
  assert.equal(JSON.stringify(calls[1]).includes('member@example.test'), false);
});

test('summary service rejects hallucinated or mismatched report IDs without returning a success', async () => {
  const { service } = serviceWith(
    JSON.stringify({
      summary: 'Review.',
      items: [
        {
          loanId: 'other-loan',
          reportType: 'RETURNED',
          facts: 'Invented.',
          action: 'VERIFY_RETURN',
        },
      ],
      uncertainty: null,
    }),
  );
  await assert.rejects(service.summarize({ loanIds: ['loan-1'] }, actor), /could not be matched/);
});

test('draft service attaches server-owned metadata and never accepts model authority fields', async () => {
  const { service, calls } = serviceWith(
    JSON.stringify({
      message: 'Please review the returned copy at your convenience.',
      rationale: 'Follow-up on the pending report.',
      warning: null,
    }),
  );
  const result = await service.draft(
    { sourceType: 'PENDING_REPORT', sourceId: 'loan-1', purpose: 'RETURN_FOLLOW_UP' },
    actor,
  );
  assert.deepEqual(
    {
      sourceType: result.sourceType,
      sourceId: result.sourceId,
      memberId: result.memberId,
      notificationType: result.notificationType,
      referenceType: result.referenceType,
      referenceId: result.referenceId,
      requiresHumanApproval: result.requiresHumanApproval,
    },
    {
      sourceType: 'PENDING_REPORT',
      sourceId: 'loan-1',
      memberId: 'member-1',
      notificationType: 'LIBRARIAN_MESSAGE',
      referenceType: null,
      referenceId: null,
      requiresHumanApproval: true,
    },
  );
  assert.equal(JSON.stringify(calls[1]).includes('recipientUserId'), false);
});

test('draft service rejects inactive members and purpose mismatches before the provider call', async () => {
  const inactive = { ...report, memberAccountStatus: 'INACTIVE' };
  const inactiveResult = serviceWith(
    JSON.stringify({ message: 'Follow up.', rationale: 'Review.', warning: null }),
    [inactive],
  );
  await assert.rejects(
    inactiveResult.service.draft(
      { sourceType: 'PENDING_REPORT', sourceId: 'loan-1', purpose: 'RETURN_FOLLOW_UP' },
      actor,
    ),
    /active members/,
  );
  assert.equal(inactiveResult.calls.length, 1);

  const mismatch = serviceWith(
    JSON.stringify({ message: 'Follow up.', rationale: 'Review.', warning: null }),
  );
  await assert.rejects(
    mismatch.service.draft(
      { sourceType: 'PENDING_REPORT', sourceId: 'loan-1', purpose: 'LOSS_FOLLOW_UP' },
      actor,
    ),
    /purpose does not match/,
  );
  assert.equal(mismatch.calls.length, 1);
});

test('unsafe structured output is rejected as unavailable', async () => {
  const { service } = serviceWith(
    JSON.stringify({ message: '<script>alert(1)</script>', rationale: 'Review.', warning: null }),
  );
  await assert.rejects(
    service.draft(
      { sourceType: 'PENDING_REPORT', sourceId: 'loan-1', purpose: 'RETURN_FOLLOW_UP' },
      actor,
    ),
    /could not be validated/,
  );
});

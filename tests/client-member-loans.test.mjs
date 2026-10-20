import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { borrowApi } from '../dist/apps/client/src/api/borrow.js';
import { MemberLoanCard } from '../dist/apps/client/src/components/MemberLoanCard.js';
import { formatLoanDueDate, isBeforeSingaporeDueDateCutoff, loanCardTreatment, loansForView } from '../dist/apps/client/src/pages/member-loan-view.js';

async function withFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('member loan-list client uses the cookie-authenticated read-only endpoint and decodes due dates', async () => {
  const loans = [
    { loanId: 'iso-loan', bookTitle: 'ISO Date Book', dueDate: '2026-11-20T00:00:00.000Z', status: 'ACTIVE', isRenewed: false },
    { loanId: 'timestamp-loan', bookTitle: 'Timestamp Book', dueDate: { seconds: 1795132800, nanoseconds: 0 }, status: 'CLOSED_RETURNED', isRenewed: true },
  ];

  await withFetch(async (url, init) => {
    assert.match(String(url), /\/api\/v1\/member\/loans$/);
    assert.equal(init.method, undefined);
    assert.equal(init.credentials, 'include');
    return Response.json({ loans });
  }, async () => {
    const result = await borrowApi.listLoans();
    assert.equal(result.length, 2);
    assert.equal(result[0].dueDate, '2026-11-20T00:00:00.000Z');
    assert.equal(result[1].dueDate, '2026-11-20T00:00:00.000Z');
    assert.equal(result[0].isRenewed, false);
    assert.equal(result[1].isRenewed, true);
  });
});

test('My Loans separates ACTIVE from all past statuses and only marks overdue active cards with disabled Return', () => {
  const loans = [
    { loanId: 'active-overdue', bookTitle: 'Overdue', dueDate: '2026-01-01T00:00:00.000Z', status: 'ACTIVE' },
    { loanId: 'active-current', bookTitle: 'Current', dueDate: '2026-12-01T00:00:00.000Z', status: 'ACTIVE' },
    { loanId: 'returned', bookTitle: 'Returned', dueDate: '2025-12-01T00:00:00.000Z', status: 'CLOSED_RETURNED' },
    { loanId: 'pending-close', bookTitle: 'Pending close', dueDate: '2025-12-01T00:00:00.000Z', status: 'PENDING_CLOSE' },
  ];
  assert.deepEqual(loansForView(loans, 'active').map(({ loanId }) => loanId), ['active-overdue', 'active-current']);
  assert.deepEqual(loansForView(loans, 'past').map(({ loanId }) => loanId), ['returned', 'pending-close']);
  assert.deepEqual(loanCardTreatment(loans[0], Date.parse('2026-02-01T00:00:00.000Z')), { overdue: true, showDisabledReturn: true });
  assert.deepEqual(loanCardTreatment(loans[1], Date.parse('2026-02-01T00:00:00.000Z')), { overdue: false, showDisabledReturn: true });
  assert.deepEqual(loanCardTreatment(loans[2], Date.parse('2026-02-01T00:00:00.000Z')), { overdue: false, showDisabledReturn: false });
  assert.equal(formatLoanDueDate('not-a-date'), 'Date unavailable');
  const overdueMarkup = renderToStaticMarkup(React.createElement(MemberLoanCard, { loan: loans[0], now: Date.parse('2026-02-01T00:00:00.000Z') }));
  const returnedMarkup = renderToStaticMarkup(React.createElement(MemberLoanCard, { loan: loans[2], now: Date.parse('2026-02-01T00:00:00.000Z') }));
  assert.match(overdueMarkup, /class="member-loan-card member-loan-card-overdue"/);
  assert.match(overdueMarkup, /<h2>Overdue<\/h2>/);
  assert.match(overdueMarkup, /<time dateTime="2026-01-01T00:00:00.000Z">/);
  assert.ok(overdueMarkup.includes(`>${formatLoanDueDate(loans[0].dueDate)}</time>`), 'the card should show a formatted due date');
  assert.match(overdueMarkup, /<button type="button" disabled="">Return<\/button>/);
  assert.match(returnedMarkup, /<h2>Returned<\/h2>/);
  assert.doesNotMatch(returnedMarkup, />Return</);
  const styles = readFileSync(resolve('apps/client/src/styles.css'), 'utf8');
  assert.match(styles, /\.member-loan-card-overdue\s*\{[^}]*background:\s*#fff1f2/);
});

test('member loan mapper rejects a missing or non-boolean renewal state', async () => {
  for (const isRenewed of [undefined, 'false', 0, null]) {
    await withFetch(async () => Response.json({ loans: [{
      loanId: 'loan-1', bookTitle: 'Book', dueDate: '2026-11-20T00:00:00.000Z', status: 'ACTIVE', isRenewed,
    }] }), async () => {
      await assert.rejects(borrowApi.listLoans(), /Loan record is invalid/);
    });
  }
});

test('Singapore due-day cutoff governs overdue and renewal presentation independent of local timezone', () => {
  const loan = {
    loanId: 'due-boundary', bookTitle: 'Boundary Book',
    // Singapore due date is 2026-01-01; the next Singapore day begins at 16:00Z.
    dueDate: '2026-01-01T00:00:00.000Z', status: 'ACTIVE', isRenewed: false,
  };
  const moments = [
    Date.parse('2026-01-01T15:59:59.999Z'),
    Date.parse('2026-01-01T16:00:00.000Z'),
  ];

  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ['America/Los_Angeles', 'Pacific/Auckland']) {
      process.env.TZ = timezone;
      assert.equal(loanCardTreatment(loan, moments[0]).overdue, false);
      assert.equal(loanCardTreatment(loan, moments[1]).overdue, true);
      assert.equal(isBeforeSingaporeDueDateCutoff(loan.dueDate, moments[0]), true);
      assert.equal(isBeforeSingaporeDueDateCutoff(loan.dueDate, moments[1]), false);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
  assert.equal(isBeforeSingaporeDueDateCutoff('invalid', moments[0]), false);
  assert.equal(isBeforeSingaporeDueDateCutoff(loan.dueDate, Number.NaN), false);
});

test('member renewal API posts through the authenticated client and maps the updated loan summary', async () => {
  const renewed = {
    loanId: 'loan-1', bookTitle: 'A Book', dueDate: '2026-12-20T00:00:00.000Z',
    status: 'ACTIVE', isRenewed: true, closureReportType: null, returnDateTime: null,
  };
  await withFetch(async (url, init) => {
    assert.match(String(url), /\/api\/v1\/member\/loans\/loan-1\/renew$/);
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'include');
    assert.equal(init.body, undefined);
    return Response.json({ loan: renewed });
  }, async () => {
    const loan = await borrowApi.renewLoan('loan-1');
    assert.equal(loan.dueDate, renewed.dueDate);
    assert.equal(loan.isRenewed, true);
    assert.equal(loan.status, 'ACTIVE');
    assert.equal('memberId' in loan, false);
    assert.equal('copyId' in loan, false);
  });
});

test('My Loans renewal action is limited to eligible active loans and submits without confirmation', () => {
  const card = readFileSync(resolve('apps/client/src/components/MemberLoanCard.tsx'), 'utf8');
  const page = readFileSync(resolve('apps/client/src/pages/MemberLoans.tsx'), 'utf8');

  assert.match(card, /isBeforeSingaporeDueDateCutoff/);
  assert.match(card, /loan\.status\s*===\s*'ACTIVE'/);
  assert.match(card, /!loan\.isRenewed/);
  assert.match(card, /Renew/);
  assert.match(card, /onRenew/);
  assert.match(card, /disabled=\{[^}]*renew/i, 'renewal submission disables the action while in flight');
  assert.match(page, /borrowApi\.renewLoan\(/);
  assert.match(page, /if\s*\([^)]*renew[^)]*\)\s*return/i, 'a renewal already in progress is ignored');
  assert.doesNotMatch(page, /Confirm renewal|Renew this book\?/i, 'renewal does not require a confirmation dialog');
});

test('My Loans renewal success trusts the server loan and exposes dismissible accessible feedback', () => {
  const card = readFileSync(resolve('apps/client/src/components/MemberLoanCard.tsx'), 'utf8');
  const page = readFileSync(resolve('apps/client/src/pages/MemberLoans.tsx'), 'utf8');

  assert.match(page, /await borrowApi\.renewLoan\(/);
  assert.match(page, /setLoans\([^;]*renewedLoan|setLoans\([^;]*updatedLoan|setLoans\([^;]*serverLoan/is,
    'success stores the summary returned by the renewal API');
  assert.match(page, /dueDate/);
  assert.match(page, /isRenewed/);
  assert.match(card, /loan\.isRenewed/);
  assert.match(page, /role="status"/);
  assert.match(page, /setRenewalFeedback\(null\)|onClick=\{\(\) => setFeedback\(null\)\}/i,
    'the renewal confirmation has a dismissal path');
  assert.match(page, /<button[^>]*aria-label=["'][^"']*(?:renewal|dismiss|close)[^"']*["'][^>]*onClick=/i,
    'the renewal feedback dismissal control has an accessible name');
});

test('My Loans renewal failures retain confirmed loan data and stale eligibility refreshes with an explanation', () => {
  const page = readFileSync(resolve('apps/client/src/pages/MemberLoans.tsx'), 'utf8');

  assert.match(page, /cause\.status\s*===\s*409/);
  assert.match(page, /await refreshLoans\(\)/);
  assert.match(page, /no longer (?:be )?renewable|can no longer be renewed|no longer eligible to renew/i);
  assert.match(page, /Keep the last confirmed|last confirmed loan|renewal failed/i);
  assert.match(page, /role="alert"/);
  assert.doesNotMatch(page, /setLoans\([^;]*dueDate\s*:/s,
    'a failed request does not optimistically change the confirmed due date');
  assert.doesNotMatch(page, /copyId|reservation/i,
    'renewal client behavior does not mutate copy or reservation state');
});

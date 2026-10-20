import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { borrowApi } from '../dist/apps/client/src/api/borrow.js';
import { MemberLoanCard } from '../dist/apps/client/src/components/MemberLoanCard.js';
import { formatLoanDueDate, loanCardTreatment, loansForView } from '../dist/apps/client/src/pages/member-loan-view.js';

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
    { loanId: 'iso-loan', bookTitle: 'ISO Date Book', dueDate: '2026-11-20T00:00:00.000Z', status: 'ACTIVE' },
    { loanId: 'timestamp-loan', bookTitle: 'Timestamp Book', dueDate: { seconds: 1795132800, nanoseconds: 0 }, status: 'CLOSED_RETURNED' },
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

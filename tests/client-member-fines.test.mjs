import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fineApi } from '../dist/apps/client/src/api/fines.js';
import { formatFineAmount } from '../dist/apps/client/src/pages/MemberFines.js';

const source = (path) => readFileSync(resolve(path), 'utf8');

async function withFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try { await run(); }
  finally { globalThis.fetch = originalFetch; }
}

test('fine client sends bounded view/cursor queries and a bodyless payment request', async () => {
  await withFetch(async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, '/api/v1/member/fines');
    assert.equal(parsed.searchParams.get('view'), 'history');
    assert.equal(parsed.searchParams.get('limit'), '20');
    assert.equal(parsed.searchParams.get('cursor'), 'opaque-cursor');
    assert.equal(init.credentials, 'include');
    return Response.json({ items: [], page: { limit: 20, nextCursor: null } });
  }, async () => {
    const result = await fineApi.listFines('history', 'opaque-cursor');
    assert.deepEqual(result, { items: [], page: { limit: 20, nextCursor: null } });
  });

  await withFetch(async (url, init) => {
    assert.match(String(url), /\/api\/v1\/member\/fines\/fine-1\/pay$/);
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'include');
    assert.equal(init.body, undefined);
    return Response.json({ success: true });
  }, async () => {
    assert.deepEqual(await fineApi.payFine('fine-1'), { success: true });
  });
});

test('fine money display uses integer minor units and explicitly labels SGD', () => {
  const base = { fineId: 'fine-1', loanId: 'loan-1', memberId: 'member-1', bookTitle: 'A book', amountMinorUnits: 123456, currency: 'SGD', reason: 'Overdue', status: 'OUTSTANDING', issuedDateTime: '2026-01-01T00:00:00.000Z', paidDateTime: null, waivedDateTime: null };
  assert.equal(formatFineAmount(base), 'SGD 1,234.56');
  assert.equal(formatFineAmount({ ...base, amountMinorUnits: Number.MAX_SAFE_INTEGER }), 'SGD 90,071,992,547,409.91');
  assert.equal(formatFineAmount({ ...base, amountMinorUnits: Number.NaN }), 'Amount unavailable');
});

test('typed fine client lists a selected view with cursor pagination and pays by fine ID', () => {
  const apiSource = source('apps/client/src/api/fines.ts');
  assert.match(apiSource, /export\s+interface\s+MemberFine\b/);
  assert.match(apiSource, /amountMinorUnits\s*:\s*number/);
  assert.match(apiSource, /currency\s*:\s*['"]SGD['"]/);
  assert.match(apiSource, /status\s*:\s*['"]OUTSTANDING['"]\s*\|\s*['"]PAID['"]\s*\|\s*['"]WAIVED['"]/);
  assert.match(apiSource, /nextCursor\s*:\s*string\s*\|\s*null/);
  assert.match(apiSource, /apiRequest[^(]*\([^)]*\/member\/fines/);
  assert.match(apiSource, /view=|URLSearchParams/);
  assert.match(apiSource, /cursor/);
  assert.match(apiSource, /method\s*:\s*['"]POST['"]/);
  assert.match(apiSource, /\/pay/);
});

test('My Fines is routed to the member page and renders separate outstanding and history views', () => {
  const appSource = source('apps/client/src/App.tsx');
  const pageSource = source('apps/client/src/pages/MemberFines.tsx');
  assert.match(appSource, /\/member\/profile\/fines[^\n]*<MemberFines\s*\/>/);
  assert.match(pageSource, /export\s+function\s+MemberFines/);
  assert.match(pageSource, /MemberProfileHub/);
  assert.match(pageSource, /outstanding/i);
  assert.match(pageSource, /history/i);
  assert.match(pageSource, /nextCursor|cursor/);
  assert.match(pageSource, /IntersectionObserver|loadMore|Load more|onScroll/i);
});

test('fine payment dialog is accessible, cancelable without submitting, and prevents duplicate requests', () => {
  const pageSource = source('apps/client/src/pages/MemberFines.tsx');
  assert.match(pageSource, /role=["']dialog["']/);
  assert.match(pageSource, /aria-modal=["']true["']/);
  assert.match(pageSource, /aria-labelledby=/);
  assert.match(pageSource, /Escape|onKeyDown/);
  assert.match(pageSource, /Pay Fine/);
  assert.match(pageSource, /Confirm Payment/i);
  assert.match(pageSource, /Cancel|Close/);
  assert.match(pageSource, /fineApi\.payFine\s*\(/);
  assert.match(pageSource, /submitting|inFlight|paymentPending/i);
  assert.match(pageSource, /disabled=\{[^}]*(submitting|inFlight|paymentPending)/i);
  assert.match(pageSource, /role=["']status["']|aria-live=/);
  assert.match(pageSource, /role=["']alert["']/);
});

test('fine display includes required details, safe minor-unit formatting, retry, and server refresh behavior', () => {
  const pageSource = source('apps/client/src/pages/MemberFines.tsx');
  assert.match(pageSource, /bookTitle/);
  assert.match(pageSource, /reason/);
  assert.match(pageSource, /issuedDateTime/);
  assert.match(pageSource, /amountMinorUnits/);
  assert.match(pageSource, /currency/);
  assert.match(pageSource, /format.*Fine|format.*Money|Intl\.NumberFormat|toLocaleString/i);
  assert.match(pageSource, /Math\.floor|BigInt|amountMinorUnits\s*\/\s*100/);
  assert.match(pageSource, /status\s*===\s*['"]OUTSTANDING['"]|OUTSTANDING/);
  assert.match(pageSource, /retry|Retry/);
  assert.match(pageSource, /refresh|loadFines|listFines/);
  assert.match(pageSource, /409|CONFLICT|stale/i);
  assert.match(pageSource, /headingRef|triggerRef\.current\s*=\s*heading/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const pageSource = await readFile(new URL('../../apps/client/src/pages/MemberBorrow.tsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../../apps/client/src/api/borrow.ts', import.meta.url), 'utf8');

test('confirmation dialog lists all staged books and provides confirm and cancel actions', () => {
  assert.match(pageSource, /<dialog\b|role=["']dialog["']|aria-modal=["']true["']/i,
    'staged books should be reviewed in a dialog');
  assert.match(pageSource, /copies\.map\s*\([^)]*(?:book\.title|title)/s,
    'the dialog should list the books represented by staged copies');
  assert.match(pageSource, /Confirm borrow|Confirm borrowing|Borrow copies/i);
  assert.match(pageSource, /Cancel/i);
});

test('cancel closes confirmation without invoking the member loan API', () => {
  assert.match(pageSource, /Cancel[\s\S]{0,300}(?:set[A-Z]\w*\(false\)|close\(\)|onCancel)/i,
    'the cancel action should dismiss review');
  assert.match(pageSource, /onClick=\{[^}]*cancel|onCancel=\{[^}]*cancel/i,
    'the cancel control should be wired to a cancellation action');
  assert.match(pageSource, /async function cancel\w*|const cancel\w*\s*=/i);
  const cancelHandler = pageSource.match(/(?:async function cancel\w*|const cancel\w*\s*=)[\s\S]{0,500}/i)?.[0] ?? '';
  assert.doesNotMatch(cancelHandler, /borrowApi\.(?:confirm|createLoan)\s*\(/i,
    'cancelling review must not submit a confirmation request');
});

test('confirmation submits only the staged copy IDs to the member loan endpoint', () => {
  assert.match(apiSource, /confirm\w*\s*\([^)]*copyIds/i,
    'the client API should expose confirmation using copy IDs');
  assert.match(apiSource, /apiRequest\(["'`]\/member\/loans["'`]/);
  assert.match(apiSource, /method:\s*["']POST["']/);
  assert.match(apiSource, /JSON\.stringify\(\{\s*copyIds\s*\}\)/,
    'confirmation payload should contain only copyIds');
  assert.match(pageSource, /borrowApi\.confirm\w*\s*\(\s*copies\.map\s*\(\s*\(?\s*(?:\{\s*copy\s*\}|\w+)\s*\)?\s*=>[\s\S]{0,150}?copy\.copyId/i,
    'the page should submit IDs derived from staged copies rather than book or member data');
});

test('confirmation results distinguish successful and failed copies and show server failure reasons', () => {
  assert.match(pageSource, /outcomes|results/);
  assert.match(pageSource, /success|borrowed|successful/i);
  assert.match(pageSource, /failure|failed|rejected/i);
  assert.match(pageSource, /reason|message/,
    'a failed outcome should display its server-provided reason, including limit failures');
  assert.match(pageSource, /role=["'](?:status|alert)["']/,
    'the result should be announced accessibly');
});

test('staged copies remain described as neither reserved nor borrowed before success', () => {
  assert.match(pageSource, /does not borrow or reserve|not (?:borrowed|reserved)|only stages/i);
});

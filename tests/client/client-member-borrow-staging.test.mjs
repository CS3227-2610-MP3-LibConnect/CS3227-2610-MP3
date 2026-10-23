import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const appSource = await readFile(new URL('../../apps/client/src/App.tsx', import.meta.url), 'utf8');
const navigationSource = await readFile(
  new URL('../../apps/client/src/components/MemberNavigation.tsx', import.meta.url),
  'utf8',
);
const baseApiSource = await readFile(
  new URL('../../apps/client/src/api/base.ts', import.meta.url),
  'utf8',
);
const pagesDirectory = new URL('../../apps/client/src/pages/', import.meta.url);
const apiDirectory = new URL('../../apps/client/src/api/', import.meta.url);
const borrowPageFile = '../../apps/client/src/pages/MemberBorrow.tsx';

async function sourceOrEmpty(url) {
  try {
    return await readFile(url, 'utf8');
  } catch {
    return '';
  }
}

const pageSource = await sourceOrEmpty(new URL(borrowPageFile, import.meta.url));
const apiFiles = await (await import('node:fs/promises')).readdir(apiDirectory);
const borrowApiSource = (
  await Promise.all(
    apiFiles
      .filter((name) => /borrow/i.test(name))
      .map((name) => sourceOrEmpty(new URL(name, apiDirectory))),
  )
).join('\n');

test('borrow page is registered behind the MEMBER protected route', () => {
  assert.match(appSource, /path=["']\/member\/borrow["']/);
  assert.match(appSource, /ProtectedRoute\s+accountType=["']MEMBER["'][^>]*>[\s\S]*?MemberBorrow/);
  assert.match(pageSource, /export function MemberBorrow|export default function MemberBorrow/);
});

test('member navigation provides a Borrow link to the borrow page', () => {
  assert.match(navigationSource, /href=[{"']?\/?member\/borrow|to=[{"']?\/?member\/borrow/);
  assert.match(navigationSource, />\s*Borrow\s*<\/a>/);
});

test('borrow capacity is loaded through apiRequest and requests include credentials', () => {
  assert.match(borrowApiSource, /apiRequest/);
  assert.match(borrowApiSource, /borrow-capacity/);
  assert.match(
    pageSource,
    /borrowApi\s*\.[\w]*(?:capacity|Capacity)|getBorrowCapacity|borrow-capacity/i,
  );
  assert.match(baseApiSource, /credentials:\s*["']include["']/);
});

test('Add copy submits the entered ID and only stages a card after eligibility succeeds', () => {
  assert.match(pageSource, /name=["']copyId["']|copyId/);
  assert.match(pageSource, /Add copy/i);
  assert.match(borrowApiSource, /borrow-items/);
  assert.match(pageSource, /await\s+borrowApi\.[\w]*(?:add|check|eligib)[\w]*\s*\(/i);
  assert.match(
    pageSource,
    /set(?:Staged|Copies|Items)\s*\([^;]*(?:\.\.\.|concat|\[)/s,
    'staged copy state should be appended only after the awaited eligibility request',
  );
});

test('unknown and unavailable copies show an error and are not staged', () => {
  assert.match(pageSource, /role=["']alert["']|aria-live=["']assertive["']/);
  assert.match(pageSource, /catch\s*\(/);
  assert.match(pageSource, /set(?:Error|Message)\s*\(/);
  assert.match(borrowApiSource, /borrow-items/);
  assert.match(pageSource, /await\s+borrowApi\.[\w]*(?:add|check|eligib)[\w]*\s*\(/i);
});

test('duplicate IDs are prevented, staging respects remaining capacity, and removal restores a slot', () => {
  assert.match(
    pageSource,
    /some\s*\(|includes\s*\(|new Set/,
    'the page should detect an already staged copy ID',
  );
  assert.match(pageSource, /remainingSlots|remainingCapacity|remainingLoans|capacity/);
  assert.match(
    pageSource,
    /Math\.max\(0,\s*remainingCapacity\s*-\s*copies\.length\)/,
    'available staging slots should subtract already staged copies from server-reported capacity',
  );
  assert.match(
    pageSource,
    /copies\.length\s*>=\s*remainingCapacity/,
    'the add action should stay disabled once the member has staged all remaining slots',
  );
  assert.match(
    pageSource,
    /disabled=\{[^}]*staged|disabled=\{[^}]*copies|disabled=\{[^}]*items/i,
    'Add should be disabled when the staged count reaches remaining capacity',
  );
  assert.match(pageSource, /Remove|remove/i);
  assert.match(
    pageSource,
    /filter\s*\(/,
    'removing a staged copy should derive the staged list without that item',
  );
});

test('staging performs eligibility checks and leaves confirmation to the explicit review step', () => {
  assert.match(borrowApiSource, /borrow-items/);
  assert.match(borrowApiSource, /copyId/);
  assert.doesNotMatch(
    borrowApiSource,
    /borrow-capacity[\s\S]{0,500}method:\s*["']POST["']/,
    'capacity lookup should remain read-only',
  );
  assert.match(pageSource, /borrowApi\.[\w]*(?:add|check|eligib)[\w]*\s*\(/i);
  assert.match(
    pageSource,
    /review|confirm|confirmation/i,
    'staging must remain a distinct step before the member confirms the transaction',
  );
});

test('staging is disabled while capacity refreshes after borrowing and when refresh fails', () => {
  assert.match(
    pageSource,
    /disabled=\{[^}]*capacityLoading[^}]*capacityError/s,
    'Add copy must stay disabled until refreshed capacity is available',
  );
  assert.match(
    pageSource,
    /setCapacityLoading\(true\)[\s\S]{0,180}borrowApi\s*\.capacity\(\)/,
    'a successful borrow must enter the capacity-loading state before reloading the server count',
  );
  assert.match(
    pageSource,
    /Could not refresh your borrowing capacity/,
    'a failed capacity refresh must be surfaced and keep staging disabled until retry',
  );
});

test('existing member catalog/detail destinations and librarian dashboard route remain registered', () => {
  assert.match(appSource, /path=["']\/member\/dashboard["']/);
  assert.match(appSource, /path=["']\/member\/books\/:isbn["']/);
  assert.match(appSource, /path=["']\/librarian\/dashboard["']/);
  assert.match(appSource, /ProtectedRoute\s+accountType=["']LIBRARIAN["']/);
});

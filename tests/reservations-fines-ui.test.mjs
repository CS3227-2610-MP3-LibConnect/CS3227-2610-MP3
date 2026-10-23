import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('librarian reservations/fines UI is protected and uses server-owned APIs', async () => {
  const app = await readFile(new URL('../apps/client/src/App.tsx', import.meta.url), 'utf8');
  const page = await readFile(
    new URL('../apps/client/src/pages/LibrarianReservationsFinesPage.tsx', import.meta.url),
    'utf8',
  );
  const api = await readFile(
    new URL('../apps/client/src/api/circulation.ts', import.meta.url),
    'utf8',
  );
  assert.match(app, /ProtectedRoute accountType="LIBRARIAN">\s*<LibrarianReservationsFinesPage/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /disabled=\{pending\}/);
  assert.match(page, /role="status"/);
  assert.match(page, /role="alert"/);
  assert.doesNotMatch(
    page,
    /firebase\/firestore|getFirestore|recipientUserId|status:\s*['"]WAIVED/,
  );
  assert.match(api, /Idempotency-Key/);
  assert.match(page, /messageIdempotencyKey/);
  assert.match(
    page,
    /sendMessage\(\s*messageMemberId\.trim\(\),\s*message\.trim\(\),\s*idempotencyKey,?\s*\)/,
  );
  assert.doesNotMatch(api, /recipientUserId/);
});

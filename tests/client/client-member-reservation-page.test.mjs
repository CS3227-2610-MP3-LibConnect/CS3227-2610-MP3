import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const source = (path) => readFileSync(resolve(path), 'utf8');

test('My Reservations route stays protected for members and renders the page', () => {
  const app = source('apps/client/src/App.tsx');
  assert.match(
    app,
    /<Route\s+path="\/member\/profile\/reservations"\s+element=\{\s*<ProtectedRoute accountType="MEMBER">\s*<MemberReservations\s*\/>\s*<\/ProtectedRoute>\s*\}/,
  );
  assert.match(
    app,
    /import\s+\{\s*MemberReservations\s*\}\s+from\s+'\.\/pages\/MemberReservations\.js'/,
  );
  assert.doesNotMatch(app, /member\/profile\/reservations[^\n]*MemberProfilePlaceholder/);
});

test('reservation page loads pending by default and keeps independent pending and history pages', () => {
  const page = source('apps/client/src/pages/MemberReservations.tsx');
  assert.match(page, /useState\s*<\s*ReservationView\s*>\s*\(\s*'pending'\s*\)/);
  assert.match(page, /reservationApi\.list\s*\(\s*view/);
  assert.match(page, /pending/);
  assert.match(page, /history/);
  assert.match(page, /nextCursor/);
  assert.match(page, /Load more|loadMore/i);
  assert.match(page, /setPending|pendingState|pendingPage/);
  assert.match(page, /setHistory|historyState|historyPage/);
  assert.match(page, /reservationDateTime/);
  assert.match(page, /sort\s*\(/, 'combined pages should be rendered newest first');
});

test('reservation views and cards enforce status-specific ready and historical assignment treatment', () => {
  const page = source('apps/client/src/pages/MemberReservations.tsx');
  const card = source('apps/client/src/components/MemberReservationCard.tsx');
  assert.match(page + card, /FULFILLED/);
  assert.match(page + card, /CANCELLED/);
  assert.match(page + card, /EXPIRED/);
  assert.match(page + card, /PENDING/);
  assert.match(card, /bookTitle/);
  assert.match(card, /reservationDateTime/);
  assert.match(card, /expiryDate/);
  assert.match(card, /copyId/);
  assert.match(card, /Ready for pickup/i);
  assert.match(card, /Waiting for (?:a )?copy/i);
  assert.match(
    card,
    /status\s*===\s*['"]PENDING['"]/,
    'assignment data must not make a cancelled reservation ready for pickup',
  );
});

test('each reservation view exposes loading, empty, retryable error, and load-more states', () => {
  const page = source('apps/client/src/pages/MemberReservations.tsx');
  assert.match(page, /Loading (?:your )?reservations/i);
  assert.match(page, /No pending reservations|No reservations in (?:your )?pending/i);
  assert.match(page, /No reservation history|No reservations in (?:your )?history/i);
  assert.match(page, /role="alert"/);
  assert.match(page, /Try again|Retry/i);
  assert.match(page, /onClick=\{[^}]*retry|onClick=\{[^}]*load/i);
  assert.match(page, /role="status"/);
});

test('only pending reservation cards offer an accessible book-specific cancellation confirmation', () => {
  const page = source('apps/client/src/pages/MemberReservations.tsx');
  const card = source('apps/client/src/components/MemberReservationCard.tsx');
  assert.match(card, /Cancel Reservation/, 'pending cards should expose the cancellation action');
  assert.match(
    card,
    /reservation\.status\s*===\s*['"]PENDING['"][\s\S]*Cancel Reservation/,
    'history cards must not offer cancellation',
  );
  assert.match(
    page,
    /role=["']alertdialog["']|<dialog\b/i,
    'confirmation should be an accessible dialog',
  );
  assert.match(page, /aria-modal=["']true["']/);
  assert.match(page, /aria-labelledby=/);
  assert.match(page, /bookTitle/, 'confirmation should identify the reserved book');
  assert.match(
    page,
    /onClick=\{[^}]*close|onClick=\{[^}]*dismiss|close.*Dialog|set[A-Za-z]*Confirmation\(null\)/i,
    'the dialog should have a dismissal path independent of confirmation',
  );
  assert.match(page, /reservationApi\.cancel\s*\(/);
});

test('reservation confirmation dismissal does not submit a cancellation request', () => {
  const page = source('apps/client/src/pages/MemberReservations.tsx');
  assert.match(
    page,
    /onClick=\{[^}]*dismiss|onClick=\{[^}]*close|close.*Dialog/i,
    'the dialog should expose a cancel or close control',
  );
  assert.match(
    page,
    /reservationApi\.cancel\s*\(/,
    'the API call should be connected to an explicit confirmation handler',
  );
  assert.match(
    page,
    /onClick=\{[^}]*confirm|onClick=\{[^}]*handleConfirm|confirm.*Cancellation/i,
    'only the affirmative control should invoke confirmation',
  );
});

test('cancellation prevents duplicate in-flight requests and preserves confirmed items on failure', () => {
  const page = source('apps/client/src/pages/MemberReservations.tsx');
  assert.match(
    page,
    /cancell?ationInFlight|cancell?ingReservation|cancell?ationPending|busyReservation/i,
    'the page should track the reservation currently being cancelled',
  );
  assert.match(
    page,
    /disabled=\{[^}]*cancell?ation|disabled=\{[^}]*busy|disabled=\{[^}]*inFlight/i,
    'the active reservation action should be disabled while its request is pending',
  );
  assert.match(
    page,
    /catch\s*\([^)]*\)\s*\{[\s\S]{0,350}setPendingPage\(\(current\)\s*=>\s*\(\{\s*\.\.\.current/,
    'a failed cancellation should retain the last confirmed pending page data',
  );
  assert.match(
    page,
    /Try again|Retry|retry/i,
    'appropriate cancellation failures should offer an actionable retry',
  );
});

test('successful cancellation refreshes both views, and stale conflicts refresh with clear feedback', () => {
  const page = source('apps/client/src/pages/MemberReservations.tsx');
  assert.match(page, /await\s+reservationApi\.cancel\s*\(/);
  assert.match(
    page,
    /loadPage\(['"]pending['"]\)/,
    'success should refresh pending from the server',
  );
  assert.match(
    page,
    /loadPage\(['"]history['"]\)/,
    'success should refresh history from the server',
  );
  assert.match(
    page,
    /role=["']status["']|aria-live=["']polite["']/,
    'success feedback should be announced',
  );
  assert.match(
    page,
    /cancelled successfully|reservation cancelled|cancellation complete/i,
    'success feedback should clearly report completion',
  );
  assert.match(
    page,
    /status\s*===\s*409|status\s*===\s*412|RESERVATION_CONFLICT|CONFLICT/,
    'stale status conflicts should be handled distinctly',
  );
  assert.match(
    page,
    /no longer (?:be )?cancelled|can no longer be cancelled|no longer pending/i,
    'stale feedback should explain that cancellation is no longer possible',
  );
  assert.match(
    page,
    /loadPage\(['"]pending['"]\)/,
    'stale conflicts should refresh the authoritative pending state',
  );
});

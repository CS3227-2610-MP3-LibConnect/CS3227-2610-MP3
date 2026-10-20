import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ApiClientError } from '../dist/apps/client/src/api/errors.js';
import { reservationApi } from '../dist/apps/client/src/api/reservations.js';

const detailSource = await readFile(new URL('../apps/client/src/pages/MemberBookDetail.tsx', import.meta.url), 'utf8');
const reservationApiSource = await readFile(new URL('../apps/client/src/api/reservations.ts', import.meta.url), 'utf8');

async function withFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

test('reservation lookup uses the credentialed API and encodes the ISBN route segment', async () => {
  const pending = { reservationId: 'r-1', isbn: '978/0001', status: 'PENDING' };
  await withFetch(async (url, init) => {
    assert.equal(new URL(url).pathname, '/api/v1/member/reservations/by-isbn/978%2F0001');
    assert.equal(init.credentials, 'include');
    assert.equal(init.method, undefined);
    return Response.json(pending);
  }, async () => assert.deepEqual(await reservationApi.getByIsbn('978/0001'), pending));
});

test('create sends only the ISBN and cancel uses the reservation resource with cookie credentials', async () => {
  const seen = [];
  await withFetch(async (url, init) => {
    seen.push({ path: new URL(url).pathname, init });
    return init.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ reservationId: 'r-2' });
  }, async () => {
    await reservationApi.create('978/0001');
    await reservationApi.cancel('r/2');
  });

  assert.equal(seen[0].path, '/api/v1/member/reservations');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.credentials, 'include');
  assert.deepEqual(JSON.parse(seen[0].init.body), { isbn: '978/0001' });
  assert.equal(Object.hasOwn(JSON.parse(seen[0].init.body), 'memberId'), false);
  assert.equal(seen[1].path, '/api/v1/member/reservations/r%2F2');
  assert.equal(seen[1].init.method, 'DELETE');
  assert.equal(seen[1].init.credentials, 'include');
});

test('reservation API preserves server errors for actionable page feedback', async () => {
  await withFetch(async () => Response.json({ error: { code: 'RESERVATION_CONFLICT', message: 'Reservation state changed.' } }, { status: 409 }), async () => {
    await assert.rejects(reservationApi.create('9780001'), (error) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 409);
      assert.match(error.message, /state changed/i);
      return true;
    });
  });
});

test('reservation list exposes the display and page contract and sends selected view with optional paging values', async () => {
  assert.match(reservationApiSource, /bookTitle\s*:\s*string/);
  assert.match(reservationApiSource, /status\s*:\s*['"]PENDING['"]\s*\|\s*['"]FULFILLED['"]\s*\|\s*['"]CANCELLED['"]\s*\|\s*['"]EXPIRED['"]/);
  assert.match(reservationApiSource, /items\s*:\s*MemberReservationListItem\[\]/);
  assert.match(reservationApiSource, /interface MemberReservationListItem extends MemberReservation[\s\S]*bookTitle\s*:\s*string[\s\S]*reservationDateTime\s*:\s*string/);
  assert.match(reservationApiSource, /page\s*:\s*\{\s*limit\s*:\s*number\s*;\s*nextCursor\s*:\s*string\s*\|\s*null\s*\}/);

  const page = { items: [{ reservationId: 'r-1', isbn: '978/0001', bookTitle: 'Example', status: 'PENDING' }], page: { limit: 7, nextCursor: 'next+/=' } };
  await withFetch(async (url, init) => {
    const requestUrl = new URL(url);
    assert.equal(requestUrl.pathname, '/api/v1/member/reservations');
    assert.equal(requestUrl.searchParams.get('view'), 'pending');
    assert.equal(requestUrl.searchParams.get('limit'), '7');
    assert.equal(requestUrl.searchParams.get('cursor'), 'opaque cursor+/=');
    assert.equal(init.method, undefined);
    assert.equal(init.credentials, 'include');
    return Response.json(page);
  }, async () => assert.deepEqual(await reservationApi.list('pending', { limit: 7, cursor: 'opaque cursor+/=' }), page));

  await withFetch(async (url, init) => {
    const requestUrl = new URL(url);
    assert.equal(requestUrl.searchParams.get('view'), 'history');
    assert.equal(requestUrl.searchParams.has('limit'), false);
    assert.equal(requestUrl.searchParams.has('cursor'), false);
    assert.equal(init.credentials, 'include');
    return Response.json({ items: [], page: { limit: 20, nextCursor: null } });
  }, async () => assert.deepEqual(await reservationApi.list('history'), { items: [], page: { limit: 20, nextCursor: null } }));
});

test('reservation list and DELETE cancellation preserve API error behavior', async () => {
  const failure = () => Response.json({ error: { code: 'RESERVATION_CONFLICT', message: 'Reservation is no longer pending.' } }, { status: 409 });
  await withFetch(async (url, init) => {
    assert.equal(new URL(url).pathname, '/api/v1/member/reservations');
    assert.equal(new URL(url).searchParams.get('view'), 'pending');
    assert.equal(init.credentials, 'include');
    return failure();
  }, async () => {
    await assert.rejects(reservationApi.list('pending'), (error) => error instanceof ApiClientError && error.status === 409 && /no longer pending/i.test(error.message));
  });

  await withFetch(async (url, init) => {
    assert.equal(new URL(url).pathname, '/api/v1/member/reservations/r%2F1');
    assert.equal(init.method, 'DELETE');
    assert.equal(init.credentials, 'include');
    return failure();
  }, async () => {
    await assert.rejects(reservationApi.cancel('r/1'), (error) => error instanceof ApiClientError && error.status === 409 && /no longer pending/i.test(error.message));
  });
});

test('book detail gates and toggles the action from server-confirmed eligibility and pending state', () => {
  assert.match(detailSource, /reservationApi\.getByIsbn\s*\(/);
  assert.match(detailSource, /reservationApi\.create\s*\(/);
  assert.match(detailSource, /reservationApi\.cancel\s*\(/);
  assert.match(detailSource, /Make Reservation/);
  assert.match(detailSource, /Cancel Reservation/);
  assert.match(detailSource, /availableCount\s*===\s*0|availableCount\s*<=\s*0/);
  assert.match(detailSource, /status\s*===\s*['"]PENDING['"]/);
  assert.match(detailSource, /disabled=\{[^}]*\}/);
  assert.match(detailSource, /set[A-Za-z]*Reservation[^;]*null|reservation\s*\?\s*null/);
});

test('cancellation confirmation is accessible, dismissible, keyboard operable, and announces outcome', () => {
  assert.match(detailSource, /role=["']alertdialog["']/);
  assert.match(detailSource, /aria-modal=["']true["']/);
  assert.match(detailSource, /aria-labelledby=/);
  assert.match(detailSource, /onKeyDown|addEventListener\(['"]keydown['"]/);
  assert.match(detailSource, /Escape|key\s*===\s*['"]Escape['"]/);
  assert.match(detailSource, /focus\(\)/);
  assert.match(detailSource, /role=["']status["']|aria-live=/);
  assert.match(detailSource, /Cancel|Keep Reservation|Go back/);
});

test('reservation operations prevent duplicate in-flight requests and refresh after success or stale conflicts', () => {
  assert.match(detailSource, /inFlight|submitting|reservationBusy|isSubmitting/i);
  assert.match(detailSource, /useRef\([^)]*(false|null)/);
  assert.match(detailSource, /reservationRequestSequence/);
  assert.match(detailSource, /finally\s*\{/);
  assert.match(detailSource, /loadBook\(\)/);
  assert.match(detailSource, /getByIsbn\s*\(/);
  assert.match(detailSource, /status\s*===\s*409|status\s*===\s*412|RESERVATION_CONFLICT|AVAILABLE_COPY/);
  assert.match(detailSource, /set[A-Za-z]*Error|role=["']alert["']/);
});

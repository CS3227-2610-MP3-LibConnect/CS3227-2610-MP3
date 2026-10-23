import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.NODE_ENV === 'production' ||
  projectId !== 'demo-libconnect'
) {
  throw new Error(
    'Run this check with FIRESTORE_EMULATOR_HOST set, NODE_ENV non-production, and FIREBASE_PROJECT_ID or GCLOUD_PROJECT set to demo-libconnect.',
  );
}
const { db } = await import('../../dist/apps/api/src/storage/firebase.js');

const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:3000';
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const runId = randomUUID().replaceAll('-', '');
const numericRunId = [...runId].map((digit) => Number.parseInt(digit, 16) % 10).join('');
const email = `catalog-range-${runId}@example.test`;
const password = `Range-check-${runId}`;
const tag = `RangeCheck${runId}`;
const isbnFor = (suffix) => `978${numericRunId.slice(0, 9)}${suffix}`;
const fixtures = [
  { isbn: isbnFor('1'), year: 1999 },
  { isbn: isbnFor('2'), year: 2000 },
  { isbn: isbnFor('3'), year: 2001 },
  { isbn: isbnFor('4'), year: 2002 },
  { isbn: isbnFor('5'), year: 2003 },
].map(({ isbn, year }, index) => ({
  isbn,
  title: `${tag} Title ${index}`,
  author: 'Range Tester',
  publicationYear: year,
  publisher: 'Range Press',
  category: 'Fiction',
  synopsis: 'Search must not use synopsis.',
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
}));
const seededIsbns = [];
let userId;

async function call(path, { method = 'GET', body, cookie } = {}) {
  const headers = { Origin: clientOrigin };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  return fetch(new URL(path, apiOrigin), {
    method,
    headers,
    signal: AbortSignal.timeout(15_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionCookie(response) {
  const value = response.headers.getSetCookie().find((header) => header.startsWith('__session='));
  assert.ok(value, 'expected authenticated member session cookie');
  return value.split(';')[0];
}

function queryString(filters) {
  return new URLSearchParams(filters).toString();
}

async function search(cookie, filters = {}) {
  return call(`/api/v1/books?${queryString(filters)}`, { cookie });
}

async function expectValidationError(filters) {
  const response = await search(cookie, filters);
  assert.equal(response.status, 400, `expected 400 for ${queryString(filters)}`);
  const payload = await response.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
  assert.equal(typeof payload.error.message, 'string');
}

let cookie;
try {
  const registration = await call('/api/v1/auth/register', {
    method: 'POST',
    body: {
      accountType: 'MEMBER',
      name: 'Catalog Range Tester',
      email,
      password,
      confirmPassword: password,
    },
  });
  assert.equal(registration.status, 201, 'test requires a reachable API with emulator-backed auth');
  userId = (await registration.json()).user.userId;
  const login = await call('/api/v1/auth/login', {
    method: 'POST',
    body: { accountType: 'MEMBER', email, password },
  });
  assert.equal(login.status, 200);
  cookie = sessionCookie(login);

  await Promise.all(
    fixtures.map(async (book) => {
      await db.collection('books').doc(book.isbn).set(book);
      seededIsbns.push(book.isbn);
    }),
  );

  // Existing exact-year behavior remains available alongside the new range.
  const exact = await search(cookie, { publicationYear: '2001', title: tag });
  assert.equal(exact.status, 200);
  assert.deepEqual(
    (await exact.json()).items.map((book) => book.isbn),
    [fixtures[2].isbn],
  );

  // The range includes both endpoints and composes with all supported text fields and ISBN.
  const combined = await search(cookie, {
    publicationYearFrom: '2000',
    publicationYearTo: '2002',
    title: tag,
    author: 'tester',
    publisher: 'press',
    category: 'fiction',
    isbn: fixtures[3].isbn,
  });
  assert.equal(combined.status, 200);
  assert.deepEqual(
    (await combined.json()).items.map((book) => book.isbn),
    [fixtures[3].isbn],
  );

  const firstPageResponse = await search(cookie, {
    publicationYearFrom: '2000',
    publicationYearTo: '2002',
    title: tag,
    limit: '1',
  });
  assert.equal(firstPageResponse.status, 200);
  const firstPage = await firstPageResponse.json();
  assert.equal(firstPage.items.length, 1);
  assert.ok(firstPage.page.nextCursor);
  const seen = firstPage.items.map((book) => book.isbn);
  let cursor = firstPage.page.nextCursor;
  while (cursor) {
    const response = await search(cookie, {
      publicationYearFrom: '2000',
      publicationYearTo: '2002',
      title: tag,
      limit: '1',
      cursor,
    });
    assert.equal(response.status, 200);
    const page = await response.json();
    seen.push(...page.items.map((book) => book.isbn));
    cursor = page.page.nextCursor;
  }
  assert.equal(new Set(seen).size, seen.length, 'pagination must not duplicate records');
  assert.deepEqual(new Set(seen), new Set(fixtures.slice(1, 4).map((book) => book.isbn)));

  for (const changedFilters of [
    { publicationYearFrom: '2001', publicationYearTo: '2002', title: tag },
    { publicationYearFrom: '2000', publicationYearTo: '2001', title: tag },
    { publicationYearFrom: '2000', publicationYearTo: '2002', title: `${tag} changed` },
    { publicationYear: '2001', title: tag },
    { title: tag },
  ]) {
    const response = await search(cookie, {
      ...changedFilters,
      limit: '1',
      cursor: firstPage.page.nextCursor,
    });
    assert.equal(
      response.status,
      400,
      `cursor must be bound to filters: ${queryString(changedFilters)}`,
    );
    const payload = await response.json();
    assert.equal(payload.error.code, 'INVALID');
    assert.equal(typeof payload.error.message, 'string');
  }

  for (const filters of [
    { publicationYearFrom: '2000' },
    { publicationYearTo: '2002' },
    { publicationYearFrom: '2003', publicationYearTo: '2000' },
    { publicationYear: '2001', publicationYearFrom: '2000', publicationYearTo: '2002' },
    { publicationYear: '2001', publicationYearFrom: '2000' },
    { publicationYearFrom: 'two-thousand', publicationYearTo: '2002' },
    { publicationYearFrom: '', publicationYearTo: '2002' },
    { publicationYearFrom: '  ', publicationYearTo: '2002' },
    { publicationYearFrom: '2000', publicationYearTo: '' },
    { publicationYearFrom: '2000', publicationYearTo: ' ' },
    { publicationYearFrom: '2000.5', publicationYearTo: '2002' },
    { publicationYearFrom: '2000', publicationYearTo: '10000' },
  ]) {
    await expectValidationError(filters);
  }

  console.info(
    'Catalog year-range Emulator verification passed: authenticated exact-year regression, inclusive bounds, AND filters, validation, cursor binding, and duplicate-free pagination.',
  );
} finally {
  const sessions = userId
    ? await db.collection('sessions').where('userId', '==', userId).get()
    : { docs: [] };
  await Promise.all([
    ...seededIsbns.map((isbn) => db.collection('books').doc(isbn).delete()),
    ...sessions.docs.map((doc) => doc.ref.delete()),
    ...(userId ? [db.collection('users').doc(userId).delete()] : []),
  ]);
}

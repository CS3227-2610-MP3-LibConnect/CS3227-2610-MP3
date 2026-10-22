import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV === 'production' || projectId !== 'demo-libconnect') {
  throw new Error('Run this check with FIRESTORE_EMULATOR_HOST set, NODE_ENV non-production, and FIREBASE_PROJECT_ID or GCLOUD_PROJECT set to demo-libconnect.');
}
const { db } = await import('../../dist/apps/api/src/storage/firebase.js');

const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:3000';
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const runId = randomUUID().replaceAll('-', '');
const numericRunId = [...runId].map((digit) => Number.parseInt(digit, 16) % 10).join('');
const password = `Catalog-check-${runId}`;
const emailFor = (role) => `catalog-${role}-${runId}@example.test`;
const tag = `CatalogCheck${runId}`;
const isbnFor = (index) => `978${numericRunId.slice(0, 9)}${String(index).padStart(4, '0')}`;
const bookIds = [];
const copyIds = [];
const userIds = [];

async function call(path, { method = 'GET', body, cookie } = {}) {
  const headers = { Origin: clientOrigin };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  return fetch(new URL(path, apiOrigin), {
    method, headers, signal: AbortSignal.timeout(20_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function cookieFor(response) {
  const value = response.headers.getSetCookie().find((header) => header.startsWith('libconnect.sid='));
  assert.ok(value, 'expected authenticated session cookie');
  return value.split(';')[0];
}

async function registerAndLogin(role, accountType = role === 'librarian' ? 'LIBRARIAN' : 'MEMBER') {
  const body = {
    accountType, name: `Catalog ${role}`, email: emailFor(role), password,
    ...(role === 'librarian' ? { employeeId: `EMP-${runId}` } : {}),
    confirmPassword: password,
  };
  const registration = await call('/api/v1/auth/register', { method: 'POST', body });
  assert.equal(registration.status, 201);
  const user = (await registration.json()).user;
  userIds.push(user.userId);
  if (role === 'librarian') await db.collection('users').doc(user.userId).update({ accountStatus: 'ACTIVE' });
  const login = await call('/api/v1/auth/login', {
    method: 'POST', body: { accountType, email: emailFor(role), password },
  });
  assert.equal(login.status, 200);
  return { user, cookie: cookieFor(login) };
}

const params = (filters) => new URLSearchParams(filters).toString();
const books = (cookie, filters = {}) => call(`/api/v1/books?${params(filters)}`, { cookie });
const copies = (cookie, filters = {}) => call(`/api/v1/copies?${params(filters)}`, { cookie });

async function expect400(responsePromise) {
  const response = await responsePromise;
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(typeof payload.error.code, 'string');
  assert.equal(typeof payload.error.message, 'string');
}

try {
  const member = await registerAndLogin('member');
  const librarian = await registerAndLogin('librarian');
  const inactive = await registerAndLogin(`inactive-${runId}`, 'MEMBER');
  await db.collection('users').doc(inactive.user.userId).update({ accountStatus: 'INACTIVE' });

  assert.equal((await call('/api/v1/books')).status, 401, 'anonymous book reads are denied');
  assert.equal((await call('/api/v1/copies')).status, 401, 'anonymous copy reads are denied');
  assert.equal((await books(inactive.cookie)).status, 403, 'inactive book reads are denied');
  assert.equal((await copies(inactive.cookie)).status, 403, 'inactive copy reads are denied');

  const fixtureBooks = [
    { index: 1, title: `${tag} Tolkien`, author: ['J.R.R. Tolkien'], publicationYear: 2001, publisher: 'North Press', category: 'Fantasy', synopsis: 'Hidden phrase synopsisneedle.' },
    { index: 2, title: `${tag} River`, author: 'A. Writer', publicationYear: 2002, publisher: 'South Press', category: 'History', synopsis: 'Ordinary text.' },
    { index: 3, title: `${tag} Sea`, author: ['Other Author', 'J.R.R. Tolkien'], publicationYear: 2003, publisher: 'West House', category: 'Fantasy', synopsis: 'Ordinary text.' },
  ];
  const now = Timestamp.now();
  await Promise.all(fixtureBooks.map(async (book) => {
    const isbn = isbnFor(book.index);
    bookIds.push(isbn);
    await db.collection('books').doc(isbn).set({
      isbn, title: book.title, author: book.author, publicationYear: book.publicationYear,
      publisher: book.publisher, category: book.category, synopsis: book.synopsis,
      createdAt: now, updatedAt: now,
    });
  }));

  const fixtureCopies = [
    { id: `CatalogCopy-${runId}-a`, isbn: isbnFor(1), shelfLocation: `${tag} Aisle 4`, status: 'AVAILABLE' },
    { id: `CatalogCopy-${runId}-b`, isbn: isbnFor(1), shelfLocation: `${tag} Aisle 5`, status: 'ON_LOAN' },
    { id: `CatalogCopy-${runId}-c`, isbn: isbnFor(2), shelfLocation: 'Remote shelf', status: 'AVAILABLE' },
  ];
  await Promise.all(fixtureCopies.map(async (copy) => {
    copyIds.push(copy.id);
    await db.collection('bookCopies').doc(copy.id).set({
      ...copy, createdAt: now, updatedAt: now,
    });
  }));

  for (const actor of [member, librarian]) {
    assert.equal((await books(actor.cookie)).status, 200, 'active accounts can search books');
    assert.equal((await copies(actor.cookie)).status, 200, 'active accounts can search copies');
  }

  const bookFilterCases = [
    [{ title: 'tolkien' }, [isbnFor(1)]],
    [{ author: 'TOLKIEN' }, [isbnFor(1), isbnFor(3)]],
    [{ publisher: 'north' }, [isbnFor(1)]],
    [{ category: 'FANTASY' }, [isbnFor(1), isbnFor(3)]],
    [{ isbn: isbnFor(2) }, [isbnFor(2)]],
    [{ publicationYear: '2001' }, [isbnFor(1)]],
    [{ publicationYearFrom: '2001', publicationYearTo: '2002' }, [isbnFor(1), isbnFor(2)]],
    [{ isbn: isbnFor(1), publicationYear: '2001', author: 'tolkien' }, [isbnFor(1)]],
    [{ title: 'synopsisneedle' }, []],
    [{ title: 'NoSuchCatalogTitle' }, []],
  ];
  for (const [filter, expected] of bookFilterCases) {
    const response = await books(member.cookie, filter);
    assert.equal(response.status, 200, `book filter ${params(filter)}`);
    const payload = await response.json();
    assert.deepEqual(payload.items.map((item) => item.isbn), expected, `book filter ${params(filter)}`);
    if (filter.isbn === isbnFor(1)) {
      assert.equal(payload.items[0].synopsis, fixtureBooks[0].synopsis);
      assert.equal(typeof payload.items[0].createdAt, 'string', 'Firestore timestamps serialize to JSON strings');
      assert.ok(Number.isFinite(Date.parse(payload.items[0].createdAt)), 'serialized timestamp is ISO-compatible');
    }
  }

  const copyFilterCases = [
    [{ shelfLocation: 'aIsLe 4' }, [fixtureCopies[0].id]],
    [{ isbn: isbnFor(1) }, [fixtureCopies[0].id, fixtureCopies[1].id]],
    [{ isbn: isbnFor(1), status: 'AVAILABLE' }, [fixtureCopies[0].id]],
    [{ copyId: fixtureCopies[1].id }, [fixtureCopies[1].id]],
    [{ status: 'ON_LOAN' }, [fixtureCopies[1].id]],
    [{ isbn: isbnFor(1), copyId: fixtureCopies[0].id, status: 'AVAILABLE', shelfLocation: 'aisle' }, [fixtureCopies[0].id]],
    [{ shelfLocation: 'NoSuchShelf' }, []],
  ];
  for (const [filter, expected] of copyFilterCases) {
    const response = await copies(member.cookie, filter);
    assert.equal(response.status, 200, `copy filter ${params(filter)}`);
    assert.deepEqual((await response.json()).items.map((item) => item.copyId), expected, `copy filter ${params(filter)}`);
  }
  await expect400(copies(member.cookie, { status: 'INVALID' }));

  const copyPageIds = [];
  let copyCursor;
  do {
    const response = await copies(member.cookie, { isbn: isbnFor(1), limit: '1', ...(copyCursor ? { cursor: copyCursor } : {}) });
    assert.equal(response.status, 200);
    const page = await response.json();
    copyPageIds.push(...page.items.map((item) => item.copyId));
    copyCursor = page.page.nextCursor;
  } while (copyCursor);
  assert.deepEqual(copyPageIds, [fixtureCopies[0].id, fixtureCopies[1].id]);

  const bookCopiesPath = `/api/v1/books/${isbnFor(1)}/copies`;
  const allBookCopies = await call(bookCopiesPath, { cookie: member.cookie });
  assert.equal(allBookCopies.status, 200);
  assert.deepEqual((await allBookCopies.json()).items.length, 2);
  const availableBookCopies = await call(`${bookCopiesPath}?status=AVAILABLE`, { cookie: member.cookie });
  assert.equal(availableBookCopies.status, 200);
  assert.deepEqual((await availableBookCopies.json()).items.map((item) => item.copyId), [fixtureCopies[0].id]);

  const missingBook = await call(`/api/v1/books/${isbnFor(9999)}`, { cookie: member.cookie });
  assert.equal(missingBook.status, 404);
  const missingCopy = await call('/api/v1/copies/CatalogCopy-missing', { cookie: member.cookie });
  assert.equal(missingCopy.status, 404);
  for (const filter of [
    { unsupported: 'x' }, { status: 'INVALID' }, { limit: '0' }, { limit: '51' },
    { publicationYearFrom: '2001' }, { publicationYearTo: '2002' },
    { publicationYearFrom: '2003', publicationYearTo: '2001' },
    { publicationYear: '2001', publicationYearTo: '2002' },
  ]) await expect400(books(member.cookie, filter));

  // More than two Firestore scan batches with only three sparse matches verifies
  // that continuation uses the last scanned record and doesn't skip later matches.
  const sparseBooks = Array.from({ length: 205 }, (_, offset) => {
    const index = 100 + offset;
    return {
      isbn: isbnFor(index), title: [20, 120, 200].includes(offset) ? `${tag} Sparse` : `${tag} Common`,
      author: 'Scan Author', publicationYear: 1990, publisher: 'Scan Press', category: 'Scan',
      synopsis: 'Scan fixture', createdAt: now, updatedAt: now,
    };
  });
  await Promise.all(sparseBooks.map(async (book) => {
    bookIds.push(book.isbn);
    await db.collection('books').doc(book.isbn).set(book);
  }));
  let cursor;
  const sparseResults = [];
  do {
    const response = await books(member.cookie, { title: `${tag} Sparse`, limit: '1', ...(cursor ? { cursor } : {}) });
    assert.equal(response.status, 200);
    const page = await response.json();
    sparseResults.push(...page.items.map((item) => item.isbn));
    cursor = page.page.nextCursor;
  } while (cursor);
  assert.deepEqual(sparseResults, [isbnFor(120), isbnFor(220), isbnFor(300)]);

  const emptyPage = await books(member.cookie, { title: 'NoMatchingSparseRecord', limit: '1' });
  assert.equal(emptyPage.status, 200);
  const emptyPagePayload = await emptyPage.json();
  assert.deepEqual(emptyPagePayload.items, []);
  assert.equal(emptyPagePayload.page.nextCursor, null);

  const firstPageResponse = await books(member.cookie, { title: tag, limit: '1' });
  assert.equal(firstPageResponse.status, 200);
  const firstPage = await firstPageResponse.json();
  assert.ok(firstPage.page.nextCursor);
  await expect400(books(member.cookie, { title: `${tag} changed`, limit: '1', cursor: firstPage.page.nextCursor }));
  await expect400(books(member.cookie, { title: tag, limit: '51', cursor: firstPage.page.nextCursor }));

  console.info('Catalog acceptance Emulator verification passed: auth roles, book/copy filters, validation, sparse pagination, missing records, and exact/range compatibility.');
} finally {
  const sessionSnapshots = await Promise.all(userIds.map((userId) => db.collection('sessions').where('userId', '==', userId).get()));
  await Promise.all([
    ...bookIds.map((id) => db.collection('books').doc(id).delete()),
    ...copyIds.map((id) => db.collection('bookCopies').doc(id).delete()),
    ...sessionSnapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.ref.delete())),
    ...userIds.map((id) => db.collection('users').doc(id).delete()),
  ]);
}

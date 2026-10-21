import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { createCatalogRouter } from '../dist/apps/api/src/routes/catalog.js';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';

const origin = 'http://localhost:5173';
const cursorSecret = 'catalog-route-test-cursor-secret-long-enough';
const usersById = new Map([
  ['member-1', { userId: 'member-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'MEMBER-1' }],
  ['inactive-1', { userId: 'inactive-1', name: 'Inactive', email: 'inactive@example.test', accountType: 'MEMBER', accountStatus: 'INACTIVE', memberId: 'MEMBER-2' }],
  ['librarian-1', { userId: 'librarian-1', name: 'Librarian', email: 'librarian@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'EMP-1', isManager: false }],
]);

const book = {
  isbn: '978-0000000002', title: 'A Book', author: 'An Author', publicationYear: 2026,
  publisher: 'A Publisher', category: 'Fiction', synopsis: 'Synopsis',
};
const copies = [
  { copyId: 'copy-1', isbn: book.isbn, shelfLocation: 'A-1', status: 'AVAILABLE' },
  { copyId: 'copy-2', isbn: book.isbn, shelfLocation: 'A-2', status: 'ON_LOAN' },
];
const calls = [];
const repository = {
  async searchBooks(filters, limit, cursor) {
    calls.push(['searchBooks', filters, limit, cursor]);
    return { items: [book], nextCursor: { filterKey: 'a'.repeat(64), lastId: 'book-cursor-1' } };
  },
  async searchCopies(filters, limit, cursor) {
    calls.push(['searchCopies', filters, limit, cursor]);
    return { items: copies, nextCursor: null };
  },
  async getBook(isbn) {
    if (isbn !== book.isbn) throw new Error('unexpected book');
    return book;
  },
  async copiesForBook(isbn) {
    if (isbn !== book.isbn) throw new Error('unexpected book');
    return copies;
  },
  async getCopy(copyId) {
    return copies.find((copy) => copy.copyId === copyId) ?? (() => { throw new Error('unexpected copy'); })();
  },
  async createBook(input) { calls.push(['createBook', input]); return { ...input }; },
  async inventorySummary() {
    return {
      totalTitles: 1,
      totalCopies: 2,
      availableCopies: 1,
      byStatus: { AVAILABLE: 1, IN_TRANSIT: 0, ON_LOAN: 1, DAMAGED: 0, LOST: 0, RESERVED: 0 },
    };
  },
};

const app = express();
app.use(express.json());
app.use(session({
  secret: 'catalog-route-test-session-secret-long-enough',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
}));
app.get('/__test/session/:userId', (request, response) => {
  const user = usersById.get(request.params.userId);
  if (!user) return response.sendStatus(404);
  request.session.userId = user.userId;
  request.session.accountType = user.accountType;
  response.json({ ok: true });
});
app.use('/api/v1', createCatalogRouter(repository, { async getById(userId) { return usersById.get(userId); } }, cursorSecret));
app.use(apiErrorHandler);

let server;
let apiOrigin;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function sessionCookie(userId) {
  const response = await fetch(`${apiOrigin}/__test/session/${userId}`);
  return response.headers.getSetCookie().find((value) => value.startsWith('connect.sid=')).split(';')[0];
}

async function request(path, init = {}) {
  return fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: { Origin: origin, ...(init.headers ?? {}) },
  });
}

test('catalog reads require an active authenticated actor and mutations require a librarian', async () => {
  assert.equal((await request('/api/v1/books')).status, 401);
  assert.equal((await request('/api/v1/books', { headers: { Cookie: await sessionCookie('inactive-1') } })).status, 403);

  const member = await request('/api/v1/books', { headers: { Cookie: await sessionCookie('member-1') } });
  assert.equal(member.status, 200);
  assert.deepEqual((await member.json()).items, [book]);

  const memberMutation = await request('/api/v1/books', {
    method: 'POST',
    headers: { Cookie: await sessionCookie('member-1'), 'Content-Type': 'application/json' },
    body: JSON.stringify(book),
  });
  assert.equal(memberMutation.status, 403);
});

test('catalog request schemas reject forged server fields and out-of-range years before storage', async () => {
  const cookie = await sessionCookie('librarian-1');
  const beforeCalls = calls.length;
  const forged = await request('/api/v1/books', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...book, createdAt: 'forged', status: 'AVAILABLE' }),
  });
  assert.equal(forged.status, 400);
  assert.equal(calls.length, beforeCalls);

  const invalidYear = await request('/api/v1/books', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...book, publicationYear: 10000 }),
  });
  assert.equal(invalidYear.status, 400);
  assert.equal(calls.length, beforeCalls);
});

test('book detail availability includes every approved status with server counts', async () => {
  const response = await request(`/api/v1/books/${encodeURIComponent(book.isbn)}`, { headers: { Cookie: await sessionCookie('member-1') } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).availability, {
    totalCopies: 2,
    availableCount: 1,
    byStatus: { AVAILABLE: 1, IN_TRANSIT: 0, ON_LOAN: 1, DAMAGED: 0, LOST: 0, RESERVED: 0 },
  });
});

test('inventory summary is librarian-only and returns the approved fields', async () => {
  const member = await request('/api/v1/librarian/inventory/summary', { headers: { Cookie: await sessionCookie('member-1') } });
  assert.equal(member.status, 403);

  const response = await request('/api/v1/librarian/inventory/summary', { headers: { Cookie: await sessionCookie('librarian-1') } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    totalTitles: 1,
    totalCopies: 2,
    availableCopies: 1,
    byStatus: { AVAILABLE: 1, IN_TRANSIT: 0, ON_LOAN: 1, DAMAGED: 0, LOST: 0, RESERVED: 0 },
  });
});

test('invalid cursors and unknown query fields are rejected', async () => {
  const cookie = await sessionCookie('member-1');
  const malformedCursor = await request('/api/v1/books?cursor=not-a-cursor', { headers: { Cookie: cookie } });
  assert.equal(malformedCursor.status, 400);
  const unknownFilter = await request('/api/v1/books?role=LIBRARIAN', { headers: { Cookie: cookie } });
  assert.equal(unknownFilter.status, 400);
});

test('catalog cursors are signed, filter-order independent, and support maximum filters', async () => {
  const cookie = await sessionCookie('member-1');
  const first = await request('/api/v1/books?title=A%20Book&author=An%20Author', { headers: { Cookie: cookie } });
  assert.equal(first.status, 200);
  const firstPage = await first.json();
  assert.match(firstPage.page.nextCursor, /^[^.]+\.[^.]+$/);

  const reordered = await request(`/api/v1/books?author=An%20Author&title=A%20Book&cursor=${encodeURIComponent(firstPage.page.nextCursor)}`, { headers: { Cookie: cookie } });
  assert.equal(reordered.status, 200);
  assert.deepEqual(calls.at(-1)[3], { filterKey: 'a'.repeat(64), lastId: 'book-cursor-1' });

  const forged = `${firstPage.page.nextCursor.slice(0, -1)}${firstPage.page.nextCursor.endsWith('A') ? 'B' : 'A'}`;
  assert.equal((await request(`/api/v1/books?cursor=${encodeURIComponent(forged)}`, { headers: { Cookie: cookie } })).status, 400);

  const maximumFilters = new URLSearchParams({
    title: 't'.repeat(200), author: 'a'.repeat(200), publisher: 'p'.repeat(200), category: 'c'.repeat(200),
    isbn: '978-1234567890123456789012345678', publicationYear: '2026',
  });
  const maximum = await request(`/api/v1/books?${maximumFilters}`, { headers: { Cookie: cookie } });
  assert.equal(maximum.status, 200);
  assert.match((await maximum.json()).page.nextCursor, /^[^.]+\.[^.]+$/);
});

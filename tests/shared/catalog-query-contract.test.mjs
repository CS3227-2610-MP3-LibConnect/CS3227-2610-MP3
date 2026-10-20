import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { apiErrorHandler } from '../../dist/apps/api/src/http/errors.js';
import { createCatalogRouter } from '../../dist/apps/api/src/routes/catalog.js';

const activeMember = {
  userId: 'catalog-query-member',
  name: 'Catalog Query Member',
  email: 'catalog-query-member@example.test',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'catalog-query-member-id',
};
const calls = { books: [], copies: [] };
const repository = {
  async searchBooks(filters, limit, cursor) {
    calls.books.push({ filters, limit, cursor });
    return { items: [], nextCursor: null };
  },
  async searchCopies(filters, limit, cursor) {
    calls.copies.push({ filters, limit, cursor });
    return { items: [], nextCursor: null };
  },
};

const app = express();
app.use((request, _response, next) => {
  request.actor = activeMember;
  next();
});
app.use('/api/v1', createCatalogRouter(repository, {}));
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

test('exact publication year rejects empty, whitespace, and non-integer numeric syntax', async () => {
  for (const value of ['', '%20%20', '2001.5', '2e3', '0x7d1', '-1', '10000']) {
    const response = await fetch(`${apiOrigin}/api/v1/books?publicationYear=${value}`);
    assert.equal(response.status, 400, `publicationYear=${value}`);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', `publicationYear=${value}`);
  }
});

test('legacy q and empty substring filters are rejected', async () => {
  for (const query of ['q=tolkien', 'title=', 'author=%20%20', 'publisher=', 'category=%20']) {
    const response = await fetch(`${apiOrigin}/api/v1/books?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', query);
  }
});

test('book contract accepts combined exact filters and bounded pagination', async () => {
  const response = await fetch(`${apiOrigin}/api/v1/books?title=Ring&isbn=978-1-234&publicationYear=2001&limit=5`);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.books.at(-1), {
    filters: { title: 'Ring', isbn: '978-1-234', publicationYear: 2001 }, limit: 5, cursor: undefined,
  });
});

test('book contract rejects out-of-range limits and malformed cursors', async () => {
  for (const query of ['limit=0', 'limit=51', 'limit=1.5', 'cursor=', 'cursor=not-a-cursor']) {
    const response = await fetch(`${apiOrigin}/api/v1/books?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', query);
  }
});

test('copy contract accepts combined exact and substring filters', async () => {
  const response = await fetch(`${apiOrigin}/api/v1/copies?shelfLocation=North&isbn=978-1-234&copyId=COPY-1&status=AVAILABLE&limit=3`);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.copies.at(-1), {
    filters: { shelfLocation: 'North', isbn: '978-1-234', copyId: 'COPY-1', status: 'AVAILABLE' },
    limit: 3,
    cursor: undefined,
  });
});

test('copy contract rejects unknown fields, empty filters, and invalid exact values', async () => {
  for (const query of [
    'q=North',
    'shelfLocation=%20',
    'isbn=',
    'copyId=',
    'copyId=a%2Fb',
    'status=AVAILABLE_NOW',
  ]) {
    const response = await fetch(`${apiOrigin}/api/v1/copies?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', query);
  }
});

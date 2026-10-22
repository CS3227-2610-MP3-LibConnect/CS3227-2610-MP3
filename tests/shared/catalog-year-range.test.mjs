import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { apiErrorHandler } from '../../dist/apps/api/src/http/errors.js';
import { createCatalogRouter } from '../../dist/apps/api/src/routes/catalog.js';

const activeMember = {
  userId: 'catalog-range-member',
  name: 'Catalog Range Member',
  email: 'catalog-range-member@example.test',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'catalog-range-member-id',
};
const calls = [];
const repository = {
  async searchBooks(filters, limit, cursor) {
    calls.push({ filters, limit, cursor });
    return { items: [], nextCursor: null };
  },
};

const app = express();
app.use((request, _response, next) => {
  request.actor = activeMember;
  next();
});
app.use('/api/v1', createCatalogRouter(repository, {}, 'catalog-range-test-secret-at-least-32-characters'));
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

test('exact publication year remains accepted and is passed to the repository unchanged', async () => {
  const beforeCalls = calls.length;
  const response = await fetch(`${apiOrigin}/api/v1/books?publicationYear=2001`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], page: { limit: 20, nextCursor: null } });
  assert.deepEqual(calls.at(-1), {
    filters: { publicationYear: 2001 }, limit: 20, cursor: undefined,
  });
  assert.equal(calls.length, beforeCalls + 1);
});

test('inclusive range is accepted and both endpoints are passed to the repository', async () => {
  const beforeCalls = calls.length;
  const response = await fetch(`${apiOrigin}/api/v1/books?publicationYearFrom=2000&publicationYearTo=2002`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], page: { limit: 20, nextCursor: null } });
  assert.deepEqual(calls.at(-1), {
    filters: { publicationYearFrom: 2000, publicationYearTo: 2002 }, limit: 20, cursor: undefined,
  });
  assert.equal(calls.length, beforeCalls + 1);
});

test('incomplete, reversed, malformed, and exact-plus-range combinations return 400', async () => {
  const invalidQueries = [
    'publicationYearFrom=2000',
    'publicationYearTo=2002',
    'publicationYearFrom=2003&publicationYearTo=2000',
    'publicationYearFrom=year&publicationYearTo=2002',
    'publicationYearFrom=&publicationYearTo=2002',
    'publicationYearFrom=%20%20&publicationYearTo=2002',
    'publicationYearFrom=2000&publicationYearTo=',
    'publicationYearFrom=2000&publicationYearTo=%20',
    'publicationYear=2001&publicationYearFrom=2000&publicationYearTo=2002',
  ];

  for (const query of invalidQueries) {
    const response = await fetch(`${apiOrigin}/api/v1/books?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR', query);
  }
});

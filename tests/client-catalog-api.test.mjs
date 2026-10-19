import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogApi } from '../dist/apps/client/src/api/catalog.js';

function captureFetch(t, response) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return calls;
}

test('listBooks serializes a complete inclusive publication-year range with existing filters and pagination', async (t) => {
  const page = {
    items: [{ isbn: '9780000000001' }],
    page: { limit: 10, nextCursor: 'next-page-token' },
  };
  const calls = captureFetch(t, page);

  const result = await catalogApi.listBooks({
    title: 'systems',
    author: 'Ada Lovelace',
    publisher: 'Example Press',
    category: 'Computing',
    isbn: '9780000000001',
    publicationYearFrom: 1980,
    publicationYearTo: 2020,
    limit: 10,
    cursor: 'current-page-token',
  });

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url.pathname, '/api/v1/books');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    title: 'systems',
    author: 'Ada Lovelace',
    publisher: 'Example Press',
    category: 'Computing',
    isbn: '9780000000001',
    publicationYearFrom: '1980',
    publicationYearTo: '2020',
    limit: '10',
    cursor: 'current-page-token',
  });
  assert.equal(init.credentials, 'include');
  assert.deepEqual(result, page);
});

test('listBooks preserves exact publication-year serialization', async (t) => {
  const calls = captureFetch(t, { items: [], page: { limit: 25, nextCursor: null } });

  await catalogApi.listBooks({ publicationYear: 2001 });

  assert.equal(calls[0].url.searchParams.get('publicationYear'), '2001');
  assert.equal(calls[0].url.searchParams.has('publicationYearFrom'), false);
  assert.equal(calls[0].url.searchParams.has('publicationYearTo'), false);
});

test('listBooks rejects a partial publication-year range without making a request', async (t) => {
  const calls = captureFetch(t, { items: [], page: { limit: 25, nextCursor: null } });

  await assert.rejects(async () => {
    await catalogApi.listBooks({ publicationYearFrom: 2000 });
  });
  await assert.rejects(async () => {
    await catalogApi.listBooks({ publicationYearTo: 2020 });
  });
  assert.equal(calls.length, 0);
});

test('listBooks rejects exact year combined with a publication-year range without making a request', async (t) => {
  const calls = captureFetch(t, { items: [], page: { limit: 25, nextCursor: null } });

  await assert.rejects(async () => {
    await catalogApi.listBooks({
      publicationYear: 2000,
      publicationYearFrom: 1990,
      publicationYearTo: 2010,
    });
  });
  assert.equal(calls.length, 0);
});

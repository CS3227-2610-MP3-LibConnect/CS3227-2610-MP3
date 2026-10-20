import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { catalogApi } from '../../dist/apps/client/src/api/catalog.js';

const appSource = await readFile(new URL('../../apps/client/src/App.tsx', import.meta.url), 'utf8');
const pageDirectory = new URL('../../apps/client/src/pages/', import.meta.url);
const detailFile = (await readdir(pageDirectory)).find((name) => /book.*detail|detail.*book/i.test(name));
const detailSource = detailFile ? await readFile(new URL(detailFile, pageDirectory), 'utf8') : '';
const dashboardSource = await readFile(new URL('../../apps/client/src/pages/MemberDashboard.tsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../../apps/client/src/api/catalog.ts', import.meta.url), 'utf8');

test('detail route is registered for members and uses the ISBN route parameter', () => {
  assert.match(appSource, /path=["']\/member\/books\/:isbn["']/);
  assert.match(appSource, /ProtectedRoute\s+accountType=["']MEMBER["']/);
  assert.match(appSource, /MemberBookDetail/);
});

test('detail page loads through catalogApi and renders all book, copy, and availability fields', () => {
  assert.match(detailSource, /catalogApi\.getBook\s*\(/);
  for (const field of ['isbn', 'title', 'author', 'publicationYear', 'publisher', 'category', 'synopsis']) {
    assert.match(detailSource, new RegExp(`book\\.${field}\\b`), `detail should render book.${field}`);
  }
  assert.match(detailSource, /copy\.shelfLocation/);
  assert.match(detailSource, /copy\.status/);
  assert.match(detailSource, /availability\.(?:availableCount|totalCopies|byStatus)/);
});

test('copy location accepts null and renders a readable fallback while preserving real locations', () => {
  assert.match(detailSource, /shelfLocation\s*:\s*string\s*\|\s*null/);
  assert.match(detailSource, /copy\.shelfLocation\s*\?\?\s*['"]Not on shelf['"]/);
  assert.match(detailSource, /<strong>Shelf location:<\/strong>\s*\{\s*copy\.shelfLocation\s*\?\?/);
  assert.match(detailSource, /copy\.status\.replaceAll\('_',\s*' '\)/);
});

test('member catalog search and results remain independent of nullable copy locations', () => {
  assert.match(dashboardSource, /catalogApi\.listBooks\s*\(/);
  assert.match(dashboardSource, /member-catalog-results/);
  assert.match(dashboardSource, /book\.title/);
  assert.doesNotMatch(dashboardSource, /(?:copy|copies)\.shelfLocation/);
});

test('detail page communicates loading, missing-book, and request-failure states', () => {
  assert.match(detailSource, /Loading book|Loading details|aria-busy/);
  assert.match(detailSource, /not found|could not find|Book not found/i);
  assert.match(detailSource, /role=["']alert["']|could not load|failed to load/i);
});

test('catalog detail API uses the credentialed client and encodes the ISBN path segment', async (t) => {
  assert.match(apiSource, /getBook\s*<T>/);
  const responseBody = {
    book: { isbn: '978/0001', title: 'Test' },
    copies: [],
    availability: { totalCopies: 0, availableCount: 0, byStatus: {} },
  };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await catalogApi.getBook('978/0001');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/api/v1/books/978%2F0001');
  assert.equal(calls[0].init.credentials, 'include');
  assert.deepEqual(result, responseBody);
});

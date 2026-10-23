import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const indexes = JSON.parse(
  await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'),
);
const indexShape = (collectionGroup) =>
  indexes.indexes
    .filter(
      (index) => index.collectionGroup === collectionGroup && index.queryScope === 'COLLECTION',
    )
    .map((index) => index.fields.map(({ fieldPath, order }) => `${fieldPath}:${order}`).join(','));

test('catalog exact-filter queries have their required ordered composite indexes', () => {
  assert.ok(
    indexShape('books').includes('isbn:ASCENDING,publicationYear:ASCENDING,__name__:ASCENDING'),
  );
  assert.ok(
    indexShape('bookCopies').includes('isbn:ASCENDING,status:ASCENDING,__name__:ASCENDING'),
  );
});

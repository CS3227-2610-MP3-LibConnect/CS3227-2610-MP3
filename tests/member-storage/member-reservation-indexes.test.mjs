import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('reservation composite index supports pending and history list query ordering', async () => {
  const config = JSON.parse(
    await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'),
  );
  const indexes = config.indexes.filter(
    (index) => index.collectionGroup === 'reservations' && index.queryScope === 'COLLECTION',
  );
  const expected = [
    ['memberId', 'ASCENDING'],
    ['status', 'ASCENDING'],
    ['reservationDateTime', 'DESCENDING'],
    ['__name__', 'DESCENDING'],
  ];
  const matchesQuery = (fields) =>
    fields.length === expected.length &&
    fields.every(
      (field, index) =>
        field.fieldPath === expected[index][0] && field.order === expected[index][1],
    );

  // Both pending (status in ['PENDING']) and history (status in
  // ['FULFILLED', 'CANCELLED', 'EXPIRED']) use this same index shape.
  assert.ok(
    indexes.some(({ fields }) => matchesQuery(fields)),
    'reservation member/status filters and descending date/ID ordering need a composite index',
  );
});

test('reservation composite index supports the librarian pending assignment queue', async () => {
  const config = JSON.parse(
    await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'),
  );
  const indexes = config.indexes.filter(
    (index) => index.collectionGroup === 'reservations' && index.queryScope === 'COLLECTION',
  );
  const expected = [
    ['isbn', 'ASCENDING'],
    ['status', 'ASCENDING'],
    ['reservationDateTime', 'ASCENDING'],
    ['__name__', 'ASCENDING'],
  ];
  assert.ok(
    indexes.some(
      ({ fields }) =>
        fields.length === expected.length &&
        fields.every(
          (field, index) =>
            field.fieldPath === expected[index][0] && field.order === expected[index][1],
        ),
    ),
    'librarian pending queue filters ISBN/status and orders by date and document ID',
  );
});

test('reservation composite index supports the member ISBN pending lookup and duplicate check', async () => {
  const config = JSON.parse(
    await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'),
  );
  const indexes = config.indexes.filter(
    (index) => index.collectionGroup === 'reservations' && index.queryScope === 'COLLECTION',
  );
  const expected = [
    ['memberId', 'ASCENDING'],
    ['isbn', 'ASCENDING'],
    ['status', 'ASCENDING'],
  ];
  assert.ok(
    indexes.some(
      ({ fields }) =>
        fields.length === expected.length &&
        fields.every(
          (field, index) =>
            field.fieldPath === expected[index][0] && field.order === expected[index][1],
        ),
    ),
    'member pending-reservation lookup and creation duplicate check filter by member ID, ISBN, and status',
  );
});

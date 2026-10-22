import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Firestore manifest covers bounded circulation query shapes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  const indexKeys = new Set(manifest.indexes.map((index) => `${index.collectionGroup}:${index.fields.map((field) => `${field.fieldPath}:${field.order}`).join(',')}`));
  assert.ok(indexKeys.has('loans:status:ASCENDING,borrowDateTime:ASCENDING,__name__:ASCENDING'));
  assert.ok(indexKeys.has('reservations:isbn:ASCENDING,status:ASCENDING,copyId:ASCENDING,expiryDate:ASCENDING,reservationDateTime:ASCENDING,__name__:ASCENDING'));
  assert.ok(indexKeys.has('reservations:status:ASCENDING,expiryDate:ASCENDING'));
  assert.ok(indexKeys.has('reservations:status:ASCENDING,reservationDateTime:ASCENDING,__name__:ASCENDING'));
  assert.ok(indexKeys.has('reservations:isbn:ASCENDING,status:ASCENDING,reservationDateTime:ASCENDING,__name__:ASCENDING'));
  assert.ok(indexKeys.has('fines:status:ASCENDING,issuedDateTime:DESCENDING,__name__:DESCENDING'));
  assert.ok(indexKeys.has('loans:status:ASCENDING,dueDate:ASCENDING,__name__:ASCENDING'));
});

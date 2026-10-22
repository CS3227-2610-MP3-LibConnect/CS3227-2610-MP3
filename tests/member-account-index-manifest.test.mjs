import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('member account list queries have deterministic bounded Firestore indexes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  const indexes = manifest.indexes.filter((index) => index.collectionGroup === 'users').map((index) => index.fields.map((field) => `${field.fieldPath}:${field.order}`));
  assert.ok(indexes.some((fields) => fields.join('|') === 'accountType:ASCENDING|registrationDateTime:ASCENDING|__name__:ASCENDING'));
  assert.ok(indexes.some((fields) => fields.join('|') === 'accountType:ASCENDING|accountStatus:ASCENDING|registrationDateTime:ASCENDING|__name__:ASCENDING'));
});

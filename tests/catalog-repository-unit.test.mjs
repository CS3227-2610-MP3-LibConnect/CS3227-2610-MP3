import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { LibraryRepository, StorageError } from '../dist/apps/api/src/storage/repositories.js';

class Snapshot {
  constructor(id, value) { this.id = id; this._value = value; this.exists = value !== undefined; }
  data() { return this._value; }
  get(field) { return this._value?.[field]; }
}

class Query {
  constructor(db, collection, filters = [], afterId = undefined, limitCount = undefined) {
    this.db = db; this.collection = collection; this.filters = filters; this.afterId = afterId; this.limitCount = limitCount;
  }
  where(field, operator, value) { assert.equal(operator, '=='); return new Query(this.db, this.collection, [...this.filters, [field, value]], this.afterId, this.limitCount); }
  orderBy() { return this; }
  limit(value) { return new Query(this.db, this.collection, this.filters, this.afterId, value); }
  startAfter(id) { return new Query(this.db, this.collection, this.filters, id, this.limitCount); }
  async get() {
    let values = [...(this.db.data.get(this.collection)?.entries() ?? [])]
      .filter(([, value]) => this.filters.every(([field, expected]) => value[field] === expected))
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId));
    if (this.afterId) values = values.filter(([id]) => id > this.afterId);
    if (this.limitCount !== undefined) values = values.slice(0, this.limitCount);
    return { empty: values.length === 0, size: values.length, docs: values.map(([id, value]) => new Snapshot(id, value)) };
  }
}

class DocumentReference {
  constructor(db, collection, id) { this.db = db; this.collection = collection; this.id = id; }
  async get() { return new Snapshot(this.id, this.db.data.get(this.collection)?.get(this.id)); }
  async set(value) { this.db.ensure(this.collection).set(this.id, value); }
  async delete() { this.db.data.get(this.collection)?.delete(this.id); }
}

class Transaction {
  constructor(db) { this.db = db; this.operations = []; }
  async get(target) { return target instanceof Query ? target.get() : target.get(); }
  create(ref, value) { this.operations.push(() => { if (this.db.data.get(ref.collection)?.has(ref.id)) throw new StorageError('CONFLICT', 'already exists'); this.db.ensure(ref.collection).set(ref.id, value); }); }
  update(ref, value) { this.operations.push(() => { const current = this.db.data.get(ref.collection)?.get(ref.id); if (!current) throw new StorageError('NOT_FOUND', 'missing'); this.db.ensure(ref.collection).set(ref.id, { ...current, ...value }); }); }
  delete(ref) { this.operations.push(() => { this.db.data.get(ref.collection)?.delete(ref.id); }); }
  commit() { for (const operation of this.operations) operation(); }
}

class FakeDb {
  constructor() { this.data = new Map(); }
  ensure(collection) { if (!this.data.has(collection)) this.data.set(collection, new Map()); return this.data.get(collection); }
  collection(collection) {
    return {
      doc: (id) => new DocumentReference(this, collection, id),
      where: (field, operator, value) => new Query(this, collection).where(field, operator, value),
      orderBy: () => new Query(this, collection),
      get: () => new Query(this, collection).get(),
    };
  }
  async runTransaction(callback) { const transaction = new Transaction(this); const result = await callback(transaction); transaction.commit(); return result; }
}

const actor = { userId: 'librarian-1', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE' };
const now = () => Timestamp.now();

function book(isbn) {
  const timestamp = now();
  return { isbn, title: 'Book', author: 'Author', publicationYear: 2026, publisher: 'Publisher', category: 'Category', synopsis: '', createdAt: timestamp, updatedAt: timestamp };
}

function copy(copyId, isbn, status) {
  const timestamp = now();
  return { copyId, isbn, shelfLocation: 'SHELF-1', status, createdAt: timestamp, updatedAt: timestamp };
}

function conflict(error) { return error instanceof StorageError && error.code === 'CONFLICT'; }

test('repository enforces book/copy invariants and server-owned fields without an emulator', async () => {
  const db = new FakeDb();
  const repository = new LibraryRepository(db);
  const isbn = '978-unit-test';
  await repository.createBook({ isbn, title: 'Book', author: 'Author', publicationYear: 2026, publisher: 'Publisher', category: 'Category', synopsis: '' }, actor);
  await assert.rejects(repository.createBook({ isbn, title: 'Duplicate', author: 'Author', publicationYear: 2026, publisher: 'Publisher', category: 'Category', synopsis: '' }, actor), conflict);
  await assert.rejects(repository.updateBook(isbn, { isbn: 'forged' }, actor), (error) => error instanceof StorageError && error.code === 'INVALID');
  assert.equal((await repository.getBook(isbn)).isbn, isbn);

  await assert.rejects(repository.createCopy({ copyId: 'missing-parent-copy', isbn: 'missing-parent', shelfLocation: 'SHELF-X' }, actor), (error) => error instanceof StorageError && error.code === 'NOT_FOUND');
  const created = await repository.createCopy({ copyId: 'available-copy', isbn, shelfLocation: 'SHELF-A' }, actor);
  assert.equal(created.status, 'AVAILABLE');
  assert.equal((await repository.updateCopy(created.copyId, 'SHELF-B', actor)).status, 'AVAILABLE');

  db.ensure('loans').set('active-loan', { copyId: 'guarded-copy', status: 'ACTIVE' });
  db.ensure('bookCopies').set('guarded-copy', copy('guarded-copy', isbn, 'DAMAGED'));
  await assert.rejects(repository.deleteCopy('guarded-copy', actor), conflict);
  db.data.get('loans').delete('active-loan');
  db.ensure('reservations').set('pending-reservation', { copyId: 'guarded-copy', status: 'PENDING' });
  await assert.rejects(repository.deleteCopy('guarded-copy', actor), conflict);
  db.data.get('reservations').delete('pending-reservation');
  await repository.deleteCopy('guarded-copy', actor);

  for (const status of ['IN_TRANSIT', 'ON_LOAN', 'RESERVED']) {
    const copyId = `${status.toLowerCase()}-copy`;
    db.ensure('bookCopies').set(copyId, copy(copyId, isbn, status));
    await assert.rejects(repository.deleteCopy(copyId, actor), conflict);
  }

  db.ensure('bookCopies').set('lost-copy', copy('lost-copy', isbn, 'LOST'));
  await assert.rejects(repository.deleteBook(isbn, actor), conflict);
  await repository.deleteCopy('available-copy', actor);
  await repository.deleteCopy('lost-copy', actor);
  for (const status of ['IN_TRANSIT', 'ON_LOAN', 'RESERVED']) db.data.get('bookCopies').delete(`${status.toLowerCase()}-copy`);
  await repository.deleteBook(isbn, actor);

  const summary = await repository.inventorySummary(actor);
  assert.deepEqual(summary, { totalTitles: 0, totalCopies: 0, availableCopies: 0, byStatus: { AVAILABLE: 0, IN_TRANSIT: 0, ON_LOAN: 0, DAMAGED: 0, LOST: 0, RESERVED: 0 } });
});

test('catalog search allowlists stored fields and binds cursors canonically', async () => {
  const db = new FakeDb();
  const repository = new LibraryRepository(db);
  const first = book('978-search-1');
  const second = book('978-search-2');
  db.ensure('books').set(first.isbn, { ...first, passwordHash: 'CANARY' });
  db.ensure('books').set(second.isbn, { ...second, sessionId: 'CANARY' });

  const firstPage = await repository.searchBooks({ title: 'Book', author: 'Author' }, 1);
  assert.equal(firstPage.items[0].passwordHash, undefined);
  assert.equal(firstPage.items[0].sessionId, undefined);
  assert.ok(firstPage.nextCursor);
  assert.equal(firstPage.nextCursor.kind, 'book');

  const secondPage = await repository.searchBooks({ author: 'Author', title: 'Book' }, 1, firstPage.nextCursor);
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.items[0].isbn, second.isbn);
  assert.equal(secondPage.items[0].passwordHash, undefined);
  assert.equal(secondPage.items[0].sessionId, undefined);
  await assert.rejects(
    repository.searchBooks({ title: 'Different', author: 'Author' }, 1, firstPage.nextCursor),
    (error) => error instanceof StorageError && error.code === 'INVALID',
  );
  await assert.rejects(
    repository.searchBooks({ author: 'Author', title: 'Book' }, 1, { ...firstPage.nextCursor, kind: 'copy' }),
    (error) => error instanceof StorageError && error.code === 'INVALID',
  );
});

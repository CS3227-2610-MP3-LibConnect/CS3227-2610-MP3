import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { LibraryRepository, StorageError } from '../dist/apps/api/src/storage/repositories.js';

class Snapshot {
  constructor(id, value) { this.id = id; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
  get(field) { return this.value?.[field]; }
}

function compare(a, b) {
  if (a instanceof Timestamp && b instanceof Timestamp) {
    return a.seconds === b.seconds ? Math.sign(a.nanoseconds - b.nanoseconds) : Math.sign(a.seconds - b.seconds);
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

class Query {
  static requestedLimits = [];
  constructor(records, state = {}) {
    this.records = records;
    this.filters = state.filters ?? [];
    this.ordering = state.ordering ?? [];
    this.pageLimit = state.pageLimit ?? Infinity;
    this.cursor = state.cursor ?? null;
  }
  copy(state) { return new Query(this.records, { filters: this.filters, ordering: this.ordering, pageLimit: this.pageLimit, cursor: this.cursor, ...state }); }
  where(field, operator, value) { return this.copy({ filters: [...this.filters, [field === '__name__' ? '__name__' : field, operator, value]] }); }
  orderBy(field, direction = 'asc') { return this.copy({ ordering: [...this.ordering, [typeof field === 'string' ? field : '__name__', direction]] }); }
  limit(pageLimit) { Query.requestedLimits.push(pageLimit); return this.copy({ pageLimit }); }
  startAfter(...cursor) { return this.copy({ cursor }); }
  async get() {
    let docs = [...this.records.entries()]
      .map(([id, value]) => new Snapshot(id, value))
      .filter((doc) => this.filters.every(([field, operator, expected]) => {
        const actual = field === '__name__' ? doc.id : doc.get(field);
        return operator === '==' ? actual === expected : operator === 'in' && expected.includes(actual);
      }));
    const value = (doc, field) => field === '__name__' ? doc.id : doc.get(field);
    docs.sort((left, right) => {
      for (const [field, direction] of this.ordering) {
        const result = compare(value(left, field), value(right, field));
        if (result) return result * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
    if (this.cursor) {
      docs = docs.filter((doc) => {
        for (let index = 0; index < this.ordering.length; index += 1) {
          const [field, direction] = this.ordering[index];
          const result = compare(value(doc, field), this.cursor[index]);
          if (result) return direction === 'desc' ? result < 0 : result > 0;
        }
        return false;
      });
    }
    return { docs: docs.slice(0, this.pageLimit), size: Math.min(docs.length, this.pageLimit), empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  records = new Map([['reservations', new Map()], ['books', new Map()]]);
  queryLimits = [];
  batches = [];
  collection(name) {
    const records = this.records.get(name);
    return {
      doc: (id) => ({ id, collectionName: name, get: async () => new Snapshot(id, records.get(id)) }),
      where: (field, operator, value) => new Query(records).where(field, operator, value),
    };
  }
  async getAll(...refs) {
    this.batches.push(refs.map(({ id }) => id));
    return refs.map((ref) => new Snapshot(ref.id, this.records.get(ref.collectionName).get(ref.id)));
  }
}

const member = { userId: 'user-a', memberId: 'member-a', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const other = { ...member, userId: 'user-b', memberId: 'member-b' };
const librarian = { userId: 'staff', employeeId: 'staff-1', isManager: false, accountType: 'LIBRARIAN', accountStatus: 'ACTIVE' };
const at = (millis) => Timestamp.fromMillis(millis);
function reservation(id, overrides = {}) {
  return { reservationId: id, memberId: member.memberId, isbn: 'isbn-1', copyId: null, reservationDateTime: at(100), expiryDate: null, status: 'PENDING', ...overrides };
}
function book(isbn, title = `Title ${isbn}`) {
  return { isbn, title, author: 'Author', publicationYear: 2024, publisher: 'Press', category: 'Fiction', synopsis: '', createdAt: at(1), updatedAt: at(1) };
}
function setup(reservations = [], books = []) {
  const db = new MemoryFirestore();
  for (const item of reservations) db.records.get('reservations').set(item.reservationId, item);
  for (const item of books) db.records.get('books').set(item.isbn, item);
  return { db, repository: new LibraryRepository(db) };
}

test('reservation pages derive member ownership, filter pending and history, and batch title enrichment', async () => {
  const records = [
    reservation('p1', { isbn: 'isbn-1', status: 'PENDING', reservationDateTime: at(300) }),
    reservation('p2', { isbn: 'isbn-2', status: 'PENDING', reservationDateTime: at(200) }),
    reservation('f1', { status: 'FULFILLED' }),
    reservation('c1', { status: 'CANCELLED' }),
    reservation('e1', { status: 'EXPIRED' }),
    reservation('foreign', { memberId: other.memberId, reservationDateTime: at(900) }),
  ];
  const { db, repository } = setup(records, [book('isbn-1'), book('isbn-2')]);
  const pending = await repository.memberReservations(member, 'pending', 10);
  const history = await repository.memberReservations(member, 'history', 10);
  assert.deepEqual(pending.items.map((item) => item.reservationId), ['p1', 'p2']);
  assert.deepEqual(history.items.map((item) => item.reservationId), ['f1', 'e1', 'c1']);
  assert.ok([...pending.items, ...history.items].every((item) => typeof item.bookTitle === 'string' && item.memberId === member.memberId));
  assert.deepEqual(Object.keys(pending.items[0]).sort(), ['bookTitle', 'copyId', 'expiryDate', 'isbn', 'memberId', 'reservationDateTime', 'reservationId', 'status']);
  assert.deepEqual(db.batches, [['isbn-1', 'isbn-2'], ['isbn-1']]);
});

test('reservation pagination uses limit plus one and timestamp plus descending document ID without gaps or duplicates', async () => {
  const sameTime = at(200);
  const records = [
    reservation('a', { reservationDateTime: at(300) }),
    reservation('b', { reservationDateTime: sameTime }),
    reservation('c', { reservationDateTime: sameTime }),
    reservation('d', { reservationDateTime: at(100) }),
  ];
  const { repository } = setup(records, [book('isbn-1')]);
  Query.requestedLimits = [];
  const ids = [];
  let cursor;
  do {
    const page = await repository.memberReservations(member, 'pending', 1, cursor);
    assert.ok(page.items.length <= 1);
    ids.push(...page.items.map(({ reservationId }) => reservationId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, ['a', 'c', 'b', 'd']);
  assert.equal(new Set(ids).size, records.length);
  assert.ok(Query.requestedLimits.every((value) => value === 2), 'each Firestore page fetch must request limit + 1 only');
});

test('reservation query validates bounds, actor, view, and cursor member/view binding', async () => {
  const { repository } = setup([reservation('r1')], [book('isbn-1')]);
  for (const limit of [0, -1, 51, 1.5, NaN]) {
    await assert.rejects(repository.memberReservations(member, 'pending', limit), (error) => error instanceof StorageError && error.code === 'INVALID');
  }
  for (const actor of [undefined, librarian, { ...member, accountStatus: 'INACTIVE' }, { ...member, memberId: '  ' }]) {
    await assert.rejects(repository.memberReservations(actor, 'pending', 10), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  }
  await assert.rejects(repository.memberReservations(member, 'all', 10), (error) => error instanceof StorageError && error.code === 'INVALID');
  const cursor = { memberId: member.memberId, view: 'pending', reservationDateTimeSeconds: 1, reservationDateTimeNanoseconds: 0, reservationId: 'r1' };
  await assert.rejects(repository.memberReservations(other, 'pending', 10, cursor), (error) => error instanceof StorageError && error.code === 'INVALID');
  await assert.rejects(repository.memberReservations(member, 'history', 10, cursor), (error) => error instanceof StorageError && error.code === 'INVALID');
  await assert.rejects(repository.memberReservations(member, 'pending', 10, { ...cursor, reservationDateTimeNanoseconds: 1_000_000_000 }), (error) => error instanceof StorageError && error.code === 'INVALID');
});

test('reservation response validates stored records before returning UI fields', async () => {
  const invalid = reservation('bad-record', { reservationDateTime: 'not-a-timestamp' });
  const { repository } = setup([invalid], [book('isbn-1')]);
  await assert.rejects(repository.memberReservations(member, 'pending', 10));
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { LibraryRepository, StorageError } from '../../dist/apps/api/src/storage/repositories.js';
import { FineRecordSchema } from '../../dist/packages/shared/src/domain/records.js';

class Snapshot {
  constructor(id, value) { this.id = id; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
  get(field) { return this.value?.[field]; }
}

class Query {
  constructor(records, filters = [], ordering = [], pageLimit = Infinity, cursor = null) {
    Object.assign(this, { records, filters, ordering, pageLimit, cursor });
  }
  where(field, operator, expected) {
    assert.ok(['==', 'in'].includes(operator));
    return new Query(this.records, [...this.filters, [field, operator, expected]], this.ordering, this.pageLimit, this.cursor);
  }
  orderBy(field, direction = 'asc') {
    return new Query(this.records, this.filters, [...this.ordering, [typeof field === 'string' ? field : '__name__', direction]], this.pageLimit, this.cursor);
  }
  limit(value) { return new Query(this.records, this.filters, this.ordering, value, this.cursor); }
  startAfter(...values) { return new Query(this.records, this.filters, this.ordering, this.pageLimit, values); }
  async get() {
    const valueAt = (doc, field) => field === '__name__' ? doc.id : doc.get(field);
    let docs = [...this.records.entries()].map(([id, value]) => new Snapshot(id, value))
      .filter((doc) => this.filters.every(([field, operator, expected]) => operator === 'in' ? expected.includes(valueAt(doc, field)) : valueAt(doc, field) === expected));
    const compare = (a, b) => {
      if (a instanceof Timestamp && b instanceof Timestamp) return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
      return a === b ? 0 : a < b ? -1 : 1;
    };
    docs.sort((left, right) => {
      for (const [field, direction] of this.ordering) {
        const result = compare(valueAt(left, field), valueAt(right, field));
        if (result) return result * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
    if (this.cursor) docs = docs.filter((doc) => {
      for (let i = 0; i < this.ordering.length; i += 1) {
        const [field, direction] = this.ordering[i];
        const result = compare(valueAt(doc, field), this.cursor[i]);
        if (result) return direction === 'desc' ? result < 0 : result > 0;
      }
      return false;
    });
    docs = docs.slice(0, this.pageLimit);
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  records = new Map([['fines', new Map()]]);
  collection(name) {
    const records = this.records.get(name) ?? new Map();
    this.records.set(name, records);
    return { where: (field, operator, value) => new Query(records).where(field, operator, value) };
  }
}

const member = { userId: 'user-a', memberId: 'member-a', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const otherMember = { ...member, userId: 'user-b', memberId: 'member-b' };
const librarian = { userId: 'librarian', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE' };
const issued = (seconds, nanos = 0) => new Timestamp(seconds, nanos);
function fine(fineId, memberId, status, time) {
  return { fineId, loanId: `loan-${fineId}`, memberId, bookTitle: `Book ${fineId}`, amountMinorUnits: 250,
    currency: 'SGD', reason: 'Late return', status, issuedDateTime: time, paidDateTime: null, waivedDateTime: null };
}
function setup(fines) {
  const db = new MemoryFirestore();
  for (const value of fines) db.records.get('fines').set(value.fineId, value);
  return { db, repository: new LibraryRepository(db) };
}

test('member fine outstanding view derives owner from active member and returns only outstanding schema-valid records', async () => {
  const own = [fine('out-1', member.memberId, 'OUTSTANDING', issued(20)), fine('paid-1', member.memberId, 'PAID', issued(30))];
  const { repository } = setup([...own, fine('foreign', otherMember.memberId, 'OUTSTANDING', issued(40))]);
  const result = await repository.memberFines(member, 'outstanding', 20);
  assert.deepEqual(result.items.map((item) => item.fineId), ['out-1']);
  assert.ok(result.items.every((item) => FineRecordSchema.safeParse(item).success));
  for (const actor of [undefined, librarian, { ...member, accountStatus: 'INACTIVE' }, { ...member, memberId: '' }]) {
    await assert.rejects(repository.memberFines(actor, 'outstanding', 20), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  }
});

test('fine history pages only paid and waived records newest first without duplicate or skipped ties', async () => {
  const time = issued(100, 500_000);
  const own = [fine('a', member.memberId, 'PAID', time), fine('b', member.memberId, 'WAIVED', time),
    fine('c', member.memberId, 'PAID', issued(99)), fine('d', member.memberId, 'OUTSTANDING', issued(101))];
  const { repository } = setup([...own, fine('foreign', otherMember.memberId, 'PAID', issued(200))]);
  const ids = [];
  let cursor = null;
  do {
    const page = await repository.memberFines(member, 'history', 1, cursor);
    assert.ok(page.items.length <= 1);
    assert.ok(page.items.every((item) => ['PAID', 'WAIVED'].includes(item.status)));
    assert.ok(page.items.every((item) => FineRecordSchema.safeParse(item).success));
    ids.push(...page.items.map((item) => item.fineId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, ['b', 'a', 'c']);
  assert.equal(new Set(ids).size, 3);
});

test('history cursor is bound to member and view and rejects malformed cursor or page bounds', async () => {
  const { repository } = setup([fine('one', member.memberId, 'PAID', issued(2)), fine('two', member.memberId, 'WAIVED', issued(1))]);
  const page = await repository.memberFines(member, 'history', 1);
  assert.ok(page.nextCursor);
  await assert.rejects(repository.memberFines(otherMember, 'history', 1, page.nextCursor), (error) => error instanceof StorageError && error.code === 'INVALID');
  await assert.rejects(repository.memberFines(member, 'outstanding', 1, page.nextCursor), (error) => error instanceof StorageError && error.code === 'INVALID');
  for (const limit of [0, -1, 51, 1.5, NaN]) {
    await assert.rejects(repository.memberFines(member, 'history', limit), (error) => error instanceof StorageError && error.code === 'INVALID');
  }
  await assert.rejects(repository.memberFines(member, 'history', 20, { memberId: member.memberId }), (error) => error instanceof StorageError && error.code === 'INVALID');
});

test('member fine queries reject malformed stored records through FineRecordSchema', async () => {
  const { repository } = setup([{ ...fine('broken', member.memberId, 'OUTSTANDING', issued(1)), amountMinorUnits: 0 }]);
  await assert.rejects(repository.memberFines(member, 'outstanding', 20));
});

test('fine indexes cover member status filtering and deterministic issue-time/document-ID ordering', async () => {
  const config = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  const indexes = config.indexes.filter((index) => index.collectionGroup === 'fines');
  const covers = (fields, expected) => expected.every(([path, order]) => fields.some((field) => field.fieldPath === path && field.order === order));
  assert.ok(indexes.some(({ fields }) => covers(fields, [['memberId', 'ASCENDING'], ['status', 'ASCENDING'], ['issuedDateTime', 'DESCENDING'], ['__name__', 'DESCENDING']])),
    'member and status filters plus issue-time and ID ordering need a composite index');
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { LibraryRepository, StorageError } from '../dist/apps/api/src/storage/repositories.js';

class Snapshot {
  constructor(id, value) { this.id = id; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
  get(field) { return this.value?.[field]; }
}

class Query {
  constructor(records, filters = [], ordering = [], pageLimit = Infinity, cursor = null) {
    Object.assign(this, { records, filters, ordering, pageLimit, cursor });
  }
  copy(changes) { return new Query(this.records, this.filters, this.ordering, this.pageLimit, this.cursor, changes); }
  where(field, operator, value) {
    assert.equal(operator, '==');
    return new Query(this.records, [...this.filters, [field, value]], this.ordering, this.pageLimit, this.cursor);
  }
  orderBy(field, direction = 'asc') {
    const name = typeof field === 'string' ? field : '__name__';
    return new Query(this.records, this.filters, [...this.ordering, [name, direction]], this.pageLimit, this.cursor);
  }
  limit(value) { return new Query(this.records, this.filters, this.ordering, value, this.cursor); }
  startAfter(...values) { return new Query(this.records, this.filters, this.ordering, this.pageLimit, values); }
  async get() {
    let docs = [...this.records.entries()]
      .filter(([, value]) => this.filters.every(([field, expected]) => value[field] === expected))
      .map(([id, value]) => new Snapshot(id, value));
    const fieldValue = (doc, field) => field === '__name__' ? doc.id : doc.get(field);
    docs.sort((left, right) => {
      for (const [field, direction] of this.ordering) {
        const a = fieldValue(left, field);
        const b = fieldValue(right, field);
        const comparison = a instanceof Timestamp && b instanceof Timestamp
          ? a.seconds !== b.seconds ? (a.seconds < b.seconds ? -1 : 1)
            : a.nanoseconds === b.nanoseconds ? 0 : a.nanoseconds < b.nanoseconds ? -1 : 1
          : a === b ? 0 : a < b ? -1 : 1;
        if (comparison !== 0) return comparison * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
    if (this.cursor) {
      docs = docs.filter((doc) => {
        for (let i = 0; i < this.ordering.length; i += 1) {
          const [field, direction] = this.ordering[i];
          const current = fieldValue(doc, field);
          const prior = this.cursor[i];
          const comparison = current instanceof Timestamp && prior instanceof Timestamp
            ? current.seconds !== prior.seconds ? (current.seconds < prior.seconds ? -1 : 1)
              : current.nanoseconds === prior.nanoseconds ? 0 : current.nanoseconds < prior.nanoseconds ? -1 : 1
            : current === prior ? 0 : current < prior ? -1 : 1;
          if (comparison !== 0) return direction === 'desc' ? comparison < 0 : comparison > 0;
        }
        return false;
      });
    }
    docs = docs.slice(0, this.pageLimit);
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  records = new Map([['notifications', new Map()]]);
  collection(name) {
    const records = this.records.get(name) ?? new Map();
    this.records.set(name, records);
    return {
      doc: (id) => ({ id, get: async () => new Snapshot(id, records.get(id)) }),
      where: (field, operator, value) => new Query(records).where(field, operator, value),
    };
  }
}

const member = { userId: 'member-a', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const otherMember = { userId: 'member-b', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const librarian = { userId: 'librarian', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE' };
const at = (millis) => Timestamp.fromMillis(millis);
function notification(notificationId, recipientUserId, millis, read) {
  return { notificationId, recipientUserId, notificationType: 'LIBRARIAN_MESSAGE', referenceType: null, referenceId: null, message: notificationId, createdAt: millis instanceof Timestamp ? millis : at(millis), read };
}
function setup(records) {
  const db = new MemoryFirestore();
  for (const item of records) db.records.get('notifications').set(item.notificationId, item);
  return { db, repository: new LibraryRepository(db) };
}

test('notification preview applies unread/read selection rules, newest-first and actor scope', async () => {
  const cases = [
    { label: 'zero notifications', own: [], expected: [] },
    { label: 'zero unread', own: [notification('r-old', member.userId, 10, true), notification('r-new', member.userId, 30, true), notification('other', otherMember.userId, 40, false)], expected: ['r-new', 'r-old'] },
    { label: 'one unread', own: [notification('r-newest', member.userId, 30, true), notification('u-only', member.userId, 20, false), notification('r-older', member.userId, 10, true)], expected: ['r-newest', 'u-only'] },
    { label: 'multiple unread', own: [notification('u-old', member.userId, 10, false), notification('r-new', member.userId, 50, true), notification('u-new', member.userId, 30, false)], expected: ['u-new', 'u-old'] },
  ];
  for (const { label, own, expected } of cases) {
    const { repository } = setup([...own, notification('foreign', otherMember.userId, 99, false)]);
    const result = await repository.notificationPreview(member);
    assert.deepEqual(result.map((item) => item.notificationId), expected, label);
  }
});

test('preview orders equal timestamps deterministically and rejects inactive or wrong-role actors', async () => {
  const { repository } = setup([
    notification('tie-a', member.userId, 100, false),
    notification('tie-b', member.userId, 100, false),
  ]);
  const first = (await repository.notificationPreview(member)).map((item) => item.notificationId);
  const second = (await repository.notificationPreview(member)).map((item) => item.notificationId);
  assert.deepEqual(first, ['tie-b', 'tie-a']);
  assert.deepEqual(second, first);
  await assert.rejects(repository.notificationPreview({ ...member, accountStatus: 'INACTIVE' }), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  await assert.rejects(repository.notificationPreview(librarian), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
});

test('preview merge preserves timestamp precision across unread and read results', async () => {
  const second = 1_700_000_000;
  const { repository } = setup([
    notification('unread-older', member.userId, new Timestamp(second, 100_000), false),
    notification('read-newer', member.userId, new Timestamp(second, 900_000), true),
  ]);
  const result = await repository.notificationPreview(member);
  assert.deepEqual(result.map((item) => item.notificationId), ['read-newer', 'unread-older']);
});

test('notification history returns bounded pages with stable ordering, no duplicates or omissions, and actor scope', async () => {
  const own = [
    notification('n1', member.userId, 300, false),
    notification('n2', member.userId, 200, true),
    notification('n3', member.userId, 200, false),
    notification('n4', member.userId, 100, true),
    notification('n5', member.userId, 50, false),
  ];
  const { repository } = setup([...own, notification('foreign', otherMember.userId, 999, false)]);
  const ids = [];
  let cursor = null;
  do {
    const page = await repository.notificationHistory(member, 2, cursor);
    assert.ok(page.items.length <= 2, 'page must respect requested bound');
    ids.push(...page.items.map((item) => item.notificationId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, ['n1', 'n3', 'n2', 'n4', 'n5']);
  assert.equal(new Set(ids).size, own.length, 'history pages must not duplicate records');
});

test('history cursor preserves sub-millisecond timestamp precision across page boundaries', async () => {
  const second = 1_700_000_000;
  const own = [
    notification('n-low', member.userId, new Timestamp(second, 100_000), false),
    notification('n-mid', member.userId, new Timestamp(second, 500_000), false),
    notification('n-high', member.userId, new Timestamp(second, 900_000), false),
  ];
  const { repository } = setup(own);
  const ids = [];
  let cursor = null;
  do {
    const page = await repository.notificationHistory(member, 1, cursor);
    ids.push(...page.items.map((item) => item.notificationId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, ['n-high', 'n-mid', 'n-low']);
  assert.equal(new Set(ids).size, own.length);
});

test('history rejects invalid bounds and malformed or other-member cursors', async () => {
  const { repository } = setup([notification('n1', member.userId, 100, false)]);
  for (const limit of [0, -1, 101, 1.5, NaN]) {
    await assert.rejects(repository.notificationHistory(member, limit, null), (error) => error instanceof StorageError && error.code === 'INVALID');
  }
  const cursor = { recipientUserId: member.userId, createdAtSeconds: 1, createdAtNanoseconds: 0, notificationId: 'n1' };
  await assert.rejects(repository.notificationHistory(otherMember, 1, cursor), (error) => error instanceof StorageError && error.code === 'INVALID');
  await assert.rejects(repository.notificationHistory(member, 1, { ...cursor, createdAtNanoseconds: 1_000_000_000 }), (error) => error instanceof StorageError && error.code === 'INVALID');
});

test('notification composite indexes cover recipient scoped preview and createdAt ordered history', async () => {
  const config = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  const relevant = config.indexes.filter((index) => index.collectionGroup === 'notifications');
  assert.ok(relevant.length > 0, 'notification queries require declared composite indexes');
  const covers = (fields, expected) => expected.every(([path, order]) => fields.some((field) => field.fieldPath === path && field.order === order));
  assert.ok(relevant.some(({ fields }) => covers(fields, [['recipientUserId', 'ASCENDING'], ['createdAt', 'DESCENDING'], ['__name__', 'DESCENDING']])), 'history ordering index must include recipient, timestamp, and document ID');
  assert.ok(relevant.some(({ fields }) => covers(fields, [['recipientUserId', 'ASCENDING'], ['read', 'ASCENDING'], ['createdAt', 'DESCENDING'], ['__name__', 'DESCENDING']])), 'read-filtered query index must include recipient, read state, timestamp, and document ID');
});

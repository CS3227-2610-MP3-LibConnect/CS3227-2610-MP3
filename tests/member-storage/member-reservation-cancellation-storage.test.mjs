import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { LibraryWorkflows } from '../../dist/apps/api/src/storage/workflows.js';
import { StorageError } from '../../dist/apps/api/src/storage/repositories.js';

class Snapshot {
  constructor(id, value) { this.id = id; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
}

function clone(value) {
  if (value instanceof Timestamp) return Timestamp.fromMillis(value.toMillis());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

class Query {
  constructor(records, filters = []) { this.records = records; this.filters = filters; }
  where(field, operator, value) {
    assert.equal(operator, '==');
    return new Query(this.records, [...this.filters, [field, value]]);
  }
  async get() {
    const docs = [...this.records.entries()]
      .filter(([, value]) => this.filters.every(([field, expected]) => value[field] === expected))
      .map(([id, value]) => new Snapshot(id, value));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  records = new Map(['users', 'books', 'bookCopies', 'loans', 'reservations', 'notifications'].map((name) => [name, new Map()]));
  collection(name) {
    const records = this.records.get(name);
    const doc = (id) => ({ id, records, get: async () => new Snapshot(id, records.get(id)) });
    return { doc, where: (field, operator, value) => new Query(records).where(field, operator, value) };
  }
  async runTransaction(callback) {
    const writes = [];
    const tx = {
      get: async (target) => target instanceof Query ? target.get() : new Snapshot(target.id, target.records.get(target.id)),
      update: (ref, value) => writes.push(() => {
        const current = ref.records.get(ref.id);
        if (!current) throw new Error(`Document ${ref.id} does not exist`);
        ref.records.set(ref.id, { ...current, ...value });
      }),
    };
    const result = await callback(tx);
    for (const write of writes) write();
    return result;
  }
}

const now = Timestamp.fromMillis(1_800_000_000_000);
const owner = { userId: 'user-1', memberId: 'member-1', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const otherMember = { ...owner, userId: 'user-2', memberId: 'member-2' };
const librarian = { userId: 'staff-1', employeeId: 'employee-1', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE' };

function reservation(id, overrides = {}) {
  return { reservationId: id, memberId: owner.memberId, isbn: 'isbn-1', status: 'PENDING', reservationDateTime: now, copyId: null, expiryDate: null, ...overrides };
}

function reservedCopy(id, reservationId, overrides = {}) {
  return { copyId: id, isbn: 'isbn-1', status: 'RESERVED', reservationId, shelfLocation: 'A1', createdAt: now, updatedAt: now, ...overrides };
}

function setup({ reservations = [], copies = [] } = {}) {
  const db = new MemoryFirestore();
  db.records.get('users').set(owner.userId, owner);
  for (const value of reservations) db.records.get('reservations').set(value.reservationId, clone(value));
  for (const value of copies) db.records.get('bookCopies').set(value.copyId, clone(value));
  return { db, workflows: new LibraryWorkflows(db) };
}

test('owner can cancel an unassigned pending reservation without changing copies', async () => {
  const pending = reservation('reservation-1');
  const available = { ...reservedCopy('copy-unrelated', 'another'), status: 'AVAILABLE', reservationId: null };
  const { db, workflows } = setup({ reservations: [pending], copies: [available] });

  await workflows.cancelMemberReservation(pending.reservationId, owner);

  assert.equal(db.records.get('reservations').get(pending.reservationId).status, 'CANCELLED');
  assert.deepEqual(db.records.get('bookCopies').get(available.copyId), available);
});
test('owner cancellation atomically releases the linked reserved copy and retains assignment history without assigning the next reservation', async () => {
  const assigned = reservation('reservation-assigned', { copyId: 'copy-1', expiryDate: Timestamp.fromMillis(now.toMillis() + 1000) });
  const queued = reservation('reservation-queued', { memberId: 'member-2' });
  const copy = reservedCopy('copy-1', assigned.reservationId);
  const { db, workflows } = setup({ reservations: [assigned, queued], copies: [copy] });

  await workflows.cancelMemberReservation(assigned.reservationId, owner);

  const storedReservation = db.records.get('reservations').get(assigned.reservationId);
  assert.equal(storedReservation.status, 'CANCELLED');
  assert.equal(storedReservation.copyId, assigned.copyId);
  assert.equal(storedReservation.expiryDate.toMillis(), assigned.expiryDate.toMillis());
  assert.equal(db.records.get('bookCopies').get(copy.copyId).status, 'AVAILABLE');
  assert.equal(db.records.get('bookCopies').get(copy.copyId).reservationId, null);
  assert.equal(db.records.get('reservations').get(queued.reservationId).status, 'PENDING');
});

test('cancellation rejects a non-owner, inactive or non-member actor, and a reservation that is no longer pending', async () => {
  const pending = reservation('reservation-1');
  const fulfilled = reservation('reservation-fulfilled', { status: 'FULFILLED' });
  const { workflows } = setup({ reservations: [pending, fulfilled] });

  await assert.rejects(workflows.cancelMemberReservation(pending.reservationId, otherMember), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  for (const actor of [librarian, { ...owner, accountStatus: 'INACTIVE' }, undefined]) {
    await assert.rejects(workflows.cancelMemberReservation(pending.reservationId, actor), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  }
  await assert.rejects(workflows.cancelMemberReservation(fulfilled.reservationId, owner), (error) => error instanceof StorageError && error.code === 'CONFLICT');
});

test('a missing, non-reserved, or differently linked assigned copy conflicts without partial reservation update', async () => {
  const assigned = reservation('reservation-1', { copyId: 'copy-1', expiryDate: now });
  for (const copies of [
    [],
    [reservedCopy('copy-1', 'different-reservation')],
    [reservedCopy('copy-1', assigned.reservationId, { status: 'AVAILABLE', reservationId: null })],
  ]) {
    const { db, workflows } = setup({ reservations: [assigned], copies });
    await assert.rejects(workflows.cancelMemberReservation(assigned.reservationId, owner), (error) => error instanceof StorageError && error.code === 'CONFLICT');
    assert.deepEqual(db.records.get('reservations').get(assigned.reservationId), assigned);
    if (copies.length) assert.deepEqual(db.records.get('bookCopies').get('copy-1'), copies[0]);
  }
});

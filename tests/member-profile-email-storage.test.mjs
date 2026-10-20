import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { StorageError, UserRepository } from '../dist/apps/api/src/storage/repositories.js';

class Snapshot {
  constructor(id, value) { this.id = id; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
  get(field) { return this.value?.[field]; }
}

function clone(value) {
  if (value instanceof Timestamp) return Timestamp.fromMillis(value.toMillis());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

class MemoryFirestore {
  records = new Map([['users', new Map()], ['identityKeys', new Map()]]);
  tail = Promise.resolve();
  collection(name) {
    const records = this.records.get(name);
    return { doc: (id) => ({ id, records, get: async () => new Snapshot(id, records.get(id)) }) };
  }
  async runTransaction(callback) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const writes = [];
      const tx = {
        get: async (ref) => new Snapshot(ref.id, ref.records.get(ref.id)),
        create: (ref, value) => writes.push(() => {
          if (ref.records.has(ref.id)) throw new Error(`Document ${ref.id} already exists`);
          ref.records.set(ref.id, clone(value));
        }),
        set: (ref, value, options) => writes.push(() => ref.records.set(ref.id,
          options?.merge ? { ...(ref.records.get(ref.id) ?? {}), ...clone(value) } : clone(value))),
        delete: (ref) => writes.push(() => ref.records.delete(ref.id)),
      };
      const result = await callback(tx);
      for (const write of writes) write();
      return result;
    }
    finally { release(); }
  }
}

const member = {
  userId: 'email-member', name: 'Email Member', email: 'member@example.test', emailCanonical: 'member@example.test',
  passwordHash: 'hash-member', registrationDateTime: Timestamp.fromMillis(1), accountType: 'MEMBER',
  accountStatus: 'ACTIVE', memberId: 'member-id', authVersion: 3,
};
const librarian = {
  userId: 'email-librarian', name: 'Email Librarian', email: 'librarian@example.test', emailCanonical: 'librarian@example.test',
  passwordHash: 'hash-librarian', registrationDateTime: Timestamp.fromMillis(2), accountType: 'LIBRARIAN',
  accountStatus: 'INACTIVE', authVersion: 0, employeeId: 'employee-id', employeeIdCanonical: 'employee-id', isManager: true,
};

async function setup() {
  const db = new MemoryFirestore();
  const users = new UserRepository(db);
  await users.create(member);
  await users.create(librarian);
  return { db, users };
}

test('email updates atomically claim cross-role canonical identity and release the old key for login and registration', async () => {
  const { users } = await setup();
  await users.updateEmail(member.userId, '  New.Address@Example.Test  ');
  const updated = await users.getByEmail('new.address@example.test');
  assert.equal(updated.userId, member.userId);
  assert.equal(updated.email, 'New.Address@Example.Test');
  await assert.rejects(users.getByEmail(member.email), (error) => error instanceof StorageError && error.code === 'NOT_FOUND');
  await users.create({ ...member, userId: 'replacement-member', memberId: 'replacement-id' });
  assert.equal((await users.getByEmail(member.email)).userId, 'replacement-member');
});

test('email changes preserve status, role, password, registration and role-specific fields', async () => {
  const { users } = await setup();
  await users.updateEmail(member.userId, 'member.new@example.test');
  const changedMember = await users.getById(member.userId);
  assert.deepEqual({ ...changedMember, email: member.email, emailCanonical: member.emailCanonical }, member);
  assert.deepEqual(await users.getById(librarian.userId), librarian);
});

test('duplicate canonical email claims across member and librarian accounts cannot both succeed concurrently', async () => {
  const { users } = await setup();
  const outcomes = await Promise.allSettled([
    users.updateEmail(member.userId, 'shared@example.test'),
    users.updateEmail(librarian.userId, ' SHARED@example.test '),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1);
  const winner = await users.getByEmail('shared@example.test');
  assert.ok([member.userId, librarian.userId].includes(winner.userId));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { AccountStorage, assertCanDeactivateManager } from '../dist/apps/api/src/storage/accounts.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';

function user(overrides = {}) {
  return {
    userId: 'user-1', name: 'Librarian', email: 'librarian@example.test', emailCanonical: 'librarian@example.test',
    passwordHash: 'hash', registrationDateTime: Timestamp.now(), accountType: 'LIBRARIAN', accountStatus: 'ACTIVE',
    employeeId: 'EMP-1', employeeIdCanonical: 'emp-1', isManager: false, ...overrides,
  };
}

class FakeRef {
  constructor(db, id) { this.db = db; this.id = id; }
  async get() { return this.db.snapshot(this.id); }
}

class FakeQuery {
  constructor(db, filters = []) { this.db = db; this.filters = filters; }
  where(field, _operator, value) { return new FakeQuery(this.db, [...this.filters, [field, value]]); }
  matching() {
    return [...this.db.records.values()].filter((record) => this.filters.every(([field, value]) => record[field] === value));
  }
}

class FakeDb {
  constructor(records) { this.records = new Map(records.map((record) => [record.userId, { ...record }])); }
  collection(name) {
    assert.equal(name, 'users');
    return {
      doc: (id) => new FakeRef(this, id),
      where: (field, _operator, value) => new FakeQuery(this, [[field, value]]),
    };
  }
  snapshot(id) {
    const record = this.records.get(id);
    return { id, exists: Boolean(record), data: () => record };
  }
  async runTransaction(callback) {
    const updates = [];
    const tx = {
      get: async (reference) => reference instanceof FakeRef
        ? this.snapshot(reference.id)
        : { docs: reference.matching().map((record) => this.snapshot(record.userId)) },
      update: (reference, update) => updates.push([reference.id, update]),
    };
    await callback(tx);
    for (const [id, update] of updates) this.records.set(id, { ...this.records.get(id), ...update });
  }
}

test('manager status transaction updates a librarian and revokes sessions on deactivation', async () => {
  const manager = user({ userId: 'manager-1', employeeId: 'EMP-MANAGER', employeeIdCanonical: 'emp-manager', isManager: true });
  const target = user({ userId: 'target-1', employeeId: 'EMP-TARGET', employeeIdCanonical: 'emp-target' });
  const db = new FakeDb([manager, target]);
  const destroyed = [];
  const storage = new AccountStorage(db, { destroyForUser: async (userId) => destroyed.push(userId) });

  const activated = await storage.updateLibrarianStatus('target-1', 'INACTIVE', manager);
  assert.equal(activated.accountStatus, 'INACTIVE');
  assert.equal('passwordHash' in activated, false);
  assert.deepEqual(destroyed, ['target-1']);
  assert.equal(db.records.get('target-1').accountStatus, 'INACTIVE');
});

test('last active manager protection rejects self-deactivation and no-op changes', async () => {
  const manager = user({ userId: 'manager-1', employeeId: 'EMP-MANAGER', employeeIdCanonical: 'emp-manager', isManager: true });
  assert.throws(() => assertCanDeactivateManager(manager, 1), (error) => error instanceof StorageError && error.code === 'CONFLICT');

  const db = new FakeDb([manager]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });
  await assert.rejects(() => storage.updateLibrarianStatus('manager-1', 'ACTIVE', manager), (error) => error instanceof StorageError && error.code === 'CONFLICT');
  assert.equal(db.records.get('manager-1').accountStatus, 'ACTIVE');
});

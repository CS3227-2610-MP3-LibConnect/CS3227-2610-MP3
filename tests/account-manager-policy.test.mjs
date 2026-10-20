import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { AccountStorage, assertCanDeactivateManager } from '../dist/apps/api/src/storage/accounts.js';
import { requireActiveActor } from '../dist/apps/api/src/http/auth.js';
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
  constructor(records) {
    this.records = new Map(records.map((record) => [record.userId, { ...record }]));
    this.transactionTail = Promise.resolve();
  }
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
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    const updates = [];
    const tx = {
      get: async (reference) => reference instanceof FakeRef
        ? this.snapshot(reference.id)
        : { docs: reference.matching().map((record) => this.snapshot(record.userId)) },
      update: (reference, update) => updates.push([reference.id, update]),
    };
    try {
      await callback(tx);
      for (const [id, update] of updates) this.records.set(id, { ...this.records.get(id), ...update });
    } finally {
      release();
    }
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

test('manager authorization rejects inactive, non-manager, and member actors', async () => {
  const manager = user({ userId: 'manager-1', employeeId: 'EMP-MANAGER', employeeIdCanonical: 'emp-manager', isManager: true });
  const db = new FakeDb([manager]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });
  await assert.rejects(() => storage.listLibrarians(user({ accountStatus: 'INACTIVE', isManager: true })), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  await assert.rejects(() => storage.listLibrarians(user({ isManager: false })), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  await assert.rejects(() => storage.listLibrarians({ ...user({ accountType: 'MEMBER' }), memberId: 'member-1', isManager: false }), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
});

test('deactivation retries transient session-store failures and keeps inactive sessions denied', async () => {
  const manager = user({ userId: 'manager-1', employeeId: 'EMP-MANAGER', employeeIdCanonical: 'emp-manager', isManager: true });
  const target = user({ userId: 'target-1', employeeId: 'EMP-TARGET', employeeIdCanonical: 'emp-target' });
  const db = new FakeDb([manager, target]);
  let attempts = 0;
  const storage = new AccountStorage(db, {
    destroyForUser: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary session-store failure');
    },
  });

  await storage.updateLibrarianStatus('target-1', 'INACTIVE', manager);
  assert.equal(attempts, 2);
  const next = [];
  await requireActiveActor({ async getById(userId) { return db.records.get(userId); } })(
    { session: { userId: 'target-1', accountType: 'LIBRARIAN' } },
    {},
    (error) => next.push(error),
  );
  assert.equal(next[0].status, 403);
});

test('persistent session-store failure does not roll back the authorization change', async () => {
  const manager = user({ userId: 'manager-1', employeeId: 'EMP-MANAGER', employeeIdCanonical: 'emp-manager', isManager: true });
  const target = user({ userId: 'target-1', employeeId: 'EMP-TARGET', employeeIdCanonical: 'emp-target' });
  const db = new FakeDb([manager, target]);
  const queued = [];
  const storage = new AccountStorage(db, {
    destroyForUser: async () => { throw new Error('session-store unavailable'); },
    enqueueRevocation: async (userId) => queued.push(userId),
  });

  await assert.rejects(() => storage.updateLibrarianStatus('target-1', 'INACTIVE', manager), /session-store unavailable/);
  assert.equal(db.records.get('target-1').accountStatus, 'INACTIVE');
  assert.deepEqual(queued, ['target-1']);
});

test('last active manager protection rejects self-deactivation and no-op changes', async () => {
  const manager = user({ userId: 'manager-1', employeeId: 'EMP-MANAGER', employeeIdCanonical: 'emp-manager', isManager: true });
  assert.throws(() => assertCanDeactivateManager(manager, 1), (error) => error instanceof StorageError && error.code === 'CONFLICT');

  const db = new FakeDb([manager]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });
  await assert.rejects(() => storage.updateLibrarianStatus('manager-1', 'ACTIVE', manager), (error) => error instanceof StorageError && error.code === 'CONFLICT');
  assert.equal(db.records.get('manager-1').accountStatus, 'ACTIVE');
});

test('serialized transactions allow only one of two concurrent last-manager deactivations', async () => {
  const managerA = user({ userId: 'manager-a', employeeId: 'EMP-A', employeeIdCanonical: 'emp-a', isManager: true });
  const managerB = user({ userId: 'manager-b', employeeId: 'EMP-B', employeeIdCanonical: 'emp-b', isManager: true });
  const db = new FakeDb([managerA, managerB]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });

  const results = await Promise.allSettled([
    storage.updateLibrarianStatus('manager-a', 'INACTIVE', managerA),
    storage.updateLibrarianStatus('manager-b', 'INACTIVE', managerA),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.code === 'CONFLICT').length, 1);
  assert.equal([db.records.get('manager-a'), db.records.get('manager-b')].filter((record) => record.accountStatus === 'ACTIVE').length, 1);
});

test('missing and non-librarian targets do not change records', async () => {
  const manager = user({ userId: 'manager-1', employeeId: 'EMP-MANAGER', employeeIdCanonical: 'emp-manager', isManager: true });
  const member = user({ userId: 'member-1', accountType: 'MEMBER', memberId: 'member-1', employeeId: undefined, employeeIdCanonical: undefined, isManager: undefined });
  const db = new FakeDb([manager, member]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });

  await assert.rejects(() => storage.updateLibrarianStatus('missing', 'ACTIVE', manager), (error) => error instanceof StorageError && error.code === 'NOT_FOUND');
  await assert.rejects(() => storage.updateLibrarianStatus('member-1', 'INACTIVE', manager), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  assert.equal(db.records.get('member-1').accountStatus, 'ACTIVE');
});

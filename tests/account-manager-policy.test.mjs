import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AccountStorage,
  assertCanDeactivateManager,
} from '../dist/apps/api/src/storage/accounts.js';
import { requireActiveActor } from '../dist/apps/api/src/http/auth.js';
import { FirestoreSessionStore } from '../dist/apps/api/src/storage/firestore-session-store.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';

function user(overrides = {}) {
  return {
    userId: 'user-1',
    name: 'Librarian',
    email: 'librarian@example.test',
    emailCanonical: 'librarian@example.test',
    passwordHash: 'hash',
    registrationDateTime: Timestamp.now(),
    accountType: 'LIBRARIAN',
    accountStatus: 'ACTIVE',
    employeeId: 'EMP-1',
    employeeIdCanonical: 'emp-1',
    isManager: false,
    authVersion: 0,
    ...overrides,
  };
}

class FakeRef {
  constructor(db, id) {
    this.db = db;
    this.id = id;
  }
  async get() {
    return this.db.snapshot(this.id);
  }
}

class FakeQuery {
  constructor(db, filters = []) {
    this.db = db;
    this.filters = filters;
  }
  where(field, _operator, value) {
    return new FakeQuery(this.db, [...this.filters, [field, value]]);
  }
  matching() {
    return [...this.db.records.values()].filter((record) =>
      this.filters.every(([field, value]) => record[field] === value),
    );
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
    this.transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const updates = [];
    const tx = {
      get: async (reference) =>
        reference instanceof FakeRef
          ? this.snapshot(reference.id)
          : { docs: reference.matching().map((record) => this.snapshot(record.userId)) },
      update: (reference, update) => updates.push([reference.id, update]),
    };
    try {
      await callback(tx);
      for (const [id, update] of updates)
        this.records.set(id, { ...this.records.get(id), ...update });
    } finally {
      release();
    }
  }
}

function sessionDocumentId(sid) {
  return createHash('sha256').update(sid, 'utf8').digest('hex');
}

class FakeSessionDb {
  constructor(records) {
    this.records = new Map(records.map((record) => [record.id, { ...record }]));
  }
  collection(name) {
    assert.equal(name, 'sessions');
    return {
      doc: (id) => {
        return {
          id,
          async get() {
            const record = this.db.records.get(id);
            return { exists: Boolean(record), data: () => record, ref: { id } };
          },
          db: this,
        };
      },
      where: (_field, _operator, userId) => ({
        get: async () => ({
          docs: [...this.records.values()]
            .filter((record) => record.userId === userId)
            .map((record) => ({ ref: { id: record.id } })),
        }),
      }),
    };
  }
  batch() {
    const deleted = [];
    return {
      delete: (reference) => deleted.push(reference.id),
      commit: async () => deleted.forEach((id) => this.records.delete(id)),
    };
  }
}

test('manager status transaction updates a librarian and revokes sessions on deactivation', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const target = user({
    userId: 'target-1',
    employeeId: 'EMP-TARGET',
    employeeIdCanonical: 'emp-target',
  });
  const db = new FakeDb([manager, target]);
  const destroyed = [];
  const storage = new AccountStorage(db, {
    destroyForUser: async (userId) => destroyed.push(userId),
  });

  const activated = await storage.updateLibrarianStatus('target-1', 'INACTIVE', manager);
  assert.equal(activated.accountStatus, 'INACTIVE');
  assert.equal('passwordHash' in activated, false);
  assert.equal('authVersion' in activated, false);
  assert.deepEqual(destroyed, ['target-1']);
  assert.equal(db.records.get('target-1').accountStatus, 'INACTIVE');
  assert.equal(db.records.get('target-1').authVersion, 1);
});

test('manager authorization rejects inactive, non-manager, and member actors', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const db = new FakeDb([manager]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });
  await assert.rejects(
    () => storage.listLibrarians(user({ accountStatus: 'INACTIVE', isManager: true })),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () => storage.listLibrarians(user({ isManager: false })),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () =>
      storage.listLibrarians({
        ...user({ accountType: 'MEMBER' }),
        memberId: 'member-1',
        isManager: false,
      }),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN',
  );
});

test('deactivation retries transient session-store failures and keeps inactive sessions denied', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const target = user({
    userId: 'target-1',
    employeeId: 'EMP-TARGET',
    employeeIdCanonical: 'emp-target',
  });
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
  await requireActiveActor({
    async getById(userId) {
      return db.records.get(userId);
    },
  })({ session: { userId: 'target-1', accountType: 'LIBRARIAN' } }, {}, (error) =>
    next.push(error),
  );
  assert.equal(next[0].status, 403);
});

test('persistent session-store failure does not roll back the authorization change', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const target = user({
    userId: 'target-1',
    employeeId: 'EMP-TARGET',
    employeeIdCanonical: 'emp-target',
  });
  const db = new FakeDb([manager, target]);
  const queued = [];
  const storage = new AccountStorage(db, {
    destroyForUser: async () => {
      throw new Error('session-store unavailable');
    },
    enqueueRevocation: async (userId) => queued.push(userId),
  });

  await assert.rejects(
    () => storage.updateLibrarianStatus('target-1', 'INACTIVE', manager),
    /session-store unavailable/,
  );
  assert.equal(db.records.get('target-1').accountStatus, 'INACTIVE');
  assert.equal(db.records.get('target-1').authVersion, 1);
  assert.deepEqual(queued, ['target-1']);
});

test('last active manager protection rejects self-deactivation and no-op changes', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  assert.throws(
    () => assertCanDeactivateManager(manager, 1),
    (error) => error instanceof StorageError && error.code === 'CONFLICT',
  );

  const db = new FakeDb([manager]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });
  await assert.rejects(
    () => storage.updateLibrarianStatus('manager-1', 'ACTIVE', manager),
    (error) => error instanceof StorageError && error.code === 'CONFLICT',
  );
  assert.equal(db.records.get('manager-1').accountStatus, 'ACTIVE');
});

test('serialized transactions allow only one of two concurrent last-manager deactivations', async () => {
  const managerA = user({
    userId: 'manager-a',
    employeeId: 'EMP-A',
    employeeIdCanonical: 'emp-a',
    isManager: true,
  });
  const managerB = user({
    userId: 'manager-b',
    employeeId: 'EMP-B',
    employeeIdCanonical: 'emp-b',
    isManager: true,
  });
  const db = new FakeDb([managerA, managerB]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });

  const results = await Promise.allSettled([
    storage.updateLibrarianStatus('manager-a', 'INACTIVE', managerA),
    storage.updateLibrarianStatus('manager-b', 'INACTIVE', managerA),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    results.filter((result) => result.status === 'rejected' && result.reason.code === 'CONFLICT')
      .length,
    1,
  );
  assert.equal(
    [db.records.get('manager-a'), db.records.get('manager-b')].filter(
      (record) => record.accountStatus === 'ACTIVE',
    ).length,
    1,
  );
});

test('missing and non-librarian targets do not change records', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const member = user({
    userId: 'member-1',
    accountType: 'MEMBER',
    memberId: 'member-1',
    employeeId: undefined,
    employeeIdCanonical: undefined,
    isManager: undefined,
  });
  const db = new FakeDb([manager, member]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });

  await assert.rejects(
    () => storage.updateLibrarianStatus('missing', 'ACTIVE', manager),
    (error) => error instanceof StorageError && error.code === 'NOT_FOUND',
  );
  await assert.rejects(
    () => storage.updateLibrarianStatus('member-1', 'INACTIVE', manager),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN',
  );
  assert.equal(db.records.get('member-1').accountStatus, 'ACTIVE');
});

test('password reset uses Argon2id and preserves librarian account fields', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const oldPasswordHash = await argon2.hash('old-password', { type: argon2.argon2id });
  const target = user({
    userId: 'target-1',
    name: 'Target Librarian',
    email: 'target@example.test',
    employeeId: 'EMP-TARGET',
    employeeIdCanonical: 'emp-target',
    passwordHash: oldPasswordHash,
  });
  const inactiveTarget = user({
    userId: 'inactive-target-1',
    employeeId: 'EMP-INACTIVE-TARGET',
    employeeIdCanonical: 'emp-inactive-target',
    accountStatus: 'INACTIVE',
  });
  const registrationDateTime = target.registrationDateTime;
  const db = new FakeDb([manager, target, inactiveTarget]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });

  const result = await storage.resetLibrarianPassword(
    'target-1',
    'new-password',
    'new-password',
    manager,
  );
  const stored = db.records.get('target-1');
  assert.equal('passwordHash' in result, false);
  assert.equal('authVersion' in result, false);
  assert.notEqual(stored.passwordHash, oldPasswordHash);
  assert.notEqual(stored.passwordHash, 'new-password');
  assert.equal(await argon2.verify(stored.passwordHash, 'new-password'), true);
  assert.equal(await argon2.verify(stored.passwordHash, 'old-password'), false);
  assert.equal(stored.accountStatus, 'ACTIVE');
  assert.equal(stored.accountType, 'LIBRARIAN');
  assert.equal(stored.isManager, false);
  assert.equal(stored.name, 'Target Librarian');
  assert.equal(stored.email, 'target@example.test');
  assert.equal(stored.employeeId, 'EMP-TARGET');
  assert.equal(stored.registrationDateTime, registrationDateTime);
  assert.equal(stored.authVersion, 1);

  await storage.resetLibrarianPassword(
    'inactive-target-1',
    'new-password',
    'new-password',
    manager,
  );
  const inactiveStored = db.records.get('inactive-target-1');
  assert.equal(inactiveStored.accountStatus, 'INACTIVE');
  assert.equal(inactiveStored.authVersion, 1);
  assert.notEqual(inactiveStored.passwordHash, stored.passwordHash);
  assert.equal(await argon2.verify(inactiveStored.passwordHash, 'new-password'), true);
});

test('password reset rejects policy failures, self-targets, and invalid targets without writes', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const target = user({
    userId: 'target-1',
    employeeId: 'EMP-TARGET',
    employeeIdCanonical: 'emp-target',
  });
  const member = user({
    userId: 'member-1',
    accountType: 'MEMBER',
    memberId: 'member-1',
    employeeId: undefined,
    employeeIdCanonical: undefined,
    isManager: undefined,
  });
  const db = new FakeDb([manager, target, member]);
  const storage = new AccountStorage(db, { destroyForUser: async () => undefined });
  const originalHash = db.records.get('target-1').passwordHash;

  for (const [password, confirmation] of [
    ['short', 'short'],
    ['no whitespace', 'no whitespace'],
    ['valid-password', 'different-password'],
    ['a'.repeat(1025), 'a'.repeat(1025)],
  ]) {
    await assert.rejects(
      () => storage.resetLibrarianPassword('target-1', password, confirmation, manager),
      (error) => error instanceof StorageError && error.code === 'INVALID',
    );
  }
  await assert.rejects(
    () => storage.resetLibrarianPassword('manager-1', 'valid-password', 'valid-password', manager),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () => storage.resetLibrarianPassword('member-1', 'valid-password', 'valid-password', manager),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () => storage.resetLibrarianPassword('missing', 'valid-password', 'valid-password', manager),
    (error) => error instanceof StorageError && error.code === 'NOT_FOUND',
  );
  assert.equal(db.records.get('target-1').passwordHash, originalHash);
});

test('password reset revokes every target session after the password write', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const target = user({
    userId: 'target-1',
    employeeId: 'EMP-TARGET',
    employeeIdCanonical: 'emp-target',
  });
  const sessionRecords = new Map([
    ['target-session-1', { userId: 'target-1' }],
    ['target-session-2', { userId: 'target-1' }],
    ['manager-session', { userId: 'manager-1' }],
  ]);
  const db = new FakeDb([manager, target]);
  const storage = new AccountStorage(db, {
    destroyForUser: async (userId) => {
      for (const [sessionId, record] of sessionRecords) {
        if (record.userId === userId) sessionRecords.delete(sessionId);
      }
    },
  });

  await storage.resetLibrarianPassword('target-1', 'new-password', 'new-password', manager);
  assert.deepEqual([...sessionRecords.values()], [{ userId: 'manager-1' }]);
});

test('password reset retries transient revocation failures and reports persistent failures safely', async () => {
  const manager = user({
    userId: 'manager-1',
    employeeId: 'EMP-MANAGER',
    employeeIdCanonical: 'emp-manager',
    isManager: true,
  });
  const transientTarget = user({
    userId: 'transient-target',
    employeeId: 'EMP-TRANSIENT',
    employeeIdCanonical: 'emp-transient',
  });
  const transientDb = new FakeDb([manager, transientTarget]);
  let transientAttempts = 0;
  const transientStorage = new AccountStorage(transientDb, {
    destroyForUser: async () => {
      transientAttempts += 1;
      if (transientAttempts === 1) throw new Error('temporary session-store failure');
    },
  });
  await transientStorage.resetLibrarianPassword(
    'transient-target',
    'new-password',
    'new-password',
    manager,
  );
  assert.equal(transientAttempts, 2);

  const persistentTarget = user({
    userId: 'persistent-target',
    employeeId: 'EMP-PERSISTENT',
    employeeIdCanonical: 'emp-persistent',
  });
  const persistentDb = new FakeDb([manager, persistentTarget]);
  let persistentAttempts = 0;
  const queued = [];
  const persistentStorage = new AccountStorage(persistentDb, {
    destroyForUser: async () => {
      persistentAttempts += 1;
      throw new Error('session-store unavailable');
    },
    enqueueRevocation: async (userId) => queued.push(userId),
  });
  await assert.rejects(
    () =>
      persistentStorage.resetLibrarianPassword(
        'persistent-target',
        'new-password',
        'new-password',
        manager,
      ),
    /session-store unavailable/,
  );
  assert.equal(persistentAttempts, 3);
  assert.deepEqual(queued, ['persistent-target']);
  assert.notEqual(persistentDb.records.get('persistent-target').passwordHash, 'hash');
});

test('Firestore session revocation removes all target sessions and preserves other users', async () => {
  const expiresAt = Timestamp.fromMillis(Date.now() + 60_000);
  const sessionRecord = (sid, userId) => ({
    id: sessionDocumentId(sid),
    userId,
    accountType: 'LIBRARIAN',
    cookie: { expires: new Date(expiresAt.toMillis()).toISOString(), originalMaxAge: 60_000 },
    expiresAt,
  });
  const db = new FakeSessionDb([
    sessionRecord('target-session-1', 'target-1'),
    sessionRecord('target-session-2', 'target-1'),
    sessionRecord('manager-session', 'manager-1'),
  ]);
  const store = new FirestoreSessionStore(db);
  const read = (sid) =>
    new Promise((resolve, reject) =>
      store.get(sid, (error, value) => (error ? reject(error) : resolve(value))),
    );

  assert.ok(await read('target-session-1'));
  await store.destroyForUser('target-1');
  assert.equal(await read('target-session-1'), null);
  assert.equal(await read('target-session-2'), null);
  assert.ok(await read('manager-session'));
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import argon2 from 'argon2';
import { Timestamp } from 'firebase-admin/firestore';
import { AccountStorage } from '../dist/apps/api/src/storage/accounts.js';
import { FirestoreSessionStore } from '../dist/apps/api/src/storage/firestore-session-store.js';

class Snapshot {
  constructor(ref, value) { this.ref = ref; this.id = ref.id; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
  get(field) { return this.value?.[field]; }
}

class MemoryFirestore {
  records = new Map([['users', new Map()], ['sessions', new Map()]]);
  tail = Promise.resolve();
  collection(name) {
    const records = this.records.get(name);
    return { doc: (id) => ({
      id, records,
      get: async () => new Snapshot({ id, records }, records.get(id)),
      update: async (patch) => records.set(id, { ...records.get(id), ...patch }),
    }) };
  }
  async runTransaction(callback) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const writes = [];
      const tx = {
        get: async (ref) => new Snapshot(ref, ref.records.get(ref.id)),
        update: (ref, patch) => writes.push(() => ref.records.set(ref.id, { ...ref.records.get(ref.id), ...patch })),
        set: (ref, value, options) => writes.push(() => ref.records.set(ref.id,
          options?.merge ? { ...(ref.records.get(ref.id) ?? {}), ...value } : value)),
      };
      const result = await callback(tx);
      for (const write of writes) write();
      return result;
    } finally { release(); }
  }
}

const sid = 'server-only-current-session-id';
const sessionDocumentId = createHash('sha256').update(sid, 'utf8').digest('hex');
const member = {
  userId: 'password-storage-member', name: 'Ada Member', email: 'ada@example.test', emailCanonical: 'ada@example.test',
  passwordHash: 'initial-hash', registrationDateTime: Timestamp.fromMillis(1), accountType: 'MEMBER',
  accountStatus: 'ACTIVE', memberId: 'member-ada', authVersion: 2,
};

async function setup() {
  const db = new MemoryFirestore();
  db.records.get('users').set(member.userId, { ...member });
  db.records.get('sessions').set(sessionDocumentId, {
    userId: member.userId, accountType: 'MEMBER', authVersion: 2,
    expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  });
  const sessions = new FirestoreSessionStore(db);
  return { db, accounts: new AccountStorage(db, sessions) };
}

test('successful password change uses Argon2id and atomically advances user and current-session versions', async () => {
  const { db, accounts } = await setup();
  const currentPasswordHash = await argon2.hash('old-password-123', { type: argon2.argon2id });
  db.records.get('users').set(member.userId, { ...member, passwordHash: currentPasswordHash });

  const safeUser = await accounts.changePassword(member.userId, sid, 'old-password-123', 'new-password-123', 2);
  const updatedUser = db.records.get('users').get(member.userId);
  const updatedSession = db.records.get('sessions').get(sessionDocumentId);
  assert.equal(updatedUser.authVersion, 3);
  assert.equal(updatedSession.authVersion, 3);
  assert.equal(updatedSession.userId, member.userId);
  assert.match(updatedUser.passwordHash, /^\$argon2id\$/);
  assert.equal(await argon2.verify(updatedUser.passwordHash, 'new-password-123'), true);
  assert.equal(await argon2.verify(updatedUser.passwordHash, 'old-password-123'), false);
  assert.equal('passwordHash' in safeUser, false);
  assert.equal('authVersion' in safeUser, false);
});

test('wrong current password or a session owned by another user leaves password and version unchanged', async () => {
  const { db, accounts } = await setup();
  const currentPasswordHash = await argon2.hash('old-password-123', { type: argon2.argon2id });
  const userRecords = db.records.get('users');
  userRecords.set(member.userId, { ...member, passwordHash: currentPasswordHash });
  await assert.rejects(accounts.changePassword(member.userId, sid, 'incorrect-current', 'new-password-123', 2));
  assert.equal(userRecords.get(member.userId).passwordHash, currentPasswordHash);
  assert.equal(userRecords.get(member.userId).authVersion, 2);

  const previousSession = db.records.get('sessions').get(sessionDocumentId);
  db.records.get('sessions').set(sessionDocumentId, { ...previousSession, userId: 'someone-else' });
  await assert.rejects(accounts.changePassword(member.userId, sid, 'old-password-123', 'new-password-123', 2));
  assert.equal(userRecords.get(member.userId).passwordHash, currentPasswordHash);
  assert.equal(userRecords.get(member.userId).authVersion, 2);

  db.records.get('sessions').delete(sessionDocumentId);
  await assert.rejects(accounts.changePassword(member.userId, sid, 'old-password-123', 'new-password-123', 2));
  assert.equal(userRecords.get(member.userId).passwordHash, currentPasswordHash);
  assert.equal(userRecords.get(member.userId).authVersion, 2);
});

test('stale expected auth version cannot change a password or downgrade an advanced current session', async () => {
  const { db, accounts } = await setup();
  const advancedHash = await argon2.hash('advanced-password-123', { type: argon2.argon2id });
  db.records.get('users').set(member.userId, { ...member, passwordHash: advancedHash, authVersion: 3 });
  db.records.get('sessions').set(sessionDocumentId, {
    userId: member.userId, accountType: 'MEMBER', authVersion: 3,
    expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  });

  await assert.rejects(accounts.changePassword(member.userId, sid, 'advanced-password-123', 'another-password-123', 2));
  assert.equal(db.records.get('users').get(member.userId).passwordHash, advancedHash);
  assert.equal(db.records.get('users').get(member.userId).authVersion, 3);
  assert.equal(db.records.get('sessions').get(sessionDocumentId).authVersion, 3);
});

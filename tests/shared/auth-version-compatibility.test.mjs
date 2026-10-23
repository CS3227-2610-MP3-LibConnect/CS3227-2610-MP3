import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import express from 'express';
import session from 'express-session';
import { Timestamp } from 'firebase-admin/firestore';
import { UserRecordSchema } from '../../dist/packages/shared/src/domain/records.js';
import { createAuthRouter } from '../../dist/apps/api/src/routes/auth.js';
import { FirestoreSessionStore } from '../../dist/apps/api/src/storage/firestore-session-store.js';

const cookieOptions = { httpOnly: true, secure: false, sameSite: 'lax', path: '/' };
const legacyUser = {
  userId: 'member-1',
  name: 'Ada Member',
  email: 'ada@example.test',
  emailCanonical: 'ada@example.test',
  passwordHash: 'test-hash',
  registrationDateTime: Timestamp.now(),
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'member-1',
};

function makeFakeFirestore(initial = {}) {
  const documents = new Map(Object.entries(initial));
  const collection = {
    doc(id) {
      return {
        async get() {
          const value = documents.get(id);
          return {
            exists: value !== undefined,
            data: () => value,
            ref: { delete: async () => documents.delete(id) },
          };
        },
        async set(value) {
          documents.set(id, value);
        },
        async delete() {
          documents.delete(id);
        },
      };
    },
  };
  return {
    documents,
    collection(name) {
      assert.equal(name, 'sessions');
      return collection;
    },
  };
}

function callbackResult(invoke) {
  return new Promise((resolve, reject) =>
    invoke((error, value) => (error ? reject(error) : resolve(value))),
  );
}

test('UserRecordSchema defaults a legacy record to authVersion zero and rejects invalid versions', () => {
  const parsed = UserRecordSchema.parse(legacyUser);
  assert.equal(parsed.authVersion, 0);
  assert.equal(UserRecordSchema.parse({ ...legacyUser, authVersion: 4 }).authVersion, 4);
  for (const authVersion of [-1, 1.5, Number.NaN, '2']) {
    assert.equal(UserRecordSchema.safeParse({ ...legacyUser, authVersion }).success, false);
  }
});

test('FirestoreSessionStore restores legacy sessions at version zero and persists the authenticated value', async () => {
  const sid = 'opaque-session-id';
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 60_000));
  const db = makeFakeFirestore({
    // The store hashes the session ID before it uses it as a Firestore document ID.
    [createHash('sha256').update(sid).digest('hex')]: {
      userId: 'member-1',
      accountType: 'MEMBER',
      cookie: { path: '/', expires: null },
      expiresAt,
    },
  });
  const store = new FirestoreSessionStore(db);
  const restoredLegacy = await callbackResult((callback) => store.get(sid, callback));
  assert.equal(restoredLegacy.authVersion, 0);

  const authenticatedSession = {
    userId: 'member-1',
    accountType: 'MEMBER',
    authVersion: 7,
    cookie: new session.Cookie({ path: '/', maxAge: 60_000 }),
  };
  await callbackResult((callback) => store.set('new-session-id', authenticatedSession, callback));
  const persisted = [...db.documents.values()].find(
    (record) => record.userId === 'member-1' && record.authVersion === 7,
  );
  assert.equal(persisted.authVersion, 7);

  const legacyInput = { ...authenticatedSession, authVersion: undefined };
  await callbackResult((callback) => store.set('legacy-input-session-id', legacyInput, callback));
  const legacyPersisted = [...db.documents.values()].find((record) => record.authVersion === 0);
  assert.equal(legacyPersisted.authVersion, 0);
});

test('login persists the current user version while safe auth responses omit it and clients cannot submit it', async (context) => {
  const user = { ...legacyUser, authVersion: 6 };
  const persistedSessions = [];
  class CapturingMemoryStore extends session.MemoryStore {
    set(sid, value, callback) {
      persistedSessions.push(value);
      super.set(sid, value, callback);
    }
  }
  const app = express();
  app.use(express.json());
  app.use(
    session({
      store: new CapturingMemoryStore(),
      secret: 'auth-version-test-secret-long-enough-for-express',
      resave: false,
      saveUninitialized: false,
      cookie: { ...cookieOptions, maxAge: 60_000 },
    }),
  );
  const accounts = {
    async authenticate() {
      return user;
    },
    async register() {
      return user;
    },
  };
  const users = {
    async getById() {
      return user;
    },
  };
  app.use(
    '/api/v1/auth',
    createAuthRouter(accounts, users, cookieOptions, 'http://localhost:5173'),
  );
  const server = app.listen(0, '127.0.0.1');
  context.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(`${origin}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountType: 'MEMBER',
      email: user.email,
      password: 'correct-password',
    }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.authVersion, undefined);
  assert.equal(persistedSessions.at(-1).authVersion, 6);
  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('connect.sid='))
    ?.split(';')[0];
  assert.ok(cookie);
  const restored = await fetch(`${origin}/api/v1/auth/session`, { headers: { Cookie: cookie } });
  assert.equal((await restored.json()).user.authVersion, undefined);

  const forbiddenOverride = await fetch(`${origin}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountType: 'MEMBER',
      email: user.email,
      password: 'correct-password',
      authVersion: 99,
    }),
  });
  assert.equal(forbiddenOverride.status, 400);
});

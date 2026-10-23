import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
const localEmulator = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulatorHost);
if (process.env.NODE_ENV === 'production' || !localEmulator || !projectId.startsWith('demo-')) {
  throw new Error(
    'Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.',
  );
}

const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:3000';
const apiUrl = new URL(apiOrigin);
if (!['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname)) {
  throw new Error('VITE_API_ORIGIN must point to a local non-production API server.');
}

// Import Firebase only after the emulator and demo-project guards have passed.
const [{ FieldValue }, { db }, { FirestoreSessionStore }, { AccountStorage }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../../dist/apps/api/src/storage/firebase.js'),
  import('../../dist/apps/api/src/storage/firestore-session-store.js'),
  import('../../dist/apps/api/src/storage/accounts.js'),
]);

const runId = randomUUID();
const initialPassword = `Profile-Initial-${runId}`;
const changedPassword = `Profile-Changed-${runId}`;
const emails = {
  member: `profile-${runId}@example.test`,
  changed: `profile-changed-${runId}@example.test`,
  legacy: `legacy-profile-${runId}@example.test`,
  librarian: `librarian-profile-${runId}@example.test`,
};
const createdUserIds = [];
const sessions = new FirestoreSessionStore(db);

async function call(path, { method = 'GET', body, cookie } = {}) {
  const headers = { Origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  return fetch(new URL(path, apiOrigin), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function registerMember(email, name) {
  const response = await call('/api/v1/auth/register', {
    method: 'POST',
    body: {
      accountType: 'MEMBER',
      name,
      email,
      password: initialPassword,
      confirmPassword: initialPassword,
    },
  });
  if (response.status !== 201)
    throw new Error(`member registration failed (${response.status}): ${await response.text()}`);
  const user = (await response.json()).user;
  createdUserIds.push(user.userId);
  return user;
}

async function login(email, password = initialPassword) {
  const response = await call('/api/v1/auth/login', {
    method: 'POST',
    body: { accountType: 'MEMBER', email, password },
  });
  if (response.status !== 200)
    throw new Error(`login failed for ${email} (${response.status}): ${await response.text()}`);
  const cookieHeader = response.headers
    .getSetCookie()
    .find((header) => header.startsWith('__session='));
  assert.ok(cookieHeader, 'login should create a session cookie');
  return { cookie: cookieHeader.split(';')[0], user: (await response.json()).user };
}

async function cleanup() {
  for (const userId of createdUserIds) {
    const [user, identityKeys, userSessions] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('identityKeys').where('ownerUserId', '==', userId).get(),
      db.collection('sessions').where('userId', '==', userId).get(),
    ]);
    const batch = db.batch();
    if (user.exists) batch.delete(user.ref);
    identityKeys.docs.forEach((snapshot) => batch.delete(snapshot.ref));
    userSessions.docs.forEach((snapshot) => batch.delete(snapshot.ref));
    await batch.commit();
  }
}

try {
  const health = await call('/health', {});
  assert.equal(health.status, 200, 'local API must be running against the configured emulator');

  const member = await registerMember(emails.member, 'Profile Emulator Member');
  const librarianAccount = await new AccountStorage(db, sessions).register({
    accountType: 'LIBRARIAN',
    name: 'Profile Emulator Librarian',
    email: emails.librarian,
    employeeId: `EMP-${runId}`,
    password: initialPassword,
  });
  createdUserIds.push(librarianAccount.userId);

  let { cookie } = await login(emails.member);
  const profilePath = '/api/v1/member/profile';
  const initialProfile = await call(profilePath, { cookie });
  assert.equal(initialProfile.status, 200);
  const initialSummary = (await initialProfile.json()).user;
  assert.equal(initialSummary.userId, member.userId);
  assert.equal('authVersion' in initialSummary, false);
  assert.equal('passwordHash' in initialSummary, false);

  const nameChange = await call(`${profilePath}/name`, {
    method: 'PATCH',
    cookie,
    body: { name: '  Updated Profile Member  ' },
  });
  assert.equal(nameChange.status, 200);
  assert.equal((await nameChange.json()).user.name, 'Updated Profile Member');

  const collision = await call(`${profilePath}/email`, {
    method: 'PATCH',
    cookie,
    body: { email: emails.librarian },
  });
  assert.equal(collision.status, 409, 'email uniqueness must include librarian accounts');
  const emailChange = await call(`${profilePath}/email`, {
    method: 'PATCH',
    cookie,
    body: { email: emails.changed },
  });
  assert.equal(emailChange.status, 200);
  assert.equal((await emailChange.json()).user.email, emails.changed);
  const releasedOldAddress = await call('/api/v1/auth/login', {
    method: 'POST',
    body: {
      accountType: 'MEMBER',
      email: emails.member,
      password: initialPassword,
    },
  });
  assert.equal(releasedOldAddress.status, 401, 'old email must no longer authenticate the account');
  const oldCookieStillCurrent = cookie;
  const secondSession = await login(emails.changed);
  cookie = secondSession.cookie;

  const passwordChange = await call(`${profilePath}/password`, {
    method: 'PATCH',
    cookie,
    body: {
      currentPassword: initialPassword,
      newPassword: changedPassword,
      confirmPassword: changedPassword,
    },
  });
  assert.equal(passwordChange.status, 200);
  assert.equal('authVersion' in (await passwordChange.json()).user, false);
  const currentProtected = await call('/api/v1/books', { cookie });
  assert.equal(
    currentProtected.status,
    200,
    'password-changing session must continue to access protected APIs',
  );
  const oldProtected = await call('/api/v1/books', { cookie: oldCookieStillCurrent });
  assert.equal(oldProtected.status, 401, 'previous session version must fail protected APIs');
  const oldRestore = await call('/api/v1/auth/session', { cookie: oldCookieStillCurrent });
  assert.deepEqual(
    await oldRestore.json(),
    { authenticated: false },
    'session restore must reject old versions',
  );
  assert.ok(
    oldRestore.headers.getSetCookie().some((header) => /__session=;/i.test(header)),
    'stale restore should clear cookie',
  );

  const oldPasswordLogin = await call('/api/v1/auth/login', {
    method: 'POST',
    body: {
      accountType: 'MEMBER',
      email: emails.changed,
      password: initialPassword,
    },
  });
  assert.equal(oldPasswordLogin.status, 401);
  const newPasswordLogin = await login(emails.changed, changedPassword);
  assert.equal(newPasswordLogin.user.userId, member.userId);

  const legacy = await registerMember(emails.legacy, 'Versionless Legacy Member');
  const legacySession = await login(emails.legacy);
  const sessionCookieValue = decodeURIComponent(legacySession.cookie.slice('__session='.length));
  assert.ok(sessionCookieValue.startsWith('s:'), 'expected a signed express-session cookie');
  const rawSessionId = sessionCookieValue.slice(2, sessionCookieValue.lastIndexOf('.'));
  await Promise.all([
    db.collection('users').doc(legacy.userId).update({ authVersion: FieldValue.delete() }),
    sessions.documentRefFor(rawSessionId).update({ authVersion: FieldValue.delete() }),
  ]);
  const legacyProtected = await call('/api/v1/books', { cookie: legacySession.cookie });
  assert.equal(
    legacyProtected.status,
    200,
    'versionless user and session must default to version zero',
  );
  const legacyRestore = await call('/api/v1/auth/session', { cookie: legacySession.cookie });
  assert.equal(
    (await legacyRestore.json()).authenticated,
    true,
    'legacy versionless session must restore at version zero',
  );

  console.info(
    'Member profile Emulator verification passed: safe profile, name update, cross-role email uniqueness and release, password replacement, current-session continuation, stale protected API and restore rejection, and legacy versionless compatibility.',
  );
} finally {
  await cleanup();
}

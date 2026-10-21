import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../../dist/apps/api/src/storage/firebase.js';
import { AccountStorage } from '../../dist/apps/api/src/storage/accounts.js';
import { FirestoreSessionStore } from '../../dist/apps/api/src/storage/firestore-session-store.js';
import { UserRepository } from '../../dist/apps/api/src/storage/repositories.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV === 'production') {
  throw new Error('Run this check with the Firestore Emulator and a non-production environment.');
}

const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://localhost:3000';
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const runId = randomUUID();
const memberEmail = `member-${runId}@example.test`;
const noJsEmail = `nojs-${runId}@example.test`;
const librarianEmail = `librarian-${runId}@example.test`;
const password = `Auth-check-${runId}`;

async function call(path, { method = 'GET', body, cookie, origin = clientOrigin } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  return fetch(new URL(path, apiOrigin), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function callHtmlForm(path, body) {
  return fetch(new URL(path, apiOrigin), {
    method: 'POST',
    headers: {
      Origin: clientOrigin,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
    redirect: 'manual',
  });
}

function sessionCookie(response) {
  const value = response.headers.getSetCookie().find((header) => header.startsWith('libconnect.sid='));
  assert.ok(value, 'expected the API to set the session cookie');
  assert.match(value, /HttpOnly/i);
  assert.match(value, /SameSite=Lax/i);
  return value.split(';')[0];
}

const signedOut = await call('/api/v1/auth/session');
assert.equal(signedOut.status, 200);
assert.deepEqual(await signedOut.json(), { authenticated: false });

const health = await call('/health', { origin: null });
assert.equal(health.status, 200);

const rejectedOrigin = await call('/api/v1/auth/register', {
  method: 'POST',
  origin: 'https://attacker.example',
  body: { accountType: 'MEMBER', name: 'Blocked', email: memberEmail, password },
});
assert.equal(rejectedOrigin.status, 403);

const registration = await call('/api/v1/auth/register', {
  method: 'POST',
  body: { accountType: 'MEMBER', name: 'Integration Member', email: memberEmail, password, confirmPassword: password },
});
assert.equal(registration.status, 201);
assert.equal(registration.headers.getSetCookie().length, 0);
const member = (await registration.json()).user;
assert.equal(member.accountStatus, 'ACTIVE');
assert.equal('passwordHash' in member, false);

const noJsRegistration = await callHtmlForm('/api/v1/auth/register', {
  accountType: 'MEMBER', name: 'No JavaScript Member', email: noJsEmail, password, confirmPassword: password,
});
assert.equal(noJsRegistration.status, 303);
assert.equal(noJsRegistration.headers.get('location'), `${clientOrigin}/login.html`);
assert.equal(noJsRegistration.headers.getSetCookie().length, 0);
const noJsLogin = await callHtmlForm('/api/v1/auth/login', {
  accountType: 'MEMBER', email: noJsEmail, password,
});
assert.equal(noJsLogin.status, 303);
assert.equal(noJsLogin.headers.get('location'), `${clientOrigin}/`);
const noJsCookie = sessionCookie(noJsLogin);
const noJsSession = await call('/api/v1/auth/session', { cookie: noJsCookie });
assert.equal((await noJsSession.json()).authenticated, true);

const unauthenticatedBooks = await call('/api/v1/books');
assert.equal(unauthenticatedBooks.status, 401);

const wrongType = await call('/api/v1/auth/login', {
  method: 'POST', body: { accountType: 'LIBRARIAN', email: memberEmail, password },
});
assert.equal(wrongType.status, 401);
assert.equal((await wrongType.json()).error.message, 'Email or password is incorrect.');

const login = await call('/api/v1/auth/login', {
  method: 'POST', body: { accountType: 'MEMBER', email: memberEmail, password },
});
assert.equal(login.status, 200);
const memberCookie = sessionCookie(login);
const activeSession = await call('/api/v1/auth/session', { cookie: memberCookie });
assert.deepEqual((await activeSession.json()).user, member);
const catalog = await call('/api/v1/books', { cookie: memberCookie });
assert.equal(catalog.status, 200);

const logout = await call('/api/v1/auth/logout', { method: 'POST', cookie: memberCookie, body: {} });
assert.equal(logout.status, 204);
const afterLogout = await call('/api/v1/auth/session', { cookie: memberCookie });
assert.deepEqual(await afterLogout.json(), { authenticated: false });

const memberLoginAgain = await call('/api/v1/auth/login', {
  method: 'POST', body: { accountType: 'MEMBER', email: memberEmail, password },
});
const revokedCookie = sessionCookie(memberLoginAgain);

const librarianRegistration = await call('/api/v1/auth/register', {
  method: 'POST',
  body: {
    accountType: 'LIBRARIAN', name: 'Integration Librarian', email: librarianEmail,
    password, confirmPassword: password, employeeId: `EMP-${runId}`,
  },
});
assert.equal(librarianRegistration.status, 201);
const librarian = (await librarianRegistration.json()).user;
assert.equal(librarian.accountStatus, 'INACTIVE');
const inactiveLogin = await call('/api/v1/auth/login', {
  method: 'POST', body: { accountType: 'LIBRARIAN', email: librarianEmail, password },
});
assert.equal(inactiveLogin.status, 401);
assert.equal((await inactiveLogin.json()).error.message, 'Email or password is incorrect.');
const inactiveLibrarianHtmlLogin = await callHtmlForm('/api/v1/auth/login', {
  accountType: 'LIBRARIAN', email: librarianEmail, password,
});
assert.equal(inactiveLibrarianHtmlLogin.status, 303);
assert.equal(inactiveLibrarianHtmlLogin.headers.get('location'), `${clientOrigin}/login-invalid.html`);

const userRepository = new UserRepository(db);
const activeLibrarian = await userRepository.getById(librarian.userId);
await db.collection('users').doc(librarian.userId).update({ accountStatus: 'ACTIVE' });
activeLibrarian.accountStatus = 'ACTIVE';
await new AccountStorage(db, new FirestoreSessionStore(db)).deactivateMember(member.userId, activeLibrarian);

const disabledMemberLogin = await call('/api/v1/auth/login', {
  method: 'POST', body: { accountType: 'MEMBER', email: memberEmail, password },
});
assert.equal(disabledMemberLogin.status, 401);
assert.deepEqual(await disabledMemberLogin.json(), {
  error: { code: 'ACCOUNT_DISABLED', message: 'This account is disabled.' },
});

const disabledMemberWrongPassword = await call('/api/v1/auth/login', {
  method: 'POST', body: { accountType: 'MEMBER', email: memberEmail, password: `${password}-wrong` },
});
assert.equal(disabledMemberWrongPassword.status, 401);
assert.equal((await disabledMemberWrongPassword.json()).error.message, 'Email or password is incorrect.');

const disabledMemberHtmlLogin = await callHtmlForm('/api/v1/auth/login', {
  accountType: 'MEMBER', email: memberEmail, password,
});
assert.equal(disabledMemberHtmlLogin.status, 303);
assert.equal(disabledMemberHtmlLogin.headers.get('location'), `${clientOrigin}/login-disabled.html`);

const disabledMemberWrongPasswordHtml = await callHtmlForm('/api/v1/auth/login', {
  accountType: 'MEMBER', email: memberEmail, password: `${password}-wrong`,
});
assert.equal(disabledMemberWrongPasswordHtml.status, 303);
assert.equal(disabledMemberWrongPasswordHtml.headers.get('location'), `${clientOrigin}/login-invalid.html`);

const deactivatedRequest = await call('/api/v1/books', { cookie: revokedCookie });
assert.equal(deactivatedRequest.status, 401);
const deactivatedSession = await call('/api/v1/auth/session', { cookie: revokedCookie });
assert.deepEqual(await deactivatedSession.json(), { authenticated: false });

console.info('Auth Emulator verification passed: public entry points, Origin validation, JSON and native-form registration/login, disabled-member feedback, generic invalid-credential and librarian feedback, session restore/logout, API protection, and deactivation revocation.');

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';
import { originProtection } from '../dist/apps/api/src/http/origin-protection.js';
import { createAuthRouter } from '../dist/apps/api/src/routes/auth.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';

const origin = 'http://localhost:5173';
const cookieOptions = { httpOnly: true, secure: false, sameSite: 'lax', path: '/' };
const users = new Map();

const accounts = {
  async register(input) {
    const user = {
      userId: `user-${users.size + 1}`,
      name: input.name,
      email: input.email,
      emailCanonical: input.email.toLowerCase(),
      passwordHash: 'test-hash',
      accountType: input.accountType,
      accountStatus: input.accountType === 'MEMBER' ? 'ACTIVE' : 'INACTIVE',
      ...(input.accountType === 'MEMBER' ? { memberId: `member-${users.size + 1}` } : {
        employeeId: input.employeeId,
        employeeIdCanonical: input.employeeId.toLowerCase(),
        isManager: false,
      }),
    };
    users.set(user.userId, user);
    return user;
  },
  async authenticate(input) {
    const user = [...users.values()].find((candidate) => candidate.email.toLowerCase() === input.email.toLowerCase());
    if (!user || user.accountStatus !== 'ACTIVE' || user.accountType !== input.expectedType || input.password !== 'correct-password') {
      throw new StorageError('FORBIDDEN', 'Email or password is incorrect.');
    }
    return user;
  },
};

const userRepository = {
  async getById(userId) {
    const user = users.get(userId);
    if (!user) {
      throw new StorageError('NOT_FOUND', 'Record was not found.');
    }
    return user;
  },
};

const app = express();
app.use(originProtection(origin));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  store: new session.MemoryStore(),
  secret: 'test-session-secret-that-is-at-least-thirty-two-characters',
  name: 'libconnect.sid',
  resave: false,
  saveUninitialized: false,
  cookie: { ...cookieOptions, maxAge: 60000 },
}));
app.use('/api/v1/auth', createAuthRouter(accounts, userRepository, cookieOptions, origin));
app.use(apiErrorHandler);

let server;
let apiOrigin;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function post(path, body, cookie) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return fetch(`${apiOrigin}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function postHtmlForm(path, body, cookie) {
  const headers = {
    Origin: origin,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers.Cookie = cookie;
  return fetch(`${apiOrigin}${path}`, {
    method: 'POST', headers, body: new URLSearchParams(body), redirect: 'manual',
  });
}

test('registration does not create a session and cannot set manager privileges', async () => {
  const response = await post('/api/v1/auth/register', {
    accountType: 'MEMBER', name: 'Ada Member', email: 'ada@example.test', password: 'correct-password', isManager: true,
  });
  assert.equal(response.status, 400);
  const valid = await post('/api/v1/auth/register', {
    accountType: 'MEMBER', name: 'Ada Member', email: 'ada@example.test', password: 'correct-password', confirmPassword: 'correct-password',
  });
  assert.equal(valid.status, 201);
  assert.equal(valid.headers.getSetCookie().length, 0);
  const payload = await valid.json();
  assert.equal(payload.user.accountStatus, 'ACTIVE');
  assert.equal('passwordHash' in payload.user, false);
  assert.equal('emailCanonical' in payload.user, false);
});

test('librarian registration remains inactive', async () => {
  const response = await post('/api/v1/auth/register', {
    accountType: 'LIBRARIAN', name: 'Lee Librarian', email: 'lee@example.test',
    password: 'correct-password', confirmPassword: 'correct-password', employeeId: 'EMP-1',
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).user.accountStatus, 'INACTIVE');
});

test('login checks selected account type and returns one generic credential error', async () => {
  const wrongType = await post('/api/v1/auth/login', {
    accountType: 'LIBRARIAN', email: 'ada@example.test', password: 'correct-password',
  });
  assert.equal(wrongType.status, 401);
  assert.equal((await wrongType.json()).error.message, 'Email or password is incorrect.');
  const wrongPassword = await post('/api/v1/auth/login', {
    accountType: 'MEMBER', email: 'ada@example.test', password: 'wrong-password',
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal((await wrongPassword.json()).error.message, 'Email or password is incorrect.');
  const inactiveLibrarian = await post('/api/v1/auth/login', {
    accountType: 'LIBRARIAN', email: 'lee@example.test', password: 'correct-password',
  });
  assert.equal(inactiveLibrarian.status, 401);
  assert.equal((await inactiveLibrarian.json()).error.message, 'Email or password is incorrect.');
});

test('login creates a safe session, session status restores it, and logout revokes it', async () => {
  const login = await post('/api/v1/auth/login', {
    accountType: 'MEMBER', email: 'ada@example.test', password: 'correct-password',
  });
  assert.equal(login.status, 200);
  const cookieHeader = login.headers.getSetCookie().find((value) => value.startsWith('libconnect.sid='));
  assert.ok(cookieHeader);
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=Lax/i);
  const cookie = cookieHeader.split(';')[0];
  const current = await fetch(`${apiOrigin}/api/v1/auth/session`, { headers: { Cookie: cookie } });
  assert.deepEqual(await current.json(), {
    authenticated: true,
    user: {
      userId: 'user-1', name: 'Ada Member', email: 'ada@example.test',
      accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'member-1',
    },
  });
  const logout = await post('/api/v1/auth/logout', {}, cookie);
  assert.equal(logout.status, 204);
  const afterLogout = await fetch(`${apiOrigin}/api/v1/auth/session`, { headers: { Cookie: cookie } });
  assert.deepEqual(await afterLogout.json(), { authenticated: false });
});

test('session status reports signed-out state with HTTP 200', async () => {
  const response = await fetch(`${apiOrigin}/api/v1/auth/session`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test('native registration forms accept valid input and render validation errors without creating sessions', async () => {
  const response = await postHtmlForm('/api/v1/auth/register', {
    accountType: 'MEMBER', name: 'No JS Member', email: 'nojs@example.test', password: 'correct-password', confirmPassword: 'correct-password',
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${origin}/login.html`);
  assert.equal(response.headers.getSetCookie().length, 0);

  const invalid = await postHtmlForm('/api/v1/auth/register', {
    accountType: 'MEMBER', name: '', email: 'not-an-email', password: 'x',
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.headers.get('content-type'), /text\/html/);
  assert.match(await invalid.text(), /Unable to create account/);
});

test('native login forms establish the session and use generic failure feedback', async () => {
  const success = await postHtmlForm('/api/v1/auth/login', {
    accountType: 'MEMBER', email: 'nojs@example.test', password: 'correct-password',
  });
  assert.equal(success.status, 303);
  assert.equal(success.headers.get('location'), `${origin}/`);
  const cookieHeader = success.headers.getSetCookie().find((value) => value.startsWith('libconnect.sid='));
  assert.ok(cookieHeader);
  const cookie = cookieHeader.split(';')[0];
  const sessionResponse = await fetch(`${apiOrigin}/api/v1/auth/session`, { headers: { Cookie: cookie } });
  assert.equal((await sessionResponse.json()).authenticated, true);

  const invalid = await postHtmlForm('/api/v1/auth/login', {
    accountType: 'LIBRARIAN', email: 'nojs@example.test', password: 'correct-password',
  });
  assert.equal(invalid.status, 303);
  assert.equal(invalid.headers.get('location'), `${origin}/login-invalid.html`);

  await post('/api/v1/auth/register', {
    accountType: 'LIBRARIAN', name: 'Inactive Librarian', email: 'inactive-nojs@example.test',
    password: 'correct-password', confirmPassword: 'correct-password', employeeId: 'EMP-NOJS',
  });
  const inactive = await postHtmlForm('/api/v1/auth/login', {
    accountType: 'LIBRARIAN', email: 'inactive-nojs@example.test', password: 'correct-password',
  });
  assert.equal(inactive.status, 303);
  assert.equal(inactive.headers.get('location'), invalid.headers.get('location'));
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { createManagerRouter } from '../dist/apps/api/src/routes/manager.js';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';

const origin = 'http://localhost:5173';
const manager = {
  userId: 'manager-1', name: 'Manager', email: 'manager@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE',
  employeeId: 'EMP-MANAGER', isManager: true, passwordHash: 'secret',
};
const librarian = {
  userId: 'librarian-1', name: 'Librarian', email: 'librarian@example.test', accountType: 'LIBRARIAN', accountStatus: 'INACTIVE',
  employeeId: 'EMP-LIBRARIAN', isManager: false, passwordHash: 'secret',
};
const nonManager = {
  userId: 'non-manager-1', name: 'Non Manager', email: 'non-manager@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE',
  employeeId: 'EMP-NON-MANAGER', isManager: false, passwordHash: 'secret',
};
const inactiveManager = {
  userId: 'inactive-manager-1', name: 'Inactive Manager', email: 'inactive-manager@example.test', accountType: 'LIBRARIAN', accountStatus: 'INACTIVE',
  employeeId: 'EMP-INACTIVE-MANAGER', isManager: true, passwordHash: 'secret',
};
const member = {
  userId: 'member-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE',
  memberId: 'MEMBER-1', isManager: false, passwordHash: 'secret',
};
const records = new Map([manager, librarian, nonManager, inactiveManager, member].map((user) => [user.userId, user]));
const calls = [];
const accounts = {
  async listLibrarians(actor) {
    calls.push(['list', actor.userId]);
    return [manager, librarian];
  },
  async updateLibrarianStatus(userId, status, actor) {
    calls.push(['update', userId, status, actor.userId]);
    if (userId === 'manager-1' && status === 'INACTIVE') {
      throw new StorageError('CONFLICT', 'The last active manager cannot be deactivated.');
    }
    const target = records.get(userId);
    if (!target) throw new StorageError('NOT_FOUND', 'Librarian account was not found.');
    if (target.accountType !== 'LIBRARIAN') throw new StorageError('FORBIDDEN', 'The target is not a librarian account.');
    return { ...target, accountStatus: status };
  },
};
const users = { async getById(userId) { return records.get(userId); } };

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  secret: 'manager-route-test-session-secret-long-enough',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
}));
app.get('/__test/session/:userId', (request, response) => {
  const user = records.get(request.params.userId);
  if (!user) return response.sendStatus(404);
  request.session.userId = user.userId;
  request.session.accountType = user.accountType;
  response.json({ ok: true });
});
app.use('/api/v1/manager', createManagerRouter(accounts, users));
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

async function sessionCookie(userId) {
  const response = await fetch(`${apiOrigin}/__test/session/${userId}`);
  return response.headers.getSetCookie().find((value) => value.startsWith('connect.sid=')).split(';')[0];
}

async function request(path, init = {}) {
  const headers = { Origin: origin, ...(init.headers ?? {}) };
  return fetch(`${apiOrigin}${path}`, { ...init, headers });
}

test('manager account list requires the server-loaded manager actor', async () => {
  const signedOut = await request('/api/v1/manager/librarians');
  assert.equal(signedOut.status, 401);

  const memberResponse = await request('/api/v1/manager/librarians', { headers: { Cookie: await sessionCookie('member-1') } });
  assert.equal(memberResponse.status, 403);

  const nonManagerResponse = await request('/api/v1/manager/librarians', { headers: { Cookie: await sessionCookie('non-manager-1') } });
  assert.equal(nonManagerResponse.status, 403);

  const inactiveManagerResponse = await request('/api/v1/manager/librarians', { headers: { Cookie: await sessionCookie('inactive-manager-1') } });
  assert.equal(inactiveManagerResponse.status, 403);

  const response = await request('/api/v1/manager/librarians?isManager=true&accountType=LIBRARIAN', {
    headers: { Cookie: await sessionCookie('manager-1') },
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).librarians.map(({ userId, accountStatus }) => ({ userId, accountStatus })), [
    { userId: 'manager-1', accountStatus: 'ACTIVE' },
    { userId: 'librarian-1', accountStatus: 'INACTIVE' },
  ]);
  assert.equal(calls.at(-1)[0], 'list');
});

test('manager status route rejects forged fields and preserves authorization', async () => {
  const beforeCalls = calls.length;
  const forged = await request('/api/v1/manager/librarians/librarian-1/status', {
    method: 'PATCH',
    headers: { Cookie: await sessionCookie('manager-1'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ACTIVE', isManager: true, accountType: 'LIBRARIAN' }),
  });
  assert.equal(forged.status, 400);
  assert.equal(calls.length, beforeCalls);

  const member = await request('/api/v1/manager/librarians/librarian-1/status', {
    method: 'PATCH',
    headers: { Cookie: await sessionCookie('member-1'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ACTIVE', isManager: true, accountType: 'LIBRARIAN' }),
  });
  assert.equal(member.status, 403);

  const response = await request('/api/v1/manager/librarians/librarian-1/status', {
    method: 'PATCH',
    headers: { Cookie: await sessionCookie('manager-1'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).librarian.accountStatus, 'ACTIVE');
  assert.equal(calls.at(-1)[3], 'manager-1');
});

test('last-manager conflicts are surfaced without a success response', async () => {
  const response = await request('/api/v1/manager/librarians/manager-1/status', {
    method: 'PATCH',
    headers: { Cookie: await sessionCookie('manager-1'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'INACTIVE' }),
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error.message, /last active manager/i);
});

test('status route rejects malformed, missing, and non-librarian targets', async () => {
  const headers = { Cookie: await sessionCookie('manager-1'), 'Content-Type': 'application/json' };
  const malformed = await request('/api/v1/manager/librarians/librarian-1/status', {
    method: 'PATCH', headers, body: JSON.stringify({ status: 'PENDING' }),
  });
  assert.equal(malformed.status, 400);

  const missing = await request('/api/v1/manager/librarians/missing/status', {
    method: 'PATCH', headers, body: JSON.stringify({ status: 'ACTIVE' }),
  });
  assert.equal(missing.status, 404);

  const member = await request('/api/v1/manager/librarians/member-1/status', {
    method: 'PATCH', headers, body: JSON.stringify({ status: 'INACTIVE' }),
  });
  assert.equal(member.status, 403);
});

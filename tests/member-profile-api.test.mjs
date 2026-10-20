import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';
import { createMemberProfileRouter } from '../dist/apps/api/src/routes/member-profile.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';

const member = {
  userId: 'profile-member', name: 'Ada Member', email: 'ada@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'member-ada',
};
const librarian = {
  userId: 'profile-librarian', name: 'Lee Librarian', email: 'lee@example.test',
  accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'employee-lee', isManager: false,
};
const inactiveMember = { ...member, userId: 'profile-inactive-member', accountStatus: 'INACTIVE' };
const usersById = new Map([[member.userId, member], [librarian.userId, librarian], [inactiveMember.userId, inactiveMember]]);
const users = { getById: async (id) => usersById.get(id) };
const calls = [];
let currentMember = { ...member };
const accounts = {
  async getProfile(userId) { calls.push(['read', userId]); return { ...currentMember }; },
  async updateName(userId, name) { calls.push(['name', userId, name]); currentMember = { ...currentMember, name }; return { ...currentMember }; },
  async updateEmail(userId, email) {
    calls.push(['email', userId, email]);
    if (email.toLowerCase().includes('taken')) throw new StorageError('CONFLICT', 'Email is already registered.');
    currentMember = { ...currentMember, email: email.trim() };
    return { ...currentMember };
  },
};

const app = express();
app.use(express.json());
app.use(session({ secret: 'member-profile-api-test-session-secret', resave: false, saveUninitialized: false }));
app.get('/__test/session/:userId', (request, response) => {
  request.session.userId = request.params.userId;
  request.session.accountType = usersById.get(request.params.userId)?.accountType;
  response.json({ ok: true });
});
app.use('/api/v1/member/profile', createMemberProfileRouter(accounts, users));
app.use(apiErrorHandler);

let server;
let apiOrigin;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

async function signedInCookie(userId) {
  const response = await fetch(`${apiOrigin}/__test/session/${userId}`);
  return response.headers.getSetCookie().find((value) => value.startsWith('connect.sid='))?.split(';')[0];
}
async function request(path, { cookie, method = 'GET', body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${apiOrigin}/api/v1/member/profile${path}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test('profile read returns the authenticated member safe summary only', async () => {
  currentMember = { ...member, passwordHash: 'must-not-leak', emailCanonical: 'ada@example.test', authVersion: 8 };
  const cookie = await signedInCookie(member.userId);
  const response = await request('', { cookie });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: member });
  assert.deepEqual(calls.at(-1), ['read', member.userId]);
});

test('name and email mutations use the authenticated actor and return updated safe summaries', async () => {
  currentMember = { ...member };
  const cookie = await signedInCookie(member.userId);
  const nameResponse = await request('/name', { cookie, method: 'PATCH', body: { name: '  Ada Lovelace  ' } });
  assert.equal(nameResponse.status, 200);
  assert.equal((await nameResponse.json()).user.name, 'Ada Lovelace');
  assert.deepEqual(calls.at(-1), ['name', member.userId, 'Ada Lovelace']);

  const emailResponse = await request('/email', { cookie, method: 'PATCH', body: { email: '  ADA.NEW@example.test ' } });
  assert.equal(emailResponse.status, 200);
  assert.equal((await emailResponse.json()).user.email, 'ADA.NEW@example.test');
  assert.deepEqual(calls.at(-1), ['email', member.userId, 'ADA.NEW@example.test']);
  for (const call of calls) assert.notEqual(call[1], librarian.userId);
});

test('profile operations reject signed-out and librarian requests with the standard error envelope', async () => {
  const signedOut = await request('');
  assert.equal(signedOut.status, 401);
  assert.deepEqual((await signedOut.json()).error.code, 'UNAUTHENTICATED');

  const cookie = await signedInCookie(librarian.userId);
  for (const [path, method, body] of [['', 'GET'], ['/name', 'PATCH', { name: 'Changed' }], ['/email', 'PATCH', { email: 'new@example.test' }]]) {
    const response = await request(path, { cookie, method, body });
    assert.equal(response.status, 403);
    assert.deepEqual((await response.json()).error.code, 'FORBIDDEN');
  }

  const inactiveCookie = await signedInCookie(inactiveMember.userId);
  const inactive = await request('', { cookie: inactiveCookie });
  assert.equal(inactive.status, 403);
  assert.deepEqual((await inactive.json()).error.code, 'FORBIDDEN');
});

test('name and email requests validate fields and reject client-selected identities', async () => {
  const cookie = await signedInCookie(member.userId);
  for (const [path, body] of [
    ['/name', { name: '' }], ['/name', { name: '  ' }], ['/name', { name: 'x'.repeat(121) }],
    ['/name', { name: 'Changed', userId: librarian.userId }], ['/email', { email: 'not-an-email' }],
    ['/email', { email: '' }], ['/email', { email: 'new@example.test', userId: librarian.userId }],
  ]) {
    const response = await request(path, { cookie, method: 'PATCH', body });
    assert.equal(response.status, 400, `${path} ${JSON.stringify(body)}`);
    const payload = await response.json();
    assert.equal(payload.error.code, 'VALIDATION_ERROR');
    assert.equal(typeof payload.error.message, 'string');
  }
});

test('account conflicts use the established API error envelope', async () => {
  const cookie = await signedInCookie(member.userId);
  const response = await request('/email', { cookie, method: 'PATCH', body: { email: 'taken@example.test' } });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: { code: 'CONFLICT', message: 'Email is already registered.' },
  });
});

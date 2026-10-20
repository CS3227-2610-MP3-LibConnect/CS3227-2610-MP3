import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { apiErrorHandler } from '../../dist/apps/api/src/http/errors.js';
import { createMemberProfileRouter } from '../../dist/apps/api/src/routes/member-profile.js';
import { StorageError } from '../../dist/apps/api/src/storage/repositories.js';

const member = {
  userId: 'password-member', name: 'Ada Member', email: 'ada@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'member-ada', authVersion: 4,
};
const librarian = {
  userId: 'password-librarian', name: 'Lee Librarian', email: 'lee@example.test',
  accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: 'employee-lee', authVersion: 0,
};
const usersById = new Map([[member.userId, member], [librarian.userId, librarian]]);
const users = { getById: async (userId) => usersById.get(userId) };
const calls = [];
const accounts = {
  async getProfile(userId) { return { ...usersById.get(userId) }; },
  async updateName(userId, name) { return { ...usersById.get(userId), name }; },
  async updateEmail(userId, email) { return { ...usersById.get(userId), email }; },
  async changePassword(...args) {
    calls.push(args);
    if (args.includes('wrong-current')) throw new StorageError('FORBIDDEN', 'Current password is incorrect.');
    return { ...usersById.get(args[0]) };
  },
};

const app = express();
app.use(express.json());
app.use(session({ secret: 'member-profile-password-test-session-secret', resave: false, saveUninitialized: false }));
app.get('/__test/session/:userId', (request, response) => {
  request.session.userId = request.params.userId;
  request.session.accountType = usersById.get(request.params.userId)?.accountType;
  request.session.authVersion = usersById.get(request.params.userId)?.authVersion ?? 0;
  response.set('X-Test-Session-Id', request.sessionID).json({ ok: true });
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

async function signedIn(userId) {
  const response = await fetch(`${apiOrigin}/__test/session/${userId}`);
  return {
    cookie: response.headers.getSetCookie().find((value) => value.startsWith('connect.sid='))?.split(';')[0],
    sessionId: response.headers.get('x-test-session-id'),
  };
}
async function passwordRequest({ cookie, method = 'PATCH', body } = {}) {
  return fetch(`${apiOrigin}/api/v1/member/profile/password`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test('password change requires an authenticated active member', async () => {
  const signedOut = await passwordRequest({ body: {} });
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'UNAUTHENTICATED');

  const { cookie } = await signedIn(librarian.userId);
  const nonMember = await passwordRequest({ cookie, body: {} });
  assert.equal(nonMember.status, 403);
  assert.equal((await nonMember.json()).error.code, 'FORBIDDEN');
});

test('password change rejects missing, extra, mismatched, short, or Unicode-whitespace passwords before storage', async () => {
  calls.length = 0;
  const { cookie } = await signedIn(member.userId);
  const invalidBodies = [
    {},
    { currentPassword: 'old-pass', newPassword: 'new-pass-123', confirmPassword: 'new-pass-123', userId: librarian.userId },
    { currentPassword: 'old-pass', newPassword: 'new-pass-123', confirmPassword: 'different-pass' },
    { currentPassword: 'old-pass', newPassword: 'short7', confirmPassword: 'short7' },
    { currentPassword: 'old-pass', newPassword: 'abc\u00a0defg', confirmPassword: 'abc\u00a0defg' },
    { currentPassword: 'old-pass', newPassword: 'abc\u2003defg', confirmPassword: 'abc\u2003defg' },
  ];
  for (const body of invalidBodies) {
    const response = await passwordRequest({ cookie, body });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  }
  assert.equal(calls.length, 0, 'invalid input must not call the password storage operation');
});

test('password length counts Unicode code points rather than UTF-16 code units', async () => {
  calls.length = 0;
  const { cookie } = await signedIn(member.userId);
  const sevenCodePoints = '😀'.repeat(7);
  assert.equal(sevenCodePoints.length, 14, 'fixture must contain fourteen UTF-16 code units');
  const tooShort = await passwordRequest({ cookie, body: {
    currentPassword: 'old-current-pass', newPassword: sevenCodePoints, confirmPassword: sevenCodePoints,
  } });
  assert.equal(tooShort.status, 400);
  assert.equal((await tooShort.json()).error.code, 'VALIDATION_ERROR');
  assert.equal(calls.length, 0);

  const eightCodePoints = '😀'.repeat(8);
  const valid = await passwordRequest({ cookie, body: {
    currentPassword: 'old-current-pass', newPassword: eightCodePoints, confirmPassword: eightCodePoints,
  } });
  assert.equal(valid.status, 200, 'eight supplementary Unicode code points should pass the length policy');
  assert.equal(calls.length, 1, 'valid code-point length should reach password storage');
});

test('password operation receives the server actor and current server session identifier and returns no secrets', async () => {
  calls.length = 0;
  const { cookie, sessionId } = await signedIn(member.userId);
  const body = { currentPassword: 'old-current-pass', newPassword: 'new-password-123', confirmPassword: 'new-password-123' };
  const response = await passwordRequest({ cookie, body });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.user.userId, member.userId);
  assert.equal('passwordHash' in result.user, false);
  assert.equal('authVersion' in result.user, false);
  assert.equal(JSON.stringify(result).includes(sessionId), false);
  assert.equal(JSON.stringify(result).includes(body.currentPassword), false);
  assert.equal(JSON.stringify(result).includes(body.newPassword), false);
  assert.ok(calls.length === 1);
  assert.ok(calls[0].includes(member.userId), 'storage must be called for the authenticated actor');
  assert.ok(calls[0].includes(sessionId), 'the session ID must come from the server request session');
  assert.equal(calls[0][4], member.authVersion, 'storage must receive the server actor version as its expected version');
});

test('incorrect current password is rejected with a safe API error', async () => {
  const { cookie } = await signedIn(member.userId);
  const response = await passwordRequest({ cookie, body: {
    currentPassword: 'wrong-current', newPassword: 'new-password-123', confirmPassword: 'new-password-123',
  } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.message, 'Current password is incorrect.');
});

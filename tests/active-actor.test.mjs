import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { requireActiveActor } from '../dist/apps/api/src/http/auth.js';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';

const activeMember = {
  userId: 'member-1',
  name: 'Member',
  email: 'member@example.test',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'mem-1',
  passwordHash: 'never-return-this',
  isManager: false,
};
const inactiveLibrarian = {
  userId: 'librarian-1',
  name: 'Librarian',
  email: 'librarian@example.test',
  accountType: 'LIBRARIAN',
  accountStatus: 'INACTIVE',
  employeeId: 'emp-1',
  passwordHash: 'never-return-this',
  isManager: true,
};
const records = new Map([
  [activeMember.userId, activeMember],
  [inactiveLibrarian.userId, inactiveLibrarian],
]);
const users = { getById: async (userId) => records.get(userId) };
const app = express();
app.use(
  session({
    secret: 'active-actor-test-session-secret-long-enough',
    resave: false,
    saveUninitialized: false,
  }),
);
app.get('/__test/session/:userId', (request, response) => {
  request.session.userId = request.params.userId;
  request.session.accountType = records.get(request.params.userId)?.accountType;
  response.json({ ok: true });
});
app.get('/api/v1/secure', requireActiveActor(users), (request, response) =>
  response.json({
    userId: request.actor.userId,
    accountType: request.actor.accountType,
    isManager: request.actor.isManager,
    passwordHash: request.actor.passwordHash,
  }),
);
app.use(apiErrorHandler);

let server;
let apiOrigin;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test('rejects a signed-out request with 401', async () => {
  const response = await fetch(`${apiOrigin}/api/v1/secure`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
});

test('uses the stored active actor rather than client-supplied role fields', async () => {
  const session = await fetch(`${apiOrigin}/__test/session/member-1`);
  const cookie = session.headers
    .getSetCookie()
    .find((value) => value.startsWith('connect.sid='))
    ?.split(';')[0];
  assert.ok(cookie);
  const response = await fetch(`${apiOrigin}/api/v1/secure?accountType=LIBRARIAN&isManager=true`, {
    headers: { Cookie: cookie },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.accountType, 'MEMBER');
  assert.equal(body.isManager, false);
  assert.equal(body.passwordHash, 'never-return-this');
});

test('denies an inactive actor despite an existing session', async () => {
  const session = await fetch(`${apiOrigin}/__test/session/librarian-1`);
  const cookie = session.headers
    .getSetCookie()
    .find((value) => value.startsWith('connect.sid='))
    ?.split(';')[0];
  assert.ok(cookie);
  const response = await fetch(`${apiOrigin}/api/v1/secure`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'FORBIDDEN');
});

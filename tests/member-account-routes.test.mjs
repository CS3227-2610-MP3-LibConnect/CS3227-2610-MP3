import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { createLibrarianMemberRouter } from '../dist/apps/api/src/routes/librarian-members.js';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';
import { originProtection } from '../dist/apps/api/src/http/origin-protection.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';

const origin = 'http://localhost:5173';
const apiConfiguredOrigin = 'https://api.example.test';
const cursorSecret = 'member-route-test-cursor-secret-long-enough';
const activeLibrarian = {
  userId: 'librarian-1',
  name: 'Librarian',
  email: 'librarian@example.test',
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
  employeeId: 'EMP-1',
  isManager: false,
};
const manager = {
  userId: 'manager-1',
  name: 'Manager',
  email: 'manager@example.test',
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
  employeeId: 'EMP-2',
  isManager: true,
};
const inactiveLibrarian = {
  userId: 'inactive-1',
  name: 'Inactive',
  email: 'inactive@example.test',
  accountType: 'LIBRARIAN',
  accountStatus: 'INACTIVE',
  employeeId: 'EMP-3',
  isManager: false,
};
const member = {
  userId: 'member-1',
  memberId: 'MEMBER-1',
  name: 'Member',
  email: 'member@example.test',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  registrationDateTime: new Date('2026-10-22T00:00:00.000Z'),
  passwordHash: 'secret',
  sessionId: 'session-secret',
};
const inactiveMember = {
  ...member,
  userId: 'member-2',
  memberId: 'MEMBER-2',
  accountStatus: 'INACTIVE',
  registrationDateTime: new Date('2026-10-22T00:01:00.000Z'),
};
const records = new Map(
  [activeLibrarian, manager, inactiveLibrarian, member, inactiveMember].map((value) => [
    value.userId,
    value,
  ]),
);
const calls = [];

const accounts = {
  async listMembers(input, actor) {
    calls.push(['list', input, actor]);
    if (input.cursor && input.status !== input.cursor.status)
      throw new StorageError(
        'INVALID',
        'The member-list cursor does not match the requested status filter.',
      );
    return {
      items: [member, inactiveMember],
      nextCursor: {
        status: input.status ?? null,
        lastRegistrationDateTime: '2026-10-22T00:01:00.000Z',
        lastUserId: 'member-2',
      },
    };
  },
  async getMember(userId, actor) {
    calls.push(['get', userId, actor]);
    const target = records.get(userId);
    if (!target) throw new StorageError('NOT_FOUND', 'Member account was not found.');
    if (target.accountType !== 'MEMBER')
      throw new StorageError('FORBIDDEN', 'The target is not a member account.');
    return target;
  },
  async updateMemberStatus(userId, status, actor) {
    calls.push(['update', userId, status, actor]);
    const target = records.get(userId);
    if (!target) throw new StorageError('NOT_FOUND', 'Member account was not found.');
    if (target.accountType !== 'MEMBER')
      throw new StorageError('FORBIDDEN', 'The target is not a member account.');
    if (target.accountStatus === status)
      throw new StorageError('CONFLICT', 'The member account already has that status.');
    return { ...target, accountStatus: status };
  },
};
const users = {
  async getById(userId) {
    return records.get(userId);
  },
};

const app = express();
app.use(originProtection(origin, apiConfiguredOrigin));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    secret: 'member-route-test-session-secret-long-enough',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
  }),
);
app.get('/__test/session/:userId', (request, response) => {
  const user = records.get(request.params.userId);
  if (!user) return response.sendStatus(404);
  request.session.userId = user.userId;
  request.session.accountType = user.accountType;
  response.json({ ok: true });
});
app.use('/api/v1/librarian', createLibrarianMemberRouter(accounts, users, cursorSecret));
app.use(apiErrorHandler);

let server;
let apiOrigin;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${server.address().port}`;
});
after(
  async () =>
    new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
);

async function sessionCookie(userId) {
  const response = await fetch(`${apiOrigin}/__test/session/${userId}`);
  return response.headers
    .getSetCookie()
    .find((value) => value.startsWith('connect.sid='))
    .split(';')[0];
}
async function request(path, init = {}) {
  return fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: { Origin: origin, ...(init.headers ?? {}) },
  });
}

test('member support list requires an active server-loaded librarian', async () => {
  assert.equal((await request('/api/v1/librarian/members')).status, 401);
  assert.equal(
    (
      await request('/api/v1/librarian/members', {
        headers: { Cookie: await sessionCookie('member-1') },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/v1/librarian/members', {
        headers: { Cookie: await sessionCookie('inactive-1') },
      })
    ).status,
    403,
  );
  const response = await request('/api/v1/librarian/members?accountType=LIBRARIAN', {
    headers: { Cookie: await sessionCookie('librarian-1') },
  });
  assert.equal(response.status, 400);
  const managerResponse = await request('/api/v1/librarian/members', {
    headers: { Cookie: await sessionCookie('manager-1') },
  });
  assert.equal(managerResponse.status, 200);
  const payload = await managerResponse.json();
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].passwordHash, undefined);
  assert.equal(payload.items[0].sessionId, undefined);
  assert.match(payload.page.nextCursor, /^[^.]+\.[^.]+$/);
});

test('member support list binds cursors to filters and rejects malformed input before storage', async () => {
  const cookie = await sessionCookie('librarian-1');
  const before = calls.length;
  assert.equal(
    (await request('/api/v1/librarian/members?limit=51', { headers: { Cookie: cookie } })).status,
    400,
  );
  assert.equal(
    (
      await request('/api/v1/librarian/members?cursor=not-a-cursor', {
        headers: { Cookie: cookie },
      })
    ).status,
    400,
  );
  assert.equal(calls.length, before);
  const first = await request('/api/v1/librarian/members', { headers: { Cookie: cookie } });
  const cursor = (await first.json()).page.nextCursor;
  const crossFilter = await request(
    `/api/v1/librarian/members?status=ACTIVE&cursor=${encodeURIComponent(cursor)}`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(crossFilter.status, 400);
});

test('member detail and status routes enforce strict target and mutation contracts', async () => {
  const cookie = await sessionCookie('librarian-1');
  const detail = await request('/api/v1/librarian/members/member-1', {
    headers: { Cookie: cookie },
  });
  assert.equal(detail.status, 200);
  assert.deepEqual(Object.keys((await detail.json()).member).sort(), [
    'accountStatus',
    'email',
    'memberId',
    'name',
    'registrationDateTime',
    'userId',
  ]);
  assert.equal(
    (await request('/api/v1/librarian/members/missing', { headers: { Cookie: cookie } })).status,
    404,
  );
  assert.equal(
    (await request('/api/v1/librarian/members/librarian-1', { headers: { Cookie: cookie } }))
      .status,
    403,
  );
  assert.equal(
    (await request('/api/v1/librarian/members/member%2F1', { headers: { Cookie: cookie } })).status,
    400,
  );

  const before = calls.length;
  const forged = await request('/api/v1/librarian/members/member-1/status', {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'INACTIVE',
      accountType: 'LIBRARIAN',
      isManager: true,
      target: member,
    }),
  });
  assert.equal(forged.status, 400);
  assert.equal(calls.length, before);
  const updated = await request('/api/v1/librarian/members/member-1/status', {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'INACTIVE' }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).member.accountStatus, 'INACTIVE');
  assert.equal(calls.at(-1)[3].userId, 'librarian-1');
  assert.equal(
    (
      await request('/api/v1/librarian/members/member-1/status', {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PENDING' }),
      })
    ).status,
    400,
  );
});

test('member status mutation preserves Origin protection and exposes generic failures only', async () => {
  const before = calls.length;
  const denied = await fetch(`${apiOrigin}/api/v1/librarian/members/member-1/status`, {
    method: 'PATCH',
    headers: {
      Origin: 'https://attacker.example',
      Cookie: await sessionCookie('librarian-1'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
  assert.equal(denied.status, 403);
  assert.equal(calls.length, before);
  const conflict = await request('/api/v1/librarian/members/member-2/status', {
    method: 'PATCH',
    headers: { Cookie: await sessionCookie('librarian-1'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'INACTIVE' }),
  });
  assert.equal(conflict.status, 409);
});

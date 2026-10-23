import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { createLibrarianAssistantRouter } from '../dist/apps/api/src/routes/librarian-assistant.js';
import { apiErrorHandler } from '../dist/apps/api/src/http/errors.js';

const usersById = new Map([
  [
    'member-1',
    {
      userId: 'member-1',
      name: 'Member',
      email: 'member@example.test',
      accountType: 'MEMBER',
      accountStatus: 'ACTIVE',
      memberId: 'member-1',
    },
  ],
  [
    'inactive-1',
    {
      userId: 'inactive-1',
      name: 'Inactive',
      email: 'inactive@example.test',
      accountType: 'LIBRARIAN',
      accountStatus: 'INACTIVE',
      employeeId: 'EMP-2',
      isManager: false,
    },
  ],
  [
    'librarian-1',
    {
      userId: 'librarian-1',
      name: 'Librarian',
      email: 'librarian@example.test',
      accountType: 'LIBRARIAN',
      accountStatus: 'ACTIVE',
      employeeId: 'EMP-1',
      isManager: false,
    },
  ],
  [
    'manager-1',
    {
      userId: 'manager-1',
      name: 'Manager',
      email: 'manager@example.test',
      accountType: 'LIBRARIAN',
      accountStatus: 'ACTIVE',
      employeeId: 'EMP-3',
      isManager: true,
    },
  ],
]);
const calls = [];
const service = {
  async summarize(input, actor) {
    calls.push(['summary', input, actor.userId]);
    return {
      summary: 'Review.',
      items: [],
      uncertainty: null,
      advisory: true,
      requiresHumanApproval: true,
    };
  },
  async draft(input, actor) {
    calls.push(['draft', input, actor.userId]);
    return {
      message: 'Follow up.',
      rationale: 'Review.',
      warning: null,
      sourceType: 'PENDING_REPORT',
      sourceId: input.sourceId,
      loanId: input.sourceId,
      memberId: 'member-1',
      purpose: input.purpose,
      notificationType: 'LIBRARIAN_MESSAGE',
      referenceType: null,
      referenceId: null,
      advisory: true,
      requiresHumanApproval: true,
    };
  },
};

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use(
  session({
    secret: 'librarian-ai-route-test-session-secret-long-enough',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
  }),
);
app.get('/__test/session/:userId', (request, response) => {
  const user = usersById.get(request.params.userId);
  if (!user) return response.sendStatus(404);
  request.session.userId = user.userId;
  request.session.accountType = user.accountType;
  response.json({ ok: true });
});
app.use(
  '/api/v1',
  createLibrarianAssistantRouter(service, {
    async getById(userId) {
      return usersById.get(userId);
    },
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
  server.closeAllConnections?.();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

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
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

test('assistant routes require the server-loaded active librarian', async () => {
  assert.equal(
    (
      await request('/api/v1/librarian/assistant/pending-reports/summary', {
        method: 'POST',
        body: JSON.stringify({ loanIds: ['loan-1'] }),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/api/v1/librarian/assistant/pending-reports/summary', {
        method: 'POST',
        headers: { Cookie: await sessionCookie('inactive-1') },
        body: JSON.stringify({ loanIds: ['loan-1'] }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/v1/librarian/assistant/pending-reports/summary', {
        method: 'POST',
        headers: { Cookie: await sessionCookie('member-1') },
        body: JSON.stringify({ loanIds: ['loan-1'] }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/v1/librarian/assistant/pending-reports/summary', {
        method: 'POST',
        headers: { Cookie: await sessionCookie('librarian-1') },
        body: JSON.stringify({ loanIds: ['loan-1'] }),
      })
    ).status,
    200,
  );
});

test('assistant routes reject forged authority fields before the service call', async () => {
  const cookie = await sessionCookie('librarian-1');
  const beforeCalls = calls.length;
  const response = await request('/api/v1/librarian/assistant/notification-draft', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({
      sourceType: 'PENDING_REPORT',
      sourceId: 'loan-1',
      purpose: 'RETURN_FOLLOW_UP',
      memberId: 'forged',
      approved: true,
      model: 'other-model',
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(calls.length, beforeCalls);
});

test('summary and draft routes pass only typed fields and server actor to the service', async () => {
  const cookie = await sessionCookie('manager-1');
  const summary = await request('/api/v1/librarian/assistant/pending-reports/summary', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ loanIds: ['loan-1'] }),
  });
  assert.equal(summary.status, 200);
  const draft = await request('/api/v1/librarian/assistant/notification-draft', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({
      sourceType: 'PENDING_REPORT',
      sourceId: 'loan-1',
      purpose: 'LOSS_FOLLOW_UP',
    }),
  });
  assert.equal(draft.status, 200);
  assert.deepEqual(calls.at(-2), ['summary', { loanIds: ['loan-1'] }, 'manager-1']);
  assert.deepEqual(calls.at(-1), [
    'draft',
    { sourceType: 'PENDING_REPORT', sourceId: 'loan-1', purpose: 'LOSS_FOLLOW_UP' },
    'manager-1',
  ]);
});

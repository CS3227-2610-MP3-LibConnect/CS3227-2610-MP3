import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { apiErrorHandler } from '../../dist/apps/api/src/http/errors.js';
import { originProtection } from '../../dist/apps/api/src/http/origin-protection.js';

const clientOrigin = 'http://localhost:5173';
const apiConfiguredOrigin = 'https://api.example.test';
const app = express();
app.use(originProtection(clientOrigin, apiConfiguredOrigin));
app.post('/write', (_request, response) => response.json({ saved: true }));
app.get('/read', (_request, response) => response.json({ ok: true }));
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

test('allows credentialed CORS preflight from the configured client origin', async () => {
  const response = await fetch(`${apiOrigin}/write`, {
    method: 'OPTIONS',
    headers: {
      Origin: clientOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), clientOrigin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('allows the idempotency header used by librarian message sends', async () => {
  const response = await fetch(`${apiOrigin}/write`, {
    method: 'OPTIONS',
    headers: {
      Origin: clientOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,idempotency-key',
    },
  });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /Idempotency-Key/i);
});

test('rejects state-changing requests with a mismatched or missing Origin', async () => {
  const mismatched = await fetch(`${apiOrigin}/write`, {
    method: 'POST',
    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  const missing = await fetch(`${apiOrigin}/write`, { method: 'POST' });
  assert.equal(mismatched.status, 403);
  assert.equal(missing.status, 403);
});

test('allows state-changing requests from the configured client origin', async () => {
  const response = await fetch(`${apiOrigin}/write`, {
    method: 'POST',
    headers: { Origin: clientOrigin, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), clientOrigin);
});

test('allows the configured HTTPS API origin behind TLS termination', async () => {
  const response = await fetch(`${apiOrigin}/write`, {
    method: 'POST',
    headers: {
      Origin: apiConfiguredOrigin,
      Host: 'api.example.test',
      'X-Forwarded-Proto': 'https',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'field=value',
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('keeps safe reads public without granting cross-origin browser access', async () => {
  const response = await fetch(`${apiOrigin}/read`, {
    headers: { Origin: 'https://attacker.example' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

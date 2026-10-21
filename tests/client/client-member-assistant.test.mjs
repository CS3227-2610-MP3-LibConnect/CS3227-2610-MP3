import assert from 'node:assert/strict';
import { createReadStream, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { assistantApi } from '../../dist/apps/client/src/api/assistant.js';

const memberOne = {
  userId: 'member-user-1', memberId: 'member-1', name: 'Member One', email: 'one@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE',
};

function captureFetch(t, response) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  return calls;
}

test('typed assistant API uses the session-authenticated apiRequest contract and sends only question plus at most ten history turns', async (t) => {
  const result = { answer: 'Check My Loans for your current account details.' };
  const calls = captureFetch(t, result);
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user', content: `turn ${index}`,
  }));

  const untypedInput = { question: 'Where are my loans?', history, memberId: 'attacker-member', model: 'attacker-model' };
  assert.deepEqual(await assistantApi.chat(untypedInput), result);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url.pathname, '/api/v1/member/assistant/chat');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'include');
  const body = JSON.parse(init.body);
  assert.deepEqual(Object.keys(body).sort(), ['history', 'question']);
  assert.equal(body.question, 'Where are my loans?');
  assert.equal(body.history.length, 10);
  assert.equal(body.history.at(-1).content, 'turn 11');
  assert.equal('model' in body, false);
  assert.equal('memberId' in body, false);
});

async function startBrowserApp() {
  const clientRoot = resolve('apps/client/dist');
  const contentTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  const server = createHttpServer((request, response) => {
    let filePath = resolve(clientRoot, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (!filePath.startsWith(`${clientRoot}${sep}`) && filePath !== clientRoot) return response.writeHead(403).end();
    try { if (!statSync(filePath).isFile()) filePath = resolve(clientRoot, 'index.html'); }
    catch { filePath = resolve(clientRoot, 'index.html'); }
    response.setHeader('Content-Type', contentTypes[extname(filePath)] ?? 'application/octet-stream');
    createReadStream(filePath).pipe(response);
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const browser = await chromium.launch({ headless: true });
  return {
    browser,
    url: `http://127.0.0.1:${server.address().port}/member/dashboard`,
    close: async () => {
      await browser.close();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test('shared Libby panel retains bounded in-memory conversation across member routes, renders text safely, and clears on logout/account change', { concurrency: false }, async (t) => {
  const app = await startBrowserApp();
  t.after(app.close);
  const page = await app.browser.newPage();
  page.setDefaultTimeout(3000);
  let currentMember = memberOne;
  let assistantCalls = 0;
  const requests = [];
  let releaseFirstAssistant;
  const firstAssistantPending = new Promise((resolve) => { releaseFirstAssistant = resolve; });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/auth/session') {
      await route.fulfill({ json: { authenticated: Boolean(currentMember), ...(currentMember ? { user: currentMember } : {}) } });
    } else if (path === '/api/v1/auth/logout') {
      currentMember = null;
      await route.fulfill({ json: {} });
    } else if (path === '/api/v1/auth/login') {
      currentMember = { ...memberOne, userId: 'member-user-2', memberId: 'member-2', name: 'Member Two' };
      await route.fulfill({ json: { user: currentMember } });
    } else if (path === '/api/v1/member/assistant/chat') {
      const body = request.postDataJSON();
      requests.push(body);
      assistantCalls += 1;
      if (assistantCalls === 1) await firstAssistantPending;
      if (assistantCalls === 2) {
        await route.fulfill({ status: 503, json: { error: { code: 'AI_UNAVAILABLE', message: 'The assistant is temporarily unavailable. Please try again later.' } } });
      } else {
        await route.fulfill({ json: { answer: '<img src=x onerror=alert(1)> Check My Loans for account details.' } });
      }
    } else {
      await route.fulfill({ json: { items: [], loans: [], reservations: [], fines: [], notifications: [], page: { limit: 25, nextCursor: null } } });
    }
  });

  await page.goto(app.url);
  await page.getByRole('button', { name: 'Ask Libby' }).click();
  await page.getByRole('heading', { name: 'Libby' }).waitFor();
  const input = page.getByRole('textbox', { name: 'Message Libby' });
  await input.fill('Where are my loans?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('status').getByText(/thinking/i).waitFor();
  releaseFirstAssistant();
  await page.getByText('<img src=x onerror=alert(1)> Check My Loans for account details.', { exact: true }).waitFor();
  assert.equal(await page.locator('img[src="x"]').count(), 0, 'assistant answer must render as text, not HTML');
  await page.getByRole('button', { name: 'Close Libby' }).click();
  await page.getByRole('button', { name: 'Ask Libby' }).click();
  await page.getByText('<img src=x onerror=alert(1)> Check My Loans for account details.', { exact: true }).waitFor();

  await page.getByRole('link', { name: 'Borrow', exact: true }).click();
  await page.getByRole('heading', { name: 'Borrow' }).waitFor();
  await page.getByRole('button', { name: 'Ask Libby' }).click();
  await page.getByText('<img src=x onerror=alert(1)> Check My Loans for account details.', { exact: true }).waitFor();
  await input.fill('A second question');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('alert').getByText(/temporarily unavailable/i).waitFor();
  assert.ok(requests.length >= 2);
  assert.ok(requests.every((request) => request.history.length <= 10));
  assert.deepEqual(requests[1].history, [
    { role: 'user', content: 'Where are my loans?' },
    { role: 'assistant', content: '<img src=x onerror=alert(1)> Check My Loans for account details.' },
  ]);
  assert.ok(requests.every((request) => !('memberId' in request) && !('model' in request)));

  await page.getByRole('button', { name: 'Logout' }).click();
  await page.getByRole('heading', { name: 'Sign in to LibConnect' }).waitFor();
  assert.equal(await page.getByText('<img src=x onerror=alert(1)> Check My Loans for account details.', { exact: true }).count(), 0);
  await page.getByLabel('Email address').fill('two@example.test');
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Ask Libby' }).click();
  await page.getByRole('heading', { name: 'Libby' }).waitFor();
  assert.equal(await page.getByText('<img src=x onerror=alert(1)> Check My Loans for account details.', { exact: true }).count(), 0,
    'a subsequent authenticated member must not inherit the previous member conversation');
});

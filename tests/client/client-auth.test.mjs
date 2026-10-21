import assert from 'node:assert/strict';
import { createReadStream, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { chromium } from 'playwright';
import { AuthContext } from '../../dist/apps/client/src/auth/AuthContext.js';
import { ProtectedRoute } from '../../dist/apps/client/src/auth/ProtectedRoute.js';
import { dashboardPathFor, postLoginPathFor } from '../../dist/apps/client/src/auth/dashboard-routing.js';
import { LoginPage } from '../../dist/apps/client/src/pages/LoginPage.js';
import { RegisterPage } from '../../dist/apps/client/src/pages/RegisterPage.js';

const signedOut = {
  user: null,
  loading: false,
  login: async () => {},
  register: async () => ({ userId: '', name: '', email: '', accountType: 'MEMBER', accountStatus: 'ACTIVE' }),
  logout: async () => {},
};

function render(element, auth = signedOut) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(AuthContext.Provider, { value: auth }, element)));
}

async function startLoginBrowserApp() {
  const clientRoot = resolve('apps/client/dist');
  const contentTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  const server = createHttpServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let filePath = resolve(clientRoot, `.${pathname}`);
    if (!filePath.startsWith(`${clientRoot}${sep}`) && filePath !== clientRoot) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (!statSync(filePath).isFile()) filePath = resolve(clientRoot, 'index.html');
    } catch {
      filePath = resolve(clientRoot, 'index.html');
    }
    response.setHeader('Content-Type', contentTypes[extname(filePath)] ?? 'application/octet-stream');
    createReadStream(filePath).pipe(response);
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const browser = await chromium.launch({ headless: true });
  return {
    browser,
    url: `http://127.0.0.1:${address.port}/login`,
    close: async () => {
      await browser.close();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test('login page requires the user to select a member or librarian account', () => {
  const markup = render(React.createElement(LoginPage));
  assert.match(markup, /name="accountType"/);
  assert.match(markup, /value="MEMBER"/);
  assert.match(markup, /value="LIBRARIAN"/);
  assert.match(markup, /type="email"/);
  assert.match(markup, /type="password"/);
});

test('login feedback distinguishes disabled members and keeps all other authentication failures generic', { concurrency: false }, async () => {
  const app = await startLoginBrowserApp();
  try {
    const page = await app.browser.newPage();
    page.setDefaultTimeout(2500);
    let loginResponse = { status: 401, json: { error: { code: 'ACCOUNT_DISABLED', message: 'This account is disabled.' } } };
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/auth/session') {
        await route.fulfill({ json: { authenticated: false } });
      } else if (path === '/api/v1/auth/login') {
        await route.fulfill(loginResponse);
      } else {
        await route.fulfill({ status: 404, json: { error: { message: 'Unexpected test request' } } });
      }
    });

    await page.goto(app.url);
    await page.getByLabel('Email address').fill('member@example.test');
    await page.getByLabel('Password').fill('correct-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('alert').filter({ hasText: 'This account is disabled.' }).waitFor();

    loginResponse = { status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.' } } };
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' }).waitFor();
    await assert.rejects(page.getByRole('alert').filter({ hasText: 'This account is disabled.' }).waitFor({ timeout: 150 }));

    loginResponse = { status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.' } } };
    await page.getByLabel('Librarian', { exact: true }).check();
    await page.getByLabel('Password').fill('inactive-librarian-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' }).waitFor();
    await assert.rejects(page.getByRole('alert').filter({ hasText: 'This account is disabled.' }).waitFor({ timeout: 150 }));
    await page.close();
  } finally {
    await app.close();
  }
});

test('registration starts as a member and advertises separate sign-in', () => {
  const markup = render(React.createElement(RegisterPage));
  assert.match(markup, /Registration will not sign you in automatically/);
  assert.match(markup, /Create account/);
  assert.doesNotMatch(markup, /Employee ID/);
});

test('protected content is withheld for signed-out users and shown to an authenticated user', () => {
  const protectedContent = React.createElement('p', null, 'Private library dashboard');
  const signedOutMarkup = render(React.createElement(ProtectedRoute, null, protectedContent));
  assert.doesNotMatch(signedOutMarkup, /Private library dashboard/);
  const signedInMarkup = render(React.createElement(ProtectedRoute, null, protectedContent), {
    ...signedOut,
    user: { userId: 'u-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE' },
  });
  assert.match(signedInMarkup, /Private library dashboard/);
});

test('dashboard destinations and saved return paths follow the authenticated role', () => {
  assert.equal(dashboardPathFor('MEMBER'), '/member/dashboard');
  assert.equal(dashboardPathFor('LIBRARIAN'), '/librarian/dashboard');
  assert.equal(postLoginPathFor('MEMBER', '/'), '/');
  assert.equal(postLoginPathFor('LIBRARIAN', '/librarian/dashboard'), '/librarian/dashboard');
  assert.equal(postLoginPathFor('MEMBER', '/librarian/dashboard'), '/member/dashboard');
  assert.equal(postLoginPathFor('LIBRARIAN', '/member/dashboard'), '/librarian/dashboard');
  assert.equal(postLoginPathFor('MEMBER', '/register'), '/member/dashboard');
});

test('role dashboard guards withhold dashboard content from the other account type', () => {
  const memberDashboard = React.createElement(ProtectedRoute, { accountType: 'MEMBER' },
    React.createElement('p', null, 'Member dashboard content'));
  const librarianDashboard = React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN' },
    React.createElement('p', null, 'Librarian dashboard content'));
  const member = {
    ...signedOut,
    user: { userId: 'm-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE' },
  };
  const librarian = {
    ...signedOut,
    user: { userId: 'l-1', name: 'Librarian', email: 'librarian@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE' },
  };

  assert.match(render(memberDashboard, member), /Member dashboard content/);
  assert.doesNotMatch(render(librarianDashboard, member), /Librarian dashboard content/);
  assert.match(render(librarianDashboard, librarian), /Librarian dashboard content/);
  assert.doesNotMatch(render(memberDashboard, librarian), /Member dashboard content/);
  assert.doesNotMatch(render(memberDashboard), /Member dashboard content/);
});

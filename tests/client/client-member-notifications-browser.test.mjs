import assert from 'node:assert/strict';
import { createReadStream, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const member = {
  userId: 'notifications-browser-member', name: 'Notification Member', email: 'member@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'member-1',
};

const ownNotification = (notificationId, { read = false, message = notificationId, createdAt = '2026-10-19T10:20:30.000Z' } = {}) => ({
  notificationId,
  recipientUserId: member.userId,
  notificationType: 'LIBRARIAN_MESSAGE',
  referenceType: 'FINE',
  referenceId: `fine-${notificationId}`,
  message,
  createdAt,
  read,
});

async function startBrowserApp() {
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
    url: `http://127.0.0.1:${address.port}/member/dashboard`,
    close: async () => {
      await browser.close();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function routeMemberApi(page, notificationHandler) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/auth/session') {
      await route.fulfill({ json: { authenticated: true, user: member } });
    } else if (url.pathname === '/api/v1/books') {
      await route.fulfill({ json: { items: [], page: { limit: 20, nextCursor: null } } });
    } else if (url.pathname.startsWith('/api/v1/member/notifications')) {
      await notificationHandler(route, url);
    } else {
      await route.fulfill({ status: 404, json: { error: 'Unexpected test request' } });
    }
  });
}

test('notification preview shows loading, retry, empty and server-selected ordered read states', { concurrency: false }, async () => {
  const app = await startBrowserApp();
  const pages = [];
  try {
    const errorPage = await app.browser.newPage();
    pages.push(errorPage);
    errorPage.setDefaultTimeout(3000);
    let previewRequests = 0;
    await routeMemberApi(errorPage, async (route, url) => {
      if (url.pathname.endsWith('/preview')) {
        previewRequests += 1;
        if (previewRequests === 1) await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
        else await route.fulfill({ json: { items: [] } });
      } else await route.fulfill({ status: 404 });
    });
    await errorPage.goto(app.url);
    await errorPage.getByRole('status').filter({ hasText: 'Loading notifications' }).waitFor();
    await errorPage.getByRole('alert').filter({ hasText: 'could not load your notifications' }).waitFor();
    const requestsBeforeRetry = previewRequests;
    await errorPage.getByRole('button', { name: 'Try again' }).click();
    await errorPage.getByText('No notifications yet.').waitFor();
    assert.ok(previewRequests > requestsBeforeRetry, 'retry makes a new preview request');

    const previewPage = await app.browser.newPage();
    pages.push(previewPage);
    previewPage.setDefaultTimeout(3000);
    let releasePreview;
    const pendingPreview = new Promise((resolve) => { releasePreview = resolve; });
    const response = [
      ownNotification('unread-newest', { message: 'Newest unread' }),
      ownNotification('unread-older', { message: 'Older unread', createdAt: '2026-10-18T10:20:30.000Z' }),
      ownNotification('read-visible', { read: true, message: 'Visible read' }),
    ];
    await routeMemberApi(previewPage, async (route, url) => {
      if (url.pathname.endsWith('/preview')) {
        await pendingPreview;
        await route.fulfill({ json: { items: response } });
      } else await route.fulfill({ status: 404 });
    });
    await previewPage.goto(app.url);
    await previewPage.getByRole('status').filter({ hasText: 'Loading notifications' }).waitFor();
    releasePreview();
    const cards = previewPage.locator('.member-notification-list .member-notification-button');
    await cards.first().waitFor();
    assert.deepEqual(await cards.locator('.member-notification-message').allTextContents(), ['Newest unread', 'Older unread', 'Visible read'],
      'the client displays the server-selected preview in its returned order');
    assert.match(await cards.nth(0).getAttribute('class'), /member-notification-unread/);
    assert.match(await cards.nth(1).getAttribute('class'), /member-notification-unread/);
    assert.match(await cards.nth(2).getAttribute('class'), /member-notification-read/);
    assert.ok((await cards.count()) === response.length, 'only the server-provided recipient preview is displayed');
  } finally {
    await Promise.all(pages.map((page) => page.close()));
    await app.close();
  }
});

test('notification preview renders exactly the server-selected order with one or zero unread items', { concurrency: false }, async () => {
  const app = await startBrowserApp();
  const pages = [];
  try {
    const scenarios = [
      {
        name: 'exactly one unread',
        response: [
          ownNotification('one-unread-newest-read', { read: true, message: 'Newest read' }),
          ownNotification('one-unread-item', { message: 'Only unread' }),
          ownNotification('one-unread-oldest-read', { read: true, message: 'Oldest read' }),
        ],
      },
      {
        name: 'zero unread',
        response: [
          ownNotification('zero-unread-newest', { read: true, message: 'Read newest' }),
          ownNotification('zero-unread-oldest', { read: true, message: 'Read oldest' }),
        ],
      },
    ];

    for (const scenario of scenarios) {
      const page = await app.browser.newPage();
      pages.push(page);
      page.setDefaultTimeout(3000);
      await routeMemberApi(page, async (route, url) => {
        if (url.pathname.endsWith('/preview')) await route.fulfill({ json: { items: scenario.response } });
        else await route.fulfill({ status: 404, json: { error: 'Unexpected notification request' } });
      });

      await page.goto(app.url);
      const cards = page.locator('.member-notification-list .member-notification-button');
      await cards.first().waitFor();
      assert.deepEqual(
        await cards.locator('.member-notification-message').allTextContents(),
        scenario.response.map(({ message }) => message),
        `${scenario.name}: cards exactly match the server-selected response in order`,
      );
      assert.equal(await cards.count(), scenario.response.length, `${scenario.name}: no additional cards are rendered`);
      for (const [index, notification] of scenario.response.entries()) {
        const className = await cards.nth(index).getAttribute('class');
        assert.match(className, notification.read ? /member-notification-read/ : /member-notification-unread/,
          `${scenario.name}: card ${index} preserves its server-provided read state`);
      }
    }
  } finally {
    await Promise.all(pages.map((page) => page.close()));
    await app.close();
  }
});

test('history pages append by cursor and detail waits for read confirmation before synchronizing visible copies', { concurrency: false }, async () => {
  const app = await startBrowserApp();
  let releaseRead;
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  try {
    const page = await app.browser.newPage();
    page.setDefaultTimeout(3000);
    const markupMessage = '<img src=x onerror="alert(1)"> literal message';
    const unread = ownNotification('unread-1', { message: markupMessage });
    const alreadyRead = ownNotification('read-1', { read: true, message: 'Already read item' });
    let readCalls = 0;
    const historyRequests = [];
    await routeMemberApi(page, async (route, url) => {
      const method = route.request().method();
      if (url.pathname.endsWith('/preview') && method === 'GET') {
        await route.fulfill({ json: { items: [unread, alreadyRead] } });
      } else if (url.pathname === '/api/v1/member/notifications' && method === 'GET') {
        historyRequests.push(url.searchParams.get('cursor'));
        const secondPage = url.searchParams.get('cursor') === 'next-page';
        await route.fulfill({ json: {
          items: secondPage ? [alreadyRead] : [unread],
          page: { limit: 20, nextCursor: secondPage ? null : 'next-page' },
        } });
      } else if (url.pathname === `/api/v1/member/notifications/${unread.notificationId}` && method === 'GET') {
        await route.fulfill({ json: { notification: unread } });
      } else if (url.pathname === `/api/v1/member/notifications/${alreadyRead.notificationId}` && method === 'GET') {
        await route.fulfill({ json: { notification: alreadyRead } });
      } else if (url.pathname.endsWith('/read') && method === 'PATCH') {
        readCalls += 1;
        await readGate;
        await route.fulfill({ status: 204, body: '' });
      } else await route.fulfill({ status: 404, json: { error: 'Unexpected notification request' } });
    });

    await page.goto(app.url);
    const previewCard = page.locator('.member-notification-list .member-notification-button').filter({ hasText: 'literal message' });
    await previewCard.waitFor();
    await page.getByRole('button', { name: 'View All Notifications' }).click();
    const history = page.locator('.member-notification-history-scroll');
    await history.getByText(markupMessage, { exact: true }).waitFor();
    await history.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await history.getByText('Already read item', { exact: true }).waitFor();
    assert.deepEqual(historyRequests, [null, 'next-page'], 'scroll requests the next server cursor and appends that page');
    assert.equal(await page.locator('.member-notification-history-scroll img').count(), 0,
      'HTML-like message text is not interpreted as an image element');

    await history.getByRole('button').filter({ hasText: 'literal message' }).click();
    const detail = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Notification details' }) });
    await detail.getByText(markupMessage, { exact: true }).waitFor();
    await detail.getByText('FINE', { exact: true }).waitFor();
    await detail.getByText('fine-unread-1', { exact: true }).waitFor();
    assert.equal(await detail.locator('img').count(), 0, 'detail content remains literal text');
    assert.equal(readCalls, 1, 'opening unread item issues one read update');
    assert.match(await previewCard.getAttribute('class'), /member-notification-unread/,
      'preview remains unread until the API confirms');
    const historyUnread = history.getByRole('button').filter({ hasText: 'literal message' });
    assert.match(await historyUnread.getAttribute('class'), /member-notification-unread/,
      'history remains unread until the API confirms');
    releaseRead();
    await page.waitForFunction(() => document.querySelector('.member-notification-list .member-notification-unread') === null);
    assert.match(await previewCard.getAttribute('class'), /member-notification-read/,
      'confirmed read state updates the preview card');
    assert.match(await historyUnread.getAttribute('class'), /member-notification-read/,
      'confirmed read state updates the history card');

    await detail.getByRole('button', { name: 'Close' }).click();
    await history.getByRole('button').filter({ hasText: 'Already read item' }).click();
    await page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Notification details' }) }).getByText('Already read item').waitFor();
    assert.equal(readCalls, 1, 'opening an already-read notification does not issue a PATCH');
    await page.close();
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    releaseRead?.();
    await app.close();
  }
});

test('failed read update stays unread and can be retried', { concurrency: false }, async () => {
  const app = await startBrowserApp();
  try {
    const page = await app.browser.newPage();
    page.setDefaultTimeout(3000);
    const unread = ownNotification('retry-read', { message: 'Retry this read' });
    let readCalls = 0;
    await routeMemberApi(page, async (route, url) => {
      const method = route.request().method();
      if (url.pathname.endsWith('/preview')) await route.fulfill({ json: { items: [unread] } });
      else if (url.pathname === `/api/v1/member/notifications/${unread.notificationId}` && method === 'GET') {
        await route.fulfill({ json: { notification: unread } });
      } else if (url.pathname.endsWith('/read') && method === 'PATCH') {
        readCalls += 1;
        if (readCalls === 1) await route.fulfill({ status: 503, json: { error: 'Write failed' } });
        else await route.fulfill({ status: 204, body: '' });
      } else await route.fulfill({ status: 404, json: { error: 'Unexpected notification request' } });
    });

    await page.goto(app.url);
    const card = page.locator('.member-notification-list .member-notification-button').filter({ hasText: 'Retry this read' });
    await card.click();
    const detail = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Notification details' }) });
    await detail.getByRole('alert').filter({ hasText: 'remains unread' }).waitFor();
    assert.match(await card.getAttribute('class'), /member-notification-unread/);
    await detail.getByRole('button', { name: 'Retry mark as read' }).click();
    await page.waitForFunction(() => document.querySelector('.member-notification-list .member-notification-unread') === null);
    assert.equal(readCalls, 2, 'retry resends the failed read update once');
    assert.match(await card.getAttribute('class'), /member-notification-read/);
    await page.close();
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    await app.close();
  }
});

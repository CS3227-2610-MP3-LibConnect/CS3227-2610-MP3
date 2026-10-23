import assert from 'node:assert/strict';
import { createReadStream, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const member = {
  userId: 'member-user',
  name: 'Member',
  email: 'member@example.test',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'member-1',
};
const activeLoan = {
  loanId: 'loan-1',
  bookTitle: 'A Browser Test Book',
  dueDate: '2026-11-20T00:00:00.000Z',
  status: 'ACTIVE',
  isRenewed: false,
  closureReportType: null,
};
const pendingLoan = { ...activeLoan, status: 'PENDING_CLOSE', closureReportType: 'LOST' };

async function startBrowserApp() {
  const clientRoot = resolve('apps/client/dist');
  const contentTypes = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
  };
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
    response.setHeader(
      'Content-Type',
      contentTypes[extname(filePath)] ?? 'application/octet-stream',
    );
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
    url: `http://127.0.0.1:${address.port}/member/profile/loans`,
    close: async () => {
      await browser.close();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

async function mockMemberApi(page, { submit, getLoans }) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/auth/session') {
      await route.fulfill({ json: { authenticated: true, user: member } });
    } else if (url.pathname === '/api/v1/member/loans' && request.method() === 'GET') {
      await route.fulfill({ json: { loans: getLoans() } });
    } else if (url.pathname === '/api/v1/member/loans/loan-1/closure-report') {
      await submit(route);
    } else {
      await route.fulfill({ status: 404, json: { error: 'Unexpected test request' } });
    }
  });
}

test(
  'My Loans report dialogs cancel without requests, submit once, and refresh to pending review',
  { concurrency: false },
  async () => {
    const app = await startBrowserApp();
    let releaseSubmission;
    try {
      const page = await app.browser.newPage();
      page.setDefaultTimeout(2500);
      let reportRequests = 0;
      let reportSubmitted = false;
      const submission = new Promise((resolve) => {
        releaseSubmission = resolve;
      });
      await mockMemberApi(page, {
        getLoans: () => (reportSubmitted ? [pendingLoan] : [activeLoan]),
        submit: async (route) => {
          reportRequests += 1;
          reportSubmitted = true;
          await submission;
          await route.fulfill({ json: { success: true } });
        },
      });

      await page.goto(app.url);
      const reportAction = page.getByRole('button', { name: 'Report Return or Loss' });
      await reportAction.click();
      let dialog = page.getByRole('dialog');
      const returnedChoice = dialog.getByRole('button', { name: 'Returned' });
      await dialog.getByText('A Browser Test Book', { exact: true }).waitFor();
      await returnedChoice.waitFor();
      assert.equal(
        await returnedChoice.evaluate((element) => element === document.activeElement),
        true,
        'opening the dialog moves focus into its first choice',
      );
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await dialog
          .getByRole('button', { name: 'Cancel' })
          .evaluate((element) => element === document.activeElement),
        true,
        'Shift+Tab wraps focus to the last dialog control',
      );
      await page.keyboard.press('Tab');
      assert.equal(
        await returnedChoice.evaluate((element) => element === document.activeElement),
        true,
        'Tab wraps focus to the first dialog control',
      );
      await page.keyboard.press('Escape');
      await reportAction.waitFor();
      assert.equal(
        await reportAction.evaluate((element) => element === document.activeElement),
        true,
        'cancelling restores focus to the report action',
      );
      assert.equal(reportRequests, 0, 'cancelling the type selection must not submit');

      await page.getByRole('button', { name: 'Report Return or Loss' }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Lost' }).click();
      await dialog.getByText('A Browser Test Book', { exact: true }).waitFor();
      await dialog.getByText('Report this book as lost?', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Back' }).click();
      await dialog.getByRole('button', { name: 'Returned' }).click();
      await dialog.getByText('A Browser Test Book', { exact: true }).waitFor();
      await dialog.getByText('Report this book as returned?', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      assert.equal(reportRequests, 0, 'cancelling confirmation must not submit');

      await page.getByRole('button', { name: 'Report Return or Loss' }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Lost' }).click();
      await dialog.getByText('A Browser Test Book', { exact: true }).waitFor();
      await dialog.getByText('Report this book as lost?', { exact: true }).waitFor();
      const confirm = dialog.getByRole('button', { name: 'Confirm report' });
      await confirm.click();
      const submitting = dialog.getByRole('button', { name: 'Submitting…' });
      await submitting.waitFor();
      assert.equal(await submitting.isDisabled(), true);
      await submitting.click({ force: true });
      assert.equal(
        reportRequests,
        1,
        'a second click while submitting must not send another request',
      );
      releaseSubmission();

      await page
        .getByRole('status')
        .filter({ hasText: 'submitted for librarian review' })
        .waitFor();
      await page.getByText('Lost', { exact: false }).waitFor();
      await page.getByText(/awaiting librarian review/i).waitFor();
      await assert.rejects(
        page.getByRole('button', { name: 'Report Return or Loss' }).waitFor({ timeout: 150 }),
      );
      await page.close();
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      releaseSubmission?.();
      await app.close();
    }
  },
);

test(
  'stale report failure refreshes the server-confirmed pending state and explains the conflict',
  { concurrency: false },
  async () => {
    const app = await startBrowserApp();
    try {
      const page = await app.browser.newPage();
      page.setDefaultTimeout(2500);
      let loanReads = 0;
      let reportAttempted = false;
      await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/api/v1/auth/session') {
          await route.fulfill({ json: { authenticated: true, user: member } });
        } else if (path === '/api/v1/member/loans' && request.method() === 'GET') {
          loanReads += 1;
          await route.fulfill({
            json: {
              loans: reportAttempted
                ? [{ ...pendingLoan, closureReportType: 'RETURNED' }]
                : [activeLoan],
            },
          });
        } else if (path === '/api/v1/member/loans/loan-1/closure-report') {
          reportAttempted = true;
          await route.fulfill({ status: 409, json: { error: { message: 'Loan state changed' } } });
        } else await route.fulfill({ status: 404 });
      });

      await page.goto(app.url);
      await page.getByRole('button', { name: 'Report Return or Loss' }).waitFor();
      const readsBeforeConflict = loanReads;
      await page.getByRole('button', { name: 'Report Return or Loss' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Returned' }).click();
      await dialog.getByRole('button', { name: 'Confirm report' }).click();
      await page.getByRole('alert').filter({ hasText: 'no longer active' }).waitFor();
      await page.getByText('Returned', { exact: false }).waitFor();
      await page.getByText(/awaiting librarian review/i).waitFor();
      await assert.rejects(
        page.getByRole('button', { name: 'Report Return or Loss' }).waitFor({ timeout: 150 }),
      );
      assert.ok(
        loanReads >= readsBeforeConflict + 1,
        'a conflict triggers a fresh member loan-list read',
      );
      await page.close();
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      await app.close();
    }
  },
);

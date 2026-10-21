import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const client = new URL('../../apps/client/', import.meta.url);

async function page(name) {
  return readFile(new URL(name, client), 'utf8');
}

test('static auth forms submit natively to configured API endpoints without scripts', async () => {
  const login = await page('login.html');
  assert.match(login, /<form method="post" action="%VITE_API_ORIGIN%\/api\/v1\/auth\/login"/);
  assert.match(login, /name="accountType" value="MEMBER"/);
  assert.match(login, /name="accountType" value="LIBRARIAN"/);
  assert.match(login, /name="email"/);
  assert.match(login, /name="password"/);
  assert.doesNotMatch(login, /<script\b/i);

  const register = await page('register.html');
  assert.equal((register.match(/<form method="post"/g) ?? []).length, 2);
  assert.match(register, /name="accountType" value="MEMBER"/);
  assert.match(register, /name="accountType" value="LIBRARIAN"/);
  assert.match(register, /name="employeeId"/);
  assert.doesNotMatch(register, /<script\b/i);

  for (const statusPage of [
    'login-registered-member.html', 'login-registered-librarian.html',
    'login-invalid.html', 'login-disabled.html', 'register-invalid.html',
  ]) {
    assert.doesNotMatch(await page(statusPage), /<script\b/i);
  }
  assert.match(await page('login-invalid.html'), /Email or password is incorrect\./);
});

test('inactive member login has a static disabled-account page in the Vite build', async () => {
  const disabled = await page('login-disabled.html');
  assert.match(disabled, /account is disabled/i);
  assert.match(disabled, /<a\b[^>]*href="\/login\.html"[^>]*>/i);
  assert.doesNotMatch(disabled, /<script\b/i);

  const viteConfig = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8');
  assert.match(viteConfig, /loginDisabled\s*:\s*resolve\(clientDirectory,\s*'login-disabled\.html'\)/);
});

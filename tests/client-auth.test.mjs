import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../dist/apps/client/src/auth/AuthContext.js';
import { ProtectedRoute } from '../dist/apps/client/src/auth/ProtectedRoute.js';
import { LoginPage } from '../dist/apps/client/src/pages/LoginPage.js';
import { RegisterPage } from '../dist/apps/client/src/pages/RegisterPage.js';

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

test('login page requires the user to select a member or librarian account', () => {
  const markup = render(React.createElement(LoginPage));
  assert.match(markup, /name="accountType"/);
  assert.match(markup, /value="MEMBER"/);
  assert.match(markup, /value="LIBRARIAN"/);
  assert.match(markup, /type="email"/);
  assert.match(markup, /type="password"/);
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

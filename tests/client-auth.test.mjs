import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../dist/apps/client/src/auth/AuthContext.js';
import { ProtectedRoute } from '../dist/apps/client/src/auth/ProtectedRoute.js';
import {
  dashboardPathFor,
  postLoginPathFor,
} from '../dist/apps/client/src/auth/dashboard-routing.js';
import { LoginPage } from '../dist/apps/client/src/pages/LoginPage.js';
import { RegisterPage } from '../dist/apps/client/src/pages/RegisterPage.js';

const signedOut = {
  user: null,
  loading: false,
  login: async () => {},
  register: async () => ({
    userId: '',
    name: '',
    email: '',
    accountType: 'MEMBER',
    accountStatus: 'ACTIVE',
  }),
  logout: async () => {},
};

function render(element, auth = signedOut) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AuthContext.Provider, { value: auth }, element),
    ),
  );
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
    user: {
      userId: 'u-1',
      name: 'Member',
      email: 'member@example.test',
      accountType: 'MEMBER',
      accountStatus: 'ACTIVE',
    },
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
  const memberDashboard = React.createElement(
    ProtectedRoute,
    { accountType: 'MEMBER' },
    React.createElement('p', null, 'Member dashboard content'),
  );
  const librarianDashboard = React.createElement(
    ProtectedRoute,
    { accountType: 'LIBRARIAN' },
    React.createElement('p', null, 'Librarian dashboard content'),
  );
  const member = {
    ...signedOut,
    user: {
      userId: 'm-1',
      name: 'Member',
      email: 'member@example.test',
      accountType: 'MEMBER',
      accountStatus: 'ACTIVE',
    },
  };
  const librarian = {
    ...signedOut,
    user: {
      userId: 'l-1',
      name: 'Librarian',
      email: 'librarian@example.test',
      accountType: 'LIBRARIAN',
      accountStatus: 'ACTIVE',
    },
  };

  assert.match(render(memberDashboard, member), /Member dashboard content/);
  assert.doesNotMatch(render(librarianDashboard, member), /Librarian dashboard content/);
  assert.match(render(librarianDashboard, librarian), /Librarian dashboard content/);
  assert.doesNotMatch(render(memberDashboard, librarian), /Member dashboard content/);
  assert.doesNotMatch(render(memberDashboard), /Member dashboard content/);
});

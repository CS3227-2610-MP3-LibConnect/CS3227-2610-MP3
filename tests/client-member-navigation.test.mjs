import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../dist/apps/client/src/App.js';
import { AuthContext } from '../dist/apps/client/src/auth/AuthContext.js';

function renderDashboard(accountType, path) {
  const user = {
    userId: `user-${accountType.toLowerCase()}`,
    name: accountType === 'MEMBER' ? 'Member One' : 'Librarian One',
    email: `${accountType.toLowerCase()}@example.test`,
    accountType,
    accountStatus: 'ACTIVE',
  };
  const auth = {
    user,
    loading: false,
    login: async () => user,
    register: async () => user,
    logout: async () => {},
  };

  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(AuthContext.Provider, { value: auth }, React.createElement(App))));
}

test('member dashboard has a semantic reusable navigation bar with brand and active Dashboard destination', () => {
  const markup = renderDashboard('MEMBER', '/member/dashboard');

  assert.match(markup, /<nav\b[^>]*aria-label="(?:Member )?main navigation"/i);
  assert.match(markup, /<a\b[^>]*href="\/member\/dashboard"[^>]*aria-label="LibConnect home"/);
  assert.match(markup, /<a\b[^>]*href="\/member\/dashboard"[^>]*aria-current="page"[^>]*>Dashboard<\/a>/);
});

test('member navigation disables the profile control and places Logout immediately after it', () => {
  const markup = renderDashboard('MEMBER', '/member/dashboard');
  const profileIndex = markup.indexOf('aria-label="Profile"');
  const logoutIndex = markup.indexOf('>Logout</button>');

  assert.ok(profileIndex >= 0, 'profile control should have an accessible name');
  assert.match(markup.slice(profileIndex - 50, profileIndex + 100), /<button\b[^>]*disabled/);
  assert.ok(logoutIndex > profileIndex, 'Logout should follow Profile in keyboard order');
  assert.match(markup.slice(profileIndex, logoutIndex + '>Logout</button>'.length), /<\/button>\s*<button\b[^>]*>Logout<\/button>/);
});

test('member dashboard shows its member navigation while librarian dashboard keeps the existing welcome and sign-out behavior', () => {
  const memberMarkup = renderDashboard('MEMBER', '/member/dashboard');
  const librarianMarkup = renderDashboard('LIBRARIAN', '/librarian/dashboard');

  assert.match(memberMarkup, /aria-label="(?:Member )?main navigation"/i);
  assert.match(memberMarkup, /Welcome back, Member One/);
  assert.match(librarianMarkup, /Welcome, Librarian One/);
  assert.match(librarianMarkup, />Sign out<\/button>/);
  assert.doesNotMatch(librarianMarkup, /aria-label="(?:Member )?main navigation"/i);
});

test('member navigation exposes native keyboard-operable links and buttons with disabled controls marked disabled', () => {
  const markup = renderDashboard('MEMBER', '/member/dashboard');

  assert.match(markup, /<a\b[^>]*>Dashboard<\/a>/);
  assert.match(markup, /<button\b[^>]*disabled[^>]*>Profile<\/button>/);
  assert.match(markup, /<button\b[^>]*>Logout<\/button>/);
});

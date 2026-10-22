import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../dist/apps/client/src/App.js';
import { AuthContext } from '../../dist/apps/client/src/auth/AuthContext.js';

function renderDashboard(accountType, path) {
  const user = accountType ? {
    userId: `user-${accountType.toLowerCase()}`,
    name: accountType === 'MEMBER' ? 'Member One' : 'Librarian One',
    email: `${accountType.toLowerCase()}@example.test`,
    accountType,
    accountStatus: 'ACTIVE',
  } : null;
  const auth = {
    user,
    loading: false,
    login: async () => user,
    register: async () => user,
    logout: async () => {},
    updateUser: () => {},
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

test('member navigation exposes a keyboard-operable Profile link before Logout', () => {
  const markup = renderDashboard('MEMBER', '/member/dashboard');
  const profileIndex = markup.indexOf('aria-label="Profile"');
  const logoutIndex = markup.indexOf('>Logout</button>');

  assert.ok(profileIndex >= 0, 'profile control should have an accessible name');
  assert.match(markup.slice(profileIndex - 50, profileIndex + 120), /<a\b[^>]*href="\/member\/profile"[^>]*aria-label="Profile"/);
  assert.ok(logoutIndex > profileIndex, 'Logout should follow Profile in keyboard order');
  assert.match(markup.slice(profileIndex, logoutIndex + '>Logout</button>'.length), /<\/a>\s*<button\b[^>]*>Logout<\/button>/);
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

test('member navigation exposes native keyboard-operable links and buttons', () => {
  const markup = renderDashboard('MEMBER', '/member/dashboard');

  assert.match(markup, /<a\b[^>]*>Dashboard<\/a>/);
  assert.match(markup, /<a\b[^>]*href="\/member\/profile"[^>]*>Profile<\/a>/);
  assert.match(markup, /<button\b[^>]*>Logout<\/button>/);
});

test('profile page is member-only and renders all three labeled update forms together', () => {
  const memberMarkup = renderDashboard('MEMBER', '/member/profile');
  const librarianMarkup = renderDashboard('LIBRARIAN', '/member/profile');
  const signedOutMarkup = renderDashboard(null, '/member/profile');
  const forms = [...memberMarkup.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(([markup]) => markup);

  assert.match(memberMarkup, /<h1[^>]*>Profile<\/h1>/);
  assert.equal(forms.length, 3, 'name, email, and password forms should be rendered together');
  assert.match(forms[0], /<label\b[^>]*>\s*<span>Name<\/span>[\s\S]*name="name"/);
  assert.match(forms[1], /<label\b[^>]*>\s*<span>Email address<\/span>[\s\S]*name="email"/);
  assert.match(forms[2], /<label\b[^>]*>\s*<span>Current password<\/span>[\s\S]*name="currentPassword"/);
  assert.match(forms[2], /<label\b[^>]*>\s*<span>New password<\/span>[\s\S]*name="newPassword"/);
  assert.match(forms[2], /<label\b[^>]*>\s*<span>Confirm new password<\/span>[\s\S]*name="confirmPassword"/);
  assert.match(memberMarkup, /value="Member One"/);
  assert.match(memberMarkup, /value="member@example.test"/);
  assert.doesNotMatch(memberMarkup, /\shidden(?:="")?/);
  assert.doesNotMatch(memberMarkup, /role="tablist"|role="tab"|role="tabpanel"/);
  assert.match(memberMarkup, /aria-label="Member main navigation"/);
  assert.doesNotMatch(librarianMarkup, /name="currentPassword"|Save name/);
  assert.doesNotMatch(signedOutMarkup, /name="currentPassword"|Save name/);
});

test('Profile navigation identifies the current page on the member profile route', () => {
  const markup = renderDashboard('MEMBER', '/member/profile');
  assert.match(markup, /<a\b[^>]*href="\/member\/profile"[^>]*aria-current="page"[^>]*>Profile<\/a>/);
});

test('member profile hub exposes four accessible native subpage links and selects Profile on entry', () => {
  const markup = renderDashboard('MEMBER', '/member/profile');
  for (const label of ['Profile', 'My Loans', 'My Reservations', 'My Fines']) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(markup, new RegExp(`<a\\b[^>]*href="/member/[^" ]+"[^>]*>\\s*${escapedLabel}\\s*<\\/a>`), `${label} should be a native keyboard-operable link with a member destination`);
  }
  assert.match(markup, /<a\b[^>]*href="\/member\/profile"[^>]*aria-current="page"[^>]*>Profile<\/a>/, 'Profile should be selected by default');
});

test('My Loans is a member-only profile subpage with Active selected by default and a Past view control', () => {
  const memberMarkup = renderDashboard('MEMBER', '/member/profile/loans');
  const librarianMarkup = renderDashboard('LIBRARIAN', '/member/profile/loans');
  const signedOutMarkup = renderDashboard(null, '/member/profile/loans');

  assert.match(memberMarkup, /<h1[^>]*>My Loans<\/h1>/);
  const loansLink = memberMarkup.match(/<a\b[^>]*href="\/member\/profile\/loans"[^>]*>My Loans<\/a>/)?.[0];
  assert.ok(loansLink, 'My Loans should remain a native profile-hub link');
  assert.match(loansLink, /aria-current="page"/, 'My Loans should be selected on its route');
  assert.match(memberMarkup, /<button\b[^>]*aria-pressed="true"[^>]*>\s*Active\s*<\/button>/);
  assert.match(memberMarkup, /<button\b[^>]*aria-pressed="false"[^>]*>\s*Past\s*<\/button>/);
  for (const markup of [librarianMarkup, signedOutMarkup]) {
    assert.doesNotMatch(markup, /My Loans|member-profile-subnav|loan-view-toggle/);
  }
});

test('My Fines opens the member fines experience inside the profile hub', () => {
  const hub = renderDashboard('MEMBER', '/member/profile');
  assert.match(hub, /href="\/member\/profile\/fines"[^>]*>\s*My Fines\s*<\/a>/);
  const markup = renderDashboard('MEMBER', '/member/profile/fines');
  assert.match(markup, /<h1\b[^>]*>My Fines<\/h1>/);
  assert.match(markup, /aria-label="Fine view"/);
  assert.match(markup, /Outstanding/);
  assert.match(markup, /History/);
  assert.match(markup, /Loading fines/);
  assert.doesNotMatch(markup, /This section is not available yet/);
});

test('profile hub remains member-only for signed-out and librarian users', () => {
  for (const accountType of ['LIBRARIAN', null]) {
    const markup = renderDashboard(accountType, '/member/profile/reservations');
    assert.doesNotMatch(markup, /My Reservations|My Fines|member-profile-subnav/, `${accountType ?? 'signed-out'} users should not render member profile hub content`);
    assert.doesNotMatch(markup, /name="currentPassword"|Save name/, `${accountType ?? 'signed-out'} users should not render member profile forms`);
  }
});

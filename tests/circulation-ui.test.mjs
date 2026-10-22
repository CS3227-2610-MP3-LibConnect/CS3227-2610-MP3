import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../dist/apps/client/src/auth/AuthContext.js';
import { circulationApi } from '../dist/apps/client/src/api/circulation.js';
import { ProtectedRoute } from '../dist/apps/client/src/auth/ProtectedRoute.js';
import { LibrarianCirculationPage } from '../dist/apps/client/src/pages/LibrarianCirculationPage.js';

function render(element, user) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(AuthContext.Provider, { value: { user, loading: false, login: async () => user, register: async () => user, logout: async () => undefined } }, element)));
}

const member = { userId: 'member-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const librarian = { userId: 'librarian-1', name: 'Librarian', email: 'librarian@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', isManager: false };

test('circulation page is protected and exposes accessible review states', () => {
  assert.doesNotMatch(render(React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN' }, React.createElement(LibrarianCirculationPage)), member), /Loans &amp; closure review/);
  const markup = render(React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN' }, React.createElement(LibrarianCirculationPage)), librarian);
  assert.match(markup, /Loans &amp; closure review/);
  assert.match(markup, /Create a loan/);
  assert.match(markup, /Pending reports/);
  assert.match(markup, /Member ID/);
  assert.match(markup, /aria-labelledby="create-loan-title"/);
  assert.match(markup, /aria-label="Circulation navigation"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /type="submit"/);
  assert.doesNotMatch(markup, /isManager|accountType|passwordHash/);
});

test('circulation client sends only approved fields and never a fine override', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ loan: {}, copy: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await circulationApi.createLoan('MEMBER-1', 'copy-1');
    await circulationApi.review('loan-1', 'CONFIRM', 'AVAILABLE');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(JSON.parse(requests[0].init.body), { memberId: 'MEMBER-1', copyId: 'copy-1' });
  assert.deepEqual(JSON.parse(requests[1].init.body), { decision: 'CONFIRM', disposition: 'AVAILABLE' });
  assert.equal('lossFineSgd' in JSON.parse(requests[1].init.body), false);
});

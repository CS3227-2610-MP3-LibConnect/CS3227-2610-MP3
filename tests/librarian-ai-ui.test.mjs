import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../dist/apps/client/src/auth/AuthContext.js';
import { ProtectedRoute } from '../dist/apps/client/src/auth/ProtectedRoute.js';
import { LibrarianAssistantPage } from '../dist/apps/client/src/pages/LibrarianAssistantPage.js';

function render(element, user) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(AuthContext.Provider, { value: { user, loading: false, login: async () => user, register: async () => user, logout: async () => undefined } }, element)));
}

const member = { userId: 'member-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const librarian = { userId: 'librarian-1', name: 'Librarian', email: 'librarian@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', isManager: false };

test('assistant page is librarian-protected and labels advisory text/edit/send boundaries', () => {
  assert.doesNotMatch(render(React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN' }, React.createElement(LibrarianAssistantPage)), member), /Review assistant/);
  const markup = render(React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN' }, React.createElement(LibrarianAssistantPage)), librarian);
  assert.match(markup, /Review assistant/);
  assert.match(markup, /AI-generated summaries and drafts are advisory and untrusted/);
  assert.match(markup, /Pending reports/);
  assert.match(markup, /Loading pending reports/);
  const compiled = readFileSync('dist/apps/client/src/pages/LibrarianAssistantPage.js', 'utf8');
  assert.match(compiled, /Summarize selected reports/);
  assert.match(compiled, /EDIT BEFORE SENDING/);
  assert.match(compiled, /Confirm and send reviewed message/);
  assert.doesNotMatch(markup, /dangerouslySetInnerHTML|passwordHash|SOCLAAS|Firestore/);
});

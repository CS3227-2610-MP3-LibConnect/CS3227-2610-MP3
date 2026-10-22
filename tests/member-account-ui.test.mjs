import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../dist/apps/client/src/auth/AuthContext.js';
import { ProtectedRoute } from '../dist/apps/client/src/auth/ProtectedRoute.js';
import { LibrarianMemberSupportPage, memberStatusChangeDetails, nextMemberStatus } from '../dist/apps/client/src/pages/LibrarianMemberSupportPage.js';

function render(element, user) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(AuthContext.Provider, { value: { user, loading: false, login: async () => user, register: async () => user, logout: async () => undefined } }, element)));
}

test('member-support page is protected for active librarians and excludes members', () => {
  const member = { userId: 'member-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
  const librarian = { userId: 'librarian-1', name: 'Librarian', email: 'librarian@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', isManager: false };
  assert.doesNotMatch(render(React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN' }, React.createElement('p', null, 'Member support content')), member), /Member support content/);
  const markup = render(React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN' }, React.createElement(LibrarianMemberSupportPage)), librarian);
  assert.match(markup, /Member account support/);
  assert.match(markup, /Loading member accounts/);
  assert.match(markup, /Account status/);
});

test('member-support actions require explicit target/status confirmation and map transitions', () => {
  assert.equal(nextMemberStatus('ACTIVE'), 'INACTIVE');
  assert.equal(nextMemberStatus('INACTIVE'), 'ACTIVE');
  const deactivate = memberStatusChangeDetails({ name: 'A. Member', accountStatus: 'ACTIVE' });
  assert.match(deactivate.confirmationMessage, /deactivate A\. Member's member account/);
  assert.match(deactivate.confirmationMessage, /Inactive/);
  assert.match(deactivate.successMessage, /now Inactive/);
  const activate = memberStatusChangeDetails({ name: 'A. Member', accountStatus: 'INACTIVE' });
  assert.match(activate.confirmationMessage, /activate A\. Member's member account/);
  assert.match(activate.successMessage, /now Active/);
});

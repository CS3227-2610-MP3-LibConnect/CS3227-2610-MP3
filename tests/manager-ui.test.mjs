import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../dist/apps/client/src/auth/AuthContext.js';
import { ProtectedRoute } from '../dist/apps/client/src/auth/ProtectedRoute.js';
import { ManagerLibrarianAccountsPage } from '../dist/apps/client/src/pages/ManagerLibrarianAccountsPage.js';
import { isSelfDeactivation, nextAccountStatus, statusChangeDetails } from '../dist/apps/client/src/pages/manager-account-actions.js';

function render(element, user) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(AuthContext.Provider, { value: {
      user, loading: false, login: async () => user, register: async () => user, logout: async () => undefined,
    } }, element)));
}

test('manager page is protected by the server-backed manager flag', () => {
  const member = { userId: 'member-1', name: 'Member', email: 'member@example.test', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
  const manager = { userId: 'manager-1', name: 'Manager', email: 'manager@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', isManager: true };
  assert.doesNotMatch(render(React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN', managerOnly: true }, React.createElement('p', null, 'Manager content')), member), /Manager content/);
  assert.match(render(React.createElement(ProtectedRoute, { accountType: 'LIBRARIAN', managerOnly: true }, React.createElement('p', null, 'Manager content')), manager), /Manager content/);
});

test('manager page contains account-management labels and safe navigation', () => {
  const manager = { userId: 'manager-1', name: 'Manager', email: 'manager@example.test', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', isManager: true };
  const markup = render(React.createElement(ManagerLibrarianAccountsPage), manager);
  assert.match(markup, /Librarian accounts/);
  assert.match(markup, /Activate new librarians and deactivate accounts/);
  assert.match(markup, /Dashboard/);
});

test('manager account actions describe the correct transition and self-deactivation behavior', () => {
  const active = statusChangeDetails({ accountStatus: 'ACTIVE', name: 'A. Librarian' });
  const inactive = statusChangeDetails({ accountStatus: 'INACTIVE', name: 'A. Librarian' });
  assert.equal(nextAccountStatus('ACTIVE'), 'INACTIVE');
  assert.equal(nextAccountStatus('INACTIVE'), 'ACTIVE');
  assert.equal(active.nextStatus, 'INACTIVE');
  assert.match(active.confirmationMessage, /deactivate account for A\. Librarian/);
  assert.match(active.confirmationMessage, /Inactive/);
  assert.equal(inactive.nextStatus, 'ACTIVE');
  assert.match(inactive.successMessage, /now Active/);
  assert.equal(isSelfDeactivation('manager-1', 'manager-1', 'INACTIVE'), true);
  assert.equal(isSelfDeactivation('manager-1', 'manager-2', 'INACTIVE'), false);
  assert.equal(isSelfDeactivation('manager-1', 'manager-1', 'ACTIVE'), false);
});

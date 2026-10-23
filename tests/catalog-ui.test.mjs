import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../dist/apps/client/src/auth/AuthContext.js';
import { catalogApi } from '../dist/apps/client/src/api/catalog.js';
import { ProtectedRoute } from '../dist/apps/client/src/auth/ProtectedRoute.js';
import {
  LibrarianCatalogInventoryPage,
  bookFormValues,
  validateBookForm,
} from '../dist/apps/client/src/pages/LibrarianCatalogInventoryPage.js';

function render(element, user) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        AuthContext.Provider,
        {
          value: {
            user,
            loading: false,
            login: async () => user,
            register: async () => user,
            logout: async () => undefined,
          },
        },
        element,
      ),
    ),
  );
}

const member = {
  userId: 'member-1',
  name: 'Member',
  email: 'member@example.test',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
};
const librarian = {
  userId: 'librarian-1',
  name: 'Librarian',
  email: 'librarian@example.test',
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
  isManager: false,
};

test('catalog page is protected by the librarian account type', () => {
  assert.doesNotMatch(
    render(
      React.createElement(
        ProtectedRoute,
        { accountType: 'LIBRARIAN' },
        React.createElement(LibrarianCatalogInventoryPage),
      ),
      member,
    ),
    /Catalog &amp; inventory/,
  );
  assert.match(
    render(
      React.createElement(
        ProtectedRoute,
        { accountType: 'LIBRARIAN' },
        React.createElement(LibrarianCatalogInventoryPage),
      ),
      librarian,
    ),
    /Catalog &amp; inventory/,
  );
});

test('catalog page exposes accessible search and mutation entry points without a status editor', () => {
  const markup = render(React.createElement(LibrarianCatalogInventoryPage), librarian);
  assert.match(markup, /Catalog &amp; inventory/);
  assert.match(markup, /Search catalog/);
  assert.match(markup, /Add a book/);
  assert.doesNotMatch(markup, /name="status"/);
});

test('book form validation enforces required fields and approved year bounds', () => {
  const errors = validateBookForm(
    {
      isbn: '',
      title: '',
      author: '',
      publicationYear: 10000,
      publisher: '',
      category: '',
      synopsis: '',
    },
    false,
  );
  assert.match(errors.isbn, /required/);
  assert.match(errors.title, /required/);
  assert.match(errors.publicationYear, /0 to 9999/);
  assert.equal(
    Object.keys(
      validateBookForm(
        {
          isbn: '978-1',
          title: 'Book',
          author: 'Author',
          publicationYear: 0,
          publisher: 'Publisher',
          category: 'Category',
          synopsis: '',
        },
        false,
      ),
    ).length,
    0,
  );
});

test('edit form values exclude server-managed book fields', () => {
  const values = bookFormValues({
    isbn: '978-1',
    title: 'Book',
    author: ['Ann', 'Ben'],
    publicationYear: 2026,
    publisher: 'Publisher',
    category: 'Category',
    synopsis: 'Text',
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
  });
  assert.deepEqual(values, {
    isbn: '978-1',
    title: 'Book',
    author: 'Ann, Ben',
    publicationYear: 2026,
    publisher: 'Publisher',
    category: 'Category',
    synopsis: 'Text',
  });
});

test('catalog mutation clients send only approved metadata fields', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ isbn: '978-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await catalogApi.createBook({
      isbn: '978-1',
      title: 'Book',
      author: 'Author',
      publicationYear: 2026,
      publisher: 'Publisher',
      category: 'Category',
      synopsis: '',
    });
    await catalogApi.updateBook('978-1', { title: 'Updated' });
    await catalogApi.createCopy('978-1', 'SHELF-1');
    await catalogApi.updateCopy('copy-1', 'SHELF-2');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    isbn: '978-1',
    title: 'Book',
    author: 'Author',
    publicationYear: 2026,
    publisher: 'Publisher',
    category: 'Category',
    synopsis: '',
  });
  assert.deepEqual(JSON.parse(requests[1].init.body), { title: 'Updated' });
  assert.deepEqual(JSON.parse(requests[2].init.body), { shelfLocation: 'SHELF-1' });
  assert.deepEqual(JSON.parse(requests[3].init.body), { shelfLocation: 'SHELF-2' });
});

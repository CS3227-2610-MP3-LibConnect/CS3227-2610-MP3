import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../dist/apps/client/src/App.js';
import { AuthContext } from '../../dist/apps/client/src/auth/AuthContext.js';
import { buildMemberBookFilters } from '../../dist/apps/client/src/pages/MemberDashboard.js';
import { readFile } from 'node:fs/promises';

const user = {
  userId: 'member-1', name: 'Member One', email: 'member@example.test',
  accountType: 'MEMBER', accountStatus: 'ACTIVE',
};
const auth = {
  user, loading: false, login: async () => user, register: async () => user, logout: async () => {},
};

function renderMemberDashboard() {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/member/dashboard'] },
    React.createElement(AuthContext.Provider, { value: auth }, React.createElement(App))));
}

test('member dashboard greets the signed-in member and exposes basic and advanced search controls', () => {
  const markup = renderMemberDashboard();
  assert.match(markup, /Welcome back, Member One/);
  assert.match(markup, /<form[^>]*aria-label="Search the catalog"/);
  for (const name of ['title', 'author', 'publisher', 'category', 'isbn', 'publicationYear', 'publicationYearFrom', 'publicationYearTo']) {
    assert.match(markup, new RegExp(`name="${name}"`));
  }
  assert.match(markup, />Search<\/button>/);
  assert.match(markup, />Clear filters<\/button>/);
});

test('member filter builder trims text and combines all selected criteria in one API filter object', () => {
  assert.deepEqual(buildMemberBookFilters({
    title: '  systems ', author: ' Ada ', publisher: ' Press ', category: ' Computing ', isbn: ' 9780001 ', publicationYear: '2024',
    publicationYearFrom: '', publicationYearTo: '',
  }), {
    title: 'systems', author: 'Ada', publisher: 'Press', category: 'Computing', isbn: '9780001', publicationYear: 2024,
  });
});

test('member filter builder supports inclusive year ranges and rejects partial, reversed, invalid, or mixed year filters', () => {
  assert.deepEqual(buildMemberBookFilters({ publicationYearFrom: '2000', publicationYearTo: '2020' }), {
    publicationYearFrom: 2000, publicationYearTo: 2020,
  });
  assert.throws(() => buildMemberBookFilters({ publicationYearFrom: '2000' }), /both/);
  assert.throws(() => buildMemberBookFilters({ publicationYearFrom: '2021', publicationYearTo: '2020' }), /cannot exceed/);
  assert.throws(() => buildMemberBookFilters({ publicationYear: '20x0' }), /valid year/);
  assert.throws(() => buildMemberBookFilters({ publicationYear: '2020', publicationYearFrom: '2000', publicationYearTo: '2022' }), /either exact year or a range/);
});

test('collapsed advanced search submits the title alone and ignores retained invalid advanced values', () => {
  assert.deepEqual(buildMemberBookFilters({
    title: '  systems ', author: ' Ada ', publisher: ' Press ', category: ' Computing ', isbn: ' 9780001 ',
    publicationYear: '', publicationYearFrom: 'not-a-year', publicationYearTo: '',
  }, { advancedSearchExpanded: false }), { title: 'systems' });
});

test('expanded advanced search submits the title with advanced criteria and still validates year ranges', () => {
  assert.deepEqual(buildMemberBookFilters({
    title: '  systems ', author: ' Ada ', publisher: '', category: ' Computing ', isbn: '',
    publicationYear: '', publicationYearFrom: '2000', publicationYearTo: '2020',
  }, { advancedSearchExpanded: true }), {
    title: 'systems', author: 'Ada', category: 'Computing', publicationYearFrom: 2000, publicationYearTo: 2020,
  });
  assert.throws(() => buildMemberBookFilters({
    title: 'systems', publicationYearFrom: '2021', publicationYearTo: '2020',
  }, { advancedSearchExpanded: true }), /cannot exceed/);
});

test('collapsing advanced search after an expanded submission makes the next submission title-only', async () => {
  const source = await readFile(new URL('../../apps/client/src/pages/MemberDashboard.tsx', import.meta.url), 'utf8');
  const submitSearch = source.match(/const submitSearch\s*=\s*\(event:[\s\S]*?\n  \};/)?.[0] ?? '';

  assert.match(source, /<details\b[^>]*ref=\{advancedSearchRef\}/,
    'the live advanced-search details element should be connected to the ref');
  assert.match(submitSearch, /advancedSearchExpanded:\s*advancedSearchRef\.current\?\.open\s*\?\?\s*false/,
    'each submission should read the details element open state instead of a cached expansion value');

  const retainedValues = {
    title: '  systems ', author: ' Ada ', publisher: ' Press ', category: ' Computing ', isbn: ' 9780001 ',
    publicationYear: '', publicationYearFrom: '2000', publicationYearTo: '2020',
  };
  const expandedSubmission = buildMemberBookFilters(retainedValues, { advancedSearchExpanded: true });
  const collapsedSubmission = buildMemberBookFilters(retainedValues, { advancedSearchExpanded: false });

  assert.deepEqual(expandedSubmission, {
    title: 'systems', author: 'Ada', publisher: 'Press', category: 'Computing', isbn: '9780001',
    publicationYearFrom: 2000, publicationYearTo: 2020,
  });
  assert.deepEqual(collapsedSubmission, { title: 'systems' },
    'retained advanced values should be omitted when the next submission sees the collapsed panel');
});

test('submitting or clearing search resets the current page and requests results without a stale cursor', async () => {
  const source = await readFile(new URL('../../apps/client/src/pages/MemberDashboard.tsx', import.meta.url), 'utf8');
  assert.match(source, /const submitSearch\s*=\s*\(event:[\s\S]*?setSubmittedFilters\(filters\);\s*void loadFirstPage\(filters\);/);
  assert.match(source, /const clearSearch\s*=\s*\(\)\s*=>\s*\{[\s\S]*?setSubmittedFilters\(\{\}\);\s*void loadFirstPage\(\{\}\);/);
  assert.match(source, /const loadFirstPage\s*=\s*async \(filters: BookFilters\)\s*=>\s*\{[\s\S]*?setPage\(null\);[\s\S]*?catalogApi\.listBooks\(filters\)/);
  assert.doesNotMatch(source.match(/const loadFirstPage[\s\S]*?\n  \};/)?.[0] ?? '', /cursor\s*:/);
});

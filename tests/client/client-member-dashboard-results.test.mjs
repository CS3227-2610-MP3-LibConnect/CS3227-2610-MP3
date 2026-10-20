import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const dashboardSource = await readFile(new URL('../../apps/client/src/pages/MemberDashboard.tsx', import.meta.url), 'utf8');

test('member dashboard renders accessible catalog cards with required fields and detail navigation', () => {
  assert.match(dashboardSource, /cover placeholder|book cover|cover art/i, 'cards should identify a local cover placeholder');
  assert.match(dashboardSource, /shortened|line-clamp|synopsis/i, 'cards should show a shortened synopsis');
  assert.match(dashboardSource, /category/i, 'cards should show the book category');
  assert.match(dashboardSource, /useNavigate|<Link\b|<a\b/, 'cards should navigate to the matching book detail page');
  assert.match(dashboardSource, /tabIndex|onKeyDown|role="link"|<Link\b/, 'card navigation should be keyboard accessible');
  assert.match(dashboardSource, /isbn/, 'the detail destination should identify the selected book by ISBN');
  assert.doesNotMatch(dashboardSource, /synopsis\s*:/, 'synopsis must not be sent as a catalog search filter');
});

test('member dashboard loads further pages with the returned cursor and the same submitted filters', () => {
  assert.match(dashboardSource, /nextCursor/, 'the next-page action should use the server-returned cursor');
  assert.match(dashboardSource, /listBooks\s*\(/, 'pages should load through the catalog API');
  assert.match(dashboardSource, /cursor\s*:/, 'the next-page request should include a cursor');
  assert.match(dashboardSource, /submittedFilters|activeFilters|appliedFilters/, 'the current filters should be retained for pagination');
  assert.match(dashboardSource, /\.\.\.(?:\s*(?:page|current)\.)?items|concat\s*\(/, 'later pages should be appended to existing results');
  assert.match(dashboardSource, /isbn|book\.isbn/, 'catalog results should be keyed or reconciled by book identity to avoid duplicates');
});

test('member dashboard distinguishes loading, retryable failure, empty results, and the end of results', () => {
  assert.match(dashboardSource, /aria-busy|Loading catalog|Loading books|Searching catalog/i, 'loading should be communicated accessibly');
  assert.match(dashboardSource, /retry|Try again/i, 'API failures should offer retry');
  assert.match(dashboardSource, /No books|No results|no catalog results|empty/i, 'an empty result set should be communicated');
  assert.match(dashboardSource, /end of results|all books|no more books|nextCursor\s*(?:===|==)\s*null/i, 'the end of the result set should be communicated');
});

test('catalog listing has no availability-only filter', () => {
  assert.match(dashboardSource, /catalogApi\.listBooks/, 'the dashboard should use the catalog list endpoint');
  assert.doesNotMatch(dashboardSource, /availableOnly|availabilityOnly|status\s*:\s*['"]AVAILABLE['"]|copiesAvailable\s*>\s*0/i,
    'the catalog list must include titles without available copies');
});

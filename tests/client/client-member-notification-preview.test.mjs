import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const dashboardSource = await readFile(new URL('../../apps/client/src/pages/MemberDashboard.tsx', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../../apps/client/src/styles.css', import.meta.url), 'utf8');

test('notification preview is placed between the welcome heading and catalog search', () => {
  const welcome = dashboardSource.indexOf('Welcome back, {user.name}');
  const notifications = dashboardSource.indexOf('Notifications');
  const catalogSearch = dashboardSource.indexOf('aria-label="Search the catalog"');
  assert.ok(welcome >= 0 && notifications > welcome && catalogSearch > notifications,
    'the notification section should follow the welcome heading and precede catalog search');
});

test('dashboard renders the server-selected preview in returned order with type and truncated message', () => {
  assert.match(dashboardSource, /notificationsApi\.getPreview\s*\(/, 'load the server-provided preview');
  assert.match(dashboardSource, /(?:preview|notificationPreview)\.items\.map\s*\(/,
    'render the server-selected items in their existing order');
  assert.match(dashboardSource, /notificationType/, 'each card should show its notification type');
  assert.match(dashboardSource, /message/, 'each card should show its message preview');
  assert.match(dashboardSource, /line-clamp|text-overflow\s*:\s*ellipsis|\.\.\./,
    'long preview messages should be visibly truncated with an ellipsis');
  assert.doesNotMatch(dashboardSource, /(?:preview|notificationPreview)\.items\.(?:sort|filter)\s*\(/,
    'the client should preserve the server selection and newest-first order');
});

test('preview visibly distinguishes read and unread cards', () => {
  assert.match(dashboardSource, /notification\.read/, 'card styling should depend on authoritative read state');
  assert.match(dashboardSource, /member-notification[^\n]*(?:read|unread)|(?:read|unread)[^\n]*member-notification/i,
    'read state should select distinct card styles');
  assert.match(stylesSource, /member-notification[^{}]*\{[^}]*\}/s, 'notification cards should have dedicated styles');
  assert.match(stylesSource, /member-notification[^{}]*(?:unread|read)|(?:unread|read)[^{}]*member-notification/is,
    'read and unread states should have distinct style rules');
});

test('preview loading, empty, and retryable error states are independent from catalog search', () => {
  assert.match(dashboardSource, /notificationLoading|previewLoading/, 'show notification loading state');
  assert.match(dashboardSource, /No notifications|no notifications/i, 'show an empty state');
  assert.match(dashboardSource, /notificationError|previewError/, 'track notification errors separately');
  assert.match(dashboardSource, /Try again|Retry/i, 'allow retry after a preview failure');
  assert.match(dashboardSource, /notificationsApi\.getPreview\s*\(/, 'retry should reload the notification preview');
  assert.match(dashboardSource, /searchError/, 'catalog errors retain their own state');
  assert.match(dashboardSource, /initialLoading/, 'catalog loading retains its own state');
});

test('notification messages are rendered as literal React text', () => {
  assert.match(dashboardSource, /\{notification\.message\}/, 'render the message as a text child');
  assert.doesNotMatch(dashboardSource, /dangerouslySetInnerHTML/, 'do not interpret message content as markup');
});

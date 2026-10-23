import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  notificationTypeLabel,
  referenceTypeLabel,
} from '../../dist/apps/client/src/pages/MemberDashboard.js';

const dashboardSource = await readFile(
  new URL('../../apps/client/src/pages/MemberDashboard.tsx', import.meta.url),
  'utf8',
);

test('dashboard offers a full-history dialog with bounded, append-only paging', () => {
  assert.match(dashboardSource, /View All Notifications/i, 'the preview should open full history');
  assert.match(
    dashboardSource,
    /role=["']dialog["']|<dialog\b/i,
    'history should be presented in a dialog',
  );
  assert.match(
    dashboardSource,
    /notificationsApi\.list\s*\(/,
    'history pages should use the notifications API',
  );
  assert.match(
    dashboardSource,
    /nextCursor/,
    'history should follow the server continuation cursor',
  );
  assert.match(dashboardSource, /limit\s*:/, 'history requests should remain bounded');
  assert.match(
    dashboardSource,
    /scroll|IntersectionObserver/i,
    'additional pages should load as the history is scrolled',
  );
  assert.match(
    dashboardSource,
    /\.\.\.\s*(?:current\.)?items|concat\s*\(/,
    'later pages should append to history already displayed',
  );
  assert.match(
    dashboardSource,
    /pageLoading|historyLoading|loadingMoreNotifications/i,
    'page requests should have a loading state',
  );
  assert.match(
    dashboardSource,
    /pageInFlight|historyRequestInFlight|loadingMoreRef|pageRequestRef/i,
    'duplicate concurrent page requests should be prevented',
  );
});

test('a notification can open a detail dialog with complete message and informational metadata', () => {
  assert.match(
    dashboardSource,
    /role=["']dialog["']|<dialog\b/i,
    'notification details should use a dialog',
  );
  assert.match(
    dashboardSource,
    /notificationsApi\.get\s*\(/,
    'detail should be retrieved through the notification API',
  );
  assert.match(
    dashboardSource,
    /notification\.message/,
    'details should show the complete message',
  );
  assert.match(dashboardSource, /notification\.notificationType/, 'details should show the type');
  assert.match(dashboardSource, /notification\.createdAt/, 'details should show the creation time');
  assert.match(
    dashboardSource,
    /notification\.referenceType/,
    'details should show an optional reference type',
  );
  assert.match(
    dashboardSource,
    /notification\.referenceId/,
    'details should show an optional reference ID',
  );
  assert.match(
    dashboardSource,
    /onClick|onKeyDown/,
    'notifications should be openable by pointer and keyboard',
  );
});

test('opening unread items marks them read only after confirmation and synchronizes visible copies', () => {
  assert.match(
    dashboardSource,
    /notificationsApi\.markRead\s*\(/,
    'opening an unread item should request a read update',
  );
  assert.match(
    dashboardSource,
    /if\s*\([^)]*\.read[^)]*\)/,
    'read items should skip the read-state write',
  );
  assert.match(
    dashboardSource,
    /await\s+notificationsApi\.markRead/,
    'local read state should wait for API confirmation',
  );
  assert.match(
    dashboardSource,
    /notificationPreview|historyItems|notificationHistory/i,
    'preview and history copies should be represented in state',
  );
  assert.match(
    dashboardSource,
    /notificationId/,
    'read-state synchronization should match notification identity',
  );
  assert.match(
    dashboardSource,
    /readRequestInFlight|readInFlight|markReadInFlight|readRequestsRef/i,
    'duplicate concurrent read updates should be prevented',
  );
  assert.match(
    dashboardSource,
    /catch[\s\S]{0,500}(?:unread|read update|mark.*read|retry)/i,
    'a failed read update should retain unread state and expose retry feedback',
  );
});

test('dialogs are accessible and closing them does not itself mark notifications read', () => {
  assert.match(dashboardSource, /aria-labelledby/, 'dialogs should have accessible headings');
  assert.match(dashboardSource, /Escape|onKeyDown/i, 'dialogs should support keyboard dismissal');
  assert.match(dashboardSource, /focus|autoFocus|tabIndex/i, 'dialog focus should be handled');
  assert.match(
    dashboardSource,
    /aria-live|role=["']status["']|role=["']alert["']/,
    'loading and failures should be announced',
  );
  assert.match(
    dashboardSource,
    /notificationsApi\.markRead\s*\(/,
    'read updates should be tied to opening a notification',
  );
  assert.match(
    dashboardSource,
    /onClick=\{[^}]*close|close.*Dialog|set.*Dialog\(false\)/i,
    'dialogs should be closable independently of opening an item',
  );
});

test('history and detail dialogs expose loading, empty, error, and retry states', () => {
  assert.match(
    dashboardSource,
    /Loading notification history/i,
    'history loading should be announced',
  );
  assert.match(
    dashboardSource,
    /historyItems\.length\s*===\s*0[\s\S]{0,100}No notifications/i,
    'an empty history should have an explicit empty state',
  );
  assert.match(
    dashboardSource,
    /historyError[\s\S]{0,400}Try again/i,
    'failed history requests should expose retry',
  );
  assert.match(
    dashboardSource,
    /loadHistoryPage\(historyCursor\s*\?\?\s*undefined\)/,
    'retry should request the failed cursor page',
  );
  assert.match(dashboardSource, /Loading notification…/i, 'detail loading should be announced');
  assert.match(
    dashboardSource,
    /detailError[\s\S]{0,450}Try again/i,
    'failed detail requests should expose retry',
  );
  assert.match(
    dashboardSource,
    /openNotificationDetail\(detailNotificationId\)/,
    'detail retry should fetch the selected notification again',
  );
});

test('read confirmation synchronizes preview and history copies, while message markup remains literal text', () => {
  assert.match(
    dashboardSource,
    /const syncNotification\s*=\s*\(notification:\s*NotificationRecord\)\s*=>\s*\{[\s\S]*?setNotificationPreview\([\s\S]*?notificationId[\s\S]*?\?\s*notification[\s\S]*?\);[\s\S]*?setHistoryItems\([\s\S]*?notificationId[\s\S]*?\?\s*notification[\s\S]*?\);[\s\S]*?\};/,
    'a confirmed read update should replace the matching preview record',
  );
  assert.match(
    dashboardSource,
    /const readNotification\s*=\s*\{\s*\.\.\.notification,\s*read:\s*true\s*\};[\s\S]{0,200}syncNotification\(readNotification\)/,
    'after the read API confirms, synchronize the read record into both visible copies',
  );
  assert.match(
    dashboardSource,
    /<p>\{notification\.message\}<\/p>/,
    'detail messages including HTML-like strings should render as React text',
  );
  assert.doesNotMatch(
    dashboardSource,
    /dangerouslySetInnerHTML/,
    'message content must not become markup',
  );
});

test('notification types and references are shown to members as readable labels', () => {
  assert.equal(notificationTypeLabel('FINE_ISSUED'), 'Fine issued');
  assert.equal(notificationTypeLabel('LIBRARIAN_MESSAGE'), 'Library message');
  assert.equal(notificationTypeLabel('UNKNOWN_TYPE'), 'Notification');
  assert.equal(referenceTypeLabel('RESERVATION'), 'Reservation');
  assert.equal(referenceTypeLabel(null), 'None');
});

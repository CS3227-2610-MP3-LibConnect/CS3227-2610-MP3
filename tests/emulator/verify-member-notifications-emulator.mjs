import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
const localEmulator = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulatorHost);
if (process.env.NODE_ENV === 'production' || !localEmulator || !projectId.startsWith('demo-')) {
  throw new Error(
    'Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.',
  );
}

// Import Firebase only after the emulator and demo-project guards have passed.
const [{ Timestamp }, { db }, { LibraryRepository }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../../dist/apps/api/src/storage/firebase.js'),
  import('../../dist/apps/api/src/storage/repositories.js'),
]);

const runId = randomUUID().replaceAll('-', '');
const recipientUserId = `notification-emulator-${runId}`;
const actor = { userId: recipientUserId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const oneUnreadUserId = `notification-emulator-one-unread-${runId}`;
const oneUnreadActor = { userId: oneUnreadUserId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const noUnreadUserId = `notification-emulator-no-unread-${runId}`;
const noUnreadActor = { userId: noUnreadUserId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const repository = new LibraryRepository(db);
const ref = db.collection('notifications');
const ids = [
  'a',
  'b',
  'c',
  'foreign',
  'one-unread-new',
  'one-unread-read-new',
  'one-unread-read-old',
  'no-unread-new',
  'no-unread-old',
].map((suffix) => `${runId}-${suffix}`);
const at = (millis) => Timestamp.fromMillis(millis);
const item = (notificationId, recipient, millis, read) => ({
  notificationId,
  recipientUserId: recipient,
  notificationType: 'LIBRARIAN_MESSAGE',
  referenceType: null,
  referenceId: null,
  message: notificationId,
  createdAt: at(millis),
  read,
});

try {
  await Promise.all([
    ref.doc(ids[0]).set(item(ids[0], recipientUserId, 300, false)),
    ref.doc(ids[1]).set(item(ids[1], recipientUserId, 200, false)),
    ref.doc(ids[2]).set(item(ids[2], recipientUserId, 100, true)),
    ref.doc(ids[3]).set(item(ids[3], `other-${recipientUserId}`, 400, false)),
    ref.doc(ids[4]).set(item(ids[4], oneUnreadUserId, 500, false)),
    ref.doc(ids[5]).set(item(ids[5], oneUnreadUserId, 400, true)),
    ref.doc(ids[6]).set(item(ids[6], oneUnreadUserId, 300, true)),
    ref.doc(ids[7]).set(item(ids[7], noUnreadUserId, 200, true)),
    ref.doc(ids[8]).set(item(ids[8], noUnreadUserId, 100, true)),
  ]);

  const preview = await repository.notificationPreview(actor);
  assert.deepEqual(
    preview.map((notification) => notification.notificationId),
    [ids[0], ids[1]],
    'emulator preview query should return every unread notification newest first and exclude other recipients',
  );
  assert.deepEqual(
    (await repository.notificationPreview(oneUnreadActor)).map(
      (notification) => notification.notificationId,
    ),
    [ids[4], ids[5]],
    'emulator preview should query the newest read item when exactly one unread item exists',
  );
  assert.deepEqual(
    (await repository.notificationPreview(noUnreadActor)).map(
      (notification) => notification.notificationId,
    ),
    [ids[7], ids[8]],
    'emulator preview should query the two newest read items when there are no unread items',
  );

  const seen = [];
  let cursor = null;
  do {
    const page = await repository.notificationHistory(actor, 1, cursor);
    assert.ok(page.items.length <= 1, 'history query must respect the page bound');
    seen.push(...page.items.map((notification) => notification.notificationId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    seen,
    [ids[0], ids[1], ids[2]],
    'history query must include read/unread records in stable order and exclude other recipients',
  );
  assert.equal(new Set(seen).size, seen.length, 'cursor pages must not duplicate records');
  console.info(
    'Member notifications Firestore Emulator verification passed: unread and read-filtered preview queries, recipient history ordering, bounded cursor pages, and recipient isolation.',
  );
} finally {
  await Promise.all(ids.map((id) => ref.doc(id).delete()));
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
if (process.env.NODE_ENV === 'production' || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulatorHost) || !projectId.startsWith('demo-')) {
  throw new Error('Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.');
}

const [{ Timestamp }, { db }, { LibraryWorkflows }, { StorageError }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../../dist/apps/api/src/storage/firebase.js'),
  import('../../dist/apps/api/src/storage/workflows.js'),
  import('../../dist/apps/api/src/storage/repositories.js'),
]);

const tag = randomUUID().replaceAll('-', '');
const now = Timestamp.now();
const memberId = `reservation-cancel-member-${tag}`;
const userId = `reservation-cancel-user-${tag}`;
const isbn = `976${tag.slice(0, 10)}`;
const reservationId = `reservation-cancel-${tag}`;
const unassignedId = `reservation-cancel-unassigned-${tag}`;
const staleId = `reservation-cancel-stale-${tag}`;
const copyId = `reservation-cancel-copy-${tag}`;
const queuedId = `reservation-cancel-queued-${tag}`;
const member = { userId, memberId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const workflows = new LibraryWorkflows(db);

try {
  await db.collection('users').doc(userId).set({ ...member, updatedAt: now });
  await db.collection('books').doc(isbn).set({
    isbn, title: `Reservation cancellation ${tag}`, author: 'Emulator Verifier', publicationYear: 2024,
    publisher: 'Test Press', category: 'Fiction', synopsis: '', createdAt: now, updatedAt: now,
  });
  const expiryDate = Timestamp.fromMillis(now.toMillis() + 86_400_000);
  await Promise.all([
    db.collection('reservations').doc(reservationId).set({
      reservationId, memberId, isbn, status: 'PENDING', reservationDateTime: now, copyId, expiryDate,
    }),
    db.collection('reservations').doc(queuedId).set({
      reservationId: queuedId, memberId: `other-${memberId}`, isbn, status: 'PENDING', reservationDateTime: now, copyId: null, expiryDate: null,
    }),
    db.collection('reservations').doc(unassignedId).set({
      reservationId: unassignedId, memberId, isbn, status: 'PENDING', reservationDateTime: now, copyId: null, expiryDate: null,
    }),
    db.collection('reservations').doc(staleId).set({
      reservationId: staleId, memberId, isbn, status: 'CANCELLED', reservationDateTime: now, copyId: null, expiryDate: null,
    }),
    db.collection('bookCopies').doc(copyId).set({
      copyId, isbn, status: 'RESERVED', reservationId, shelfLocation: 'A1', createdAt: now, updatedAt: now,
    }),
  ]);

  await workflows.cancelMemberReservation(reservationId, member);
  const [cancelled, releasedCopy, queued] = await Promise.all([
    db.collection('reservations').doc(reservationId).get(),
    db.collection('bookCopies').doc(copyId).get(),
    db.collection('reservations').doc(queuedId).get(),
  ]);
  assert.equal(cancelled.get('status'), 'CANCELLED');
  assert.equal(cancelled.get('copyId'), copyId, 'cancellation preserves historical copy assignment');
  assert.equal(cancelled.get('expiryDate').toMillis(), expiryDate.toMillis(), 'cancellation preserves historical expiry');
  assert.equal(releasedCopy.get('status'), 'AVAILABLE');
  assert.equal(releasedCopy.get('reservationId'), null);
  assert.equal(queued.get('status'), 'PENDING', 'cancellation must not assign the released copy to another reservation');

  await workflows.cancelMemberReservation(unassignedId, member);
  const unassignedAfter = await db.collection('reservations').doc(unassignedId).get();
  assert.equal(unassignedAfter.get('status'), 'CANCELLED', 'unassigned pending reservations can be cancelled');
  assert.equal(unassignedAfter.get('copyId'), null);
  assert.equal(unassignedAfter.get('expiryDate'), null);

  await assert.rejects(workflows.cancelMemberReservation(staleId, member),
    (error) => error instanceof StorageError && error.code === 'CONFLICT');
  assert.equal((await db.collection('reservations').doc(staleId).get()).get('status'), 'CANCELLED',
    'a stale non-pending reservation must remain unchanged');

  const brokenReservationId = `reservation-cancel-broken-${tag}`;
  const brokenCopyId = `reservation-cancel-broken-copy-${tag}`;
  await Promise.all([
    db.collection('reservations').doc(brokenReservationId).set({
      reservationId: brokenReservationId, memberId, isbn, status: 'PENDING', reservationDateTime: now, copyId: brokenCopyId, expiryDate,
    }),
    db.collection('bookCopies').doc(brokenCopyId).set({
      copyId: brokenCopyId, isbn, status: 'RESERVED', reservationId: 'wrong-link', shelfLocation: 'A1', createdAt: now, updatedAt: now,
    }),
  ]);
  await assert.rejects(workflows.cancelMemberReservation(brokenReservationId, member),
    (error) => error instanceof StorageError && error.code === 'CONFLICT');
  const brokenAfter = await db.collection('reservations').doc(brokenReservationId).get();
  const copyAfter = await db.collection('bookCopies').doc(brokenCopyId).get();
  assert.equal(brokenAfter.get('status'), 'PENDING', 'inconsistent linkage must not partially cancel the reservation');
  assert.equal(copyAfter.get('status'), 'RESERVED', 'inconsistent linkage must not partially release the copy');
  console.info('Member reservation cancellation Firestore Emulator verification passed.');
} finally {
  await Promise.all([
    db.collection('users').doc(userId).delete(),
    db.collection('books').doc(isbn).delete(),
    db.collection('reservations').doc(reservationId).delete(),
    db.collection('reservations').doc(queuedId).delete(),
    db.collection('reservations').doc(unassignedId).delete(),
    db.collection('reservations').doc(staleId).delete(),
    db.collection('reservations').doc(`reservation-cancel-broken-${tag}`).delete(),
    db.collection('bookCopies').doc(copyId).delete(),
    db.collection('bookCopies').doc(`reservation-cancel-broken-copy-${tag}`).delete(),
  ]);
}

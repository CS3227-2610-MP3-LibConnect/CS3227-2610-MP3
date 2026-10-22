import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
if (process.env.NODE_ENV === 'production' || !/^127\.0\.0\.1:\d+$|^localhost:\d+$|^\[::1\]:\d+$/.test(emulatorHost) || !projectId.startsWith('demo-')) {
  throw new Error('Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.');
}

const [{ Timestamp }, { db }, { LibraryWorkflows }, { StorageError }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../../dist/apps/api/src/storage/firebase.js'),
  import('../../dist/apps/api/src/storage/workflows.js'),
  import('../../dist/apps/api/src/storage/repositories.js'),
]);

const tag = randomUUID().replaceAll('-', '');
const memberId = `member-${tag}`;
const userId = `user-${tag}`;
const isbn = `979${tag.slice(0, 10)}`;
const copyId = `copy-${tag}`;
const now = Timestamp.now();
const member = { userId, memberId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const book = {
  isbn, title: `Reservation ${tag}`, author: 'Emulator Verifier', publicationYear: 2024,
  publisher: 'Test Press', category: 'Fiction', synopsis: '', createdAt: now, updatedAt: now,
};
const copy = { copyId, isbn, status: 'AVAILABLE', shelfLocation: 'A1', createdAt: now, updatedAt: now };
const workflows = new LibraryWorkflows(db);

try {
  await Promise.all([
    db.collection('users').doc(userId).set({ ...member, updatedAt: now }),
    db.collection('books').doc(isbn).set(book),
    db.collection('bookCopies').doc(copyId).set(copy),
  ]);

  const zeroCopyIsbn = `976${tag.slice(0, 10)}`;
  await db.collection('books').doc(zeroCopyIsbn).set({ ...book, isbn: zeroCopyIsbn, title: `Zero copy ${tag}` });
  const zeroCopyReservation = await workflows.createMemberReservation(zeroCopyIsbn, member);
  assert.equal(zeroCopyReservation.memberId, memberId);
  assert.equal(zeroCopyReservation.isbn, zeroCopyIsbn);
  assert.equal(zeroCopyReservation.status, 'PENDING');
  assert.ok(zeroCopyReservation.reservationDateTime instanceof Timestamp, 'creation timestamp is supplied by the server');
  assert.equal(zeroCopyReservation.copyId, null);
  assert.equal(zeroCopyReservation.expiryDate, null);
  assert.equal((await workflows.memberReservation(zeroCopyIsbn, member)).reservationId, zeroCopyReservation.reservationId,
    'member pending lookup must find only its own reservation by ISBN');
  assert.equal((await db.collection('notifications').where('recipientUserId', '==', userId).get()).size, 0,
    'member creation must not create a ready notification');

  const createOutcomes = await Promise.allSettled([
    workflows.createMemberReservation(isbn, member),
    workflows.createMemberReservation(isbn, member),
  ]);
  assert.equal(createOutcomes.filter((outcome) => outcome.status === 'fulfilled').length, 0,
    'both requests must reject while an AVAILABLE copy exists');
  assert.equal(createOutcomes.filter((outcome) => outcome.status === 'rejected').length, 2);
  assert.equal((await db.collection('reservations').where('memberId', '==', memberId).where('isbn', '==', isbn).where('status', '==', 'PENDING').get()).size, 0,
    'available-copy rejection must not create reservations');

  const raceTag = `${tag}-race`;
  const raceMemberId = `member-${raceTag}`;
  const raceUserId = `user-${raceTag}`;
  const raceIsbn = `978${tag.slice(0, 10)}`;
  const raceCopyId = `copy-${raceTag}`;
  const raceMember = { userId: raceUserId, memberId: raceMemberId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
  await Promise.all([
    db.collection('users').doc(raceUserId).set({ ...raceMember, updatedAt: now }),
    db.collection('books').doc(raceIsbn).set({ ...book, isbn: raceIsbn, title: `Borrow race ${tag}` }),
    db.collection('bookCopies').doc(raceCopyId).set({ ...copy, copyId: raceCopyId, isbn: raceIsbn }),
  ]);

  const [reservationOutcome, borrowOutcomes] = await Promise.all([
    workflows.createMemberReservation(raceIsbn, raceMember).then((value) => ({ status: 'fulfilled', value }), (reason) => ({ status: 'rejected', reason })),
    workflows.confirmMemberBorrow([raceCopyId], raceMember),
  ]);
  assert.equal(borrowOutcomes.length, 1, 'the only available copy must be borrowed successfully');
  assert.equal(borrowOutcomes[0].copyId, raceCopyId);
  assert.equal(borrowOutcomes[0].status, 'ACTIVE');
  if (reservationOutcome.status === 'rejected') {
    assert.ok(reservationOutcome.reason instanceof StorageError);
    assert.equal(reservationOutcome.reason.code, 'CONFLICT');
  }
  const storedCopy = await db.collection('bookCopies').doc(raceCopyId).get();
  assert.equal(storedCopy.get('status'), 'ON_LOAN');
  const pending = await db.collection('reservations').where('memberId', '==', raceMemberId).where('isbn', '==', raceIsbn).where('status', '==', 'PENDING').get();
  assert.equal(pending.size, reservationOutcome.status === 'fulfilled' ? 1 : 0,
    'a reservation may be created only after the concurrent borrow makes the copy unavailable');
  if (reservationOutcome.status === 'fulfilled') {
    assert.equal(reservationOutcome.value.copyId, null);
    assert.equal(reservationOutcome.value.expiryDate, null);
  }

  const duplicateIsbn = `977${tag.slice(0, 10)}`;
  const duplicateBook = { ...book, isbn: duplicateIsbn, title: `Duplicate reservation ${tag}` };
  await db.collection('books').doc(duplicateIsbn).set(duplicateBook);
  const duplicateOutcomes = await Promise.allSettled([
    workflows.createMemberReservation(duplicateIsbn, raceMember),
    workflows.createMemberReservation(duplicateIsbn, raceMember),
  ]);
  assert.equal(duplicateOutcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1,
    'concurrent eligible requests for the same member and ISBN must create exactly one reservation');
  const duplicatePending = await db.collection('reservations')
    .where('memberId', '==', raceMemberId).where('isbn', '==', duplicateIsbn).where('status', '==', 'PENDING').get();
  assert.equal(duplicatePending.size, 1);
  await assert.rejects(workflows.createMemberReservation(duplicateIsbn, raceMember),
    (error) => error instanceof StorageError && error.code === 'CONFLICT',
  'a sequential duplicate request must be rejected');
  assert.equal((await db.collection('reservations').where('memberId', '==', raceMemberId).where('isbn', '==', duplicateIsbn).where('status', '==', 'PENDING').get()).size, 1);
  console.info('Member reservation Firestore Emulator verification passed.');
} finally {
  await Promise.all([
    db.collection('users').doc(userId).delete(),
    db.collection('books').doc(isbn).delete(),
    db.collection('books').doc(`976${tag.slice(0, 10)}`).delete(),
    db.collection('bookCopies').doc(copyId).delete(),
  ]);
  const [createdReservations, raceReservations] = await Promise.all([
    db.collection('reservations').where('memberId', '==', memberId).get(),
    db.collection('reservations').where('memberId', '==', `member-${tag}-race`).get(),
  ]);
  await Promise.all([...createdReservations.docs, ...raceReservations.docs].map((snapshot) => snapshot.ref.delete()));
  await Promise.all([
    db.collection('users').doc(`user-${tag}-race`).delete(),
    db.collection('books').doc(`978${tag.slice(0, 10)}`).delete(),
    db.collection('bookCopies').doc(`copy-${tag}-race`).delete(),
    db.collection('books').doc(`977${tag.slice(0, 10)}`).delete(),
  ]);
}

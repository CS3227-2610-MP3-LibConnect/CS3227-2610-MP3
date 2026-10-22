import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { test } from 'node:test';
import { LibraryRepository, StorageError } from '../dist/apps/api/src/storage/repositories.js';
import { LibraryWorkflows } from '../dist/apps/api/src/storage/workflows.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV === 'production') {
  throw new Error('Run this check with the Firestore Emulator and a non-production environment.');
}

const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-libconnect' }, 'circulation-negative-test');
const db = getFirestore(app);
const workflows = new LibraryWorkflows(db);
const catalog = new LibraryRepository(db);
const librarian = { userId: 'librarian-1', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', isManager: false };
const member = { userId: 'member-user-1', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'MEMBER-1' };
const secondMember = { userId: 'member-user-2', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'MEMBER-2' };

function expectStorageCode(error, code) {
  assert.equal(error instanceof StorageError, true);
  assert.equal(error.code, code);
  return true;
}

async function clearDatabase() {
  for (const collection of await db.listCollections()) {
    const snapshot = await collection.get();
    if (snapshot.empty) continue;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

async function putFixtures() {
  const now = Timestamp.fromMillis(Date.parse('2026-01-01T00:00:00.000Z'));
  await db.collection('users').doc(member.userId).set(member);
  await db.collection('users').doc(secondMember.userId).set(secondMember);
  await db.collection('books').doc('isbn-1').set({ isbn: 'isbn-1', title: 'Test Book' });
  for (const [copyId, shelfLocation] of [['copy-available', 'A-1'], ['copy-reserved', 'A-2'], ['copy-lost', 'A-3']]) {
    await db.collection('bookCopies').doc(copyId).set({ copyId, isbn: 'isbn-1', shelfLocation, status: 'AVAILABLE', reservationId: null, createdAt: now, updatedAt: now });
  }
}

test('reserved-loan mismatch, expiry, missing reservation, and report ownership paths do not write', async () => {
  await clearDatabase();
  await putFixtures();
  const future = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  await db.collection('bookCopies').doc('copy-reserved').update({ status: 'RESERVED', reservationId: 'reservation-match' });
  await db.collection('reservations').doc('reservation-match').set({ reservationId: 'reservation-match', memberId: 'MEMBER-2', isbn: 'isbn-1', copyId: 'copy-reserved', reservationDateTime: Timestamp.now(), expiryDate: future, status: 'PENDING' });
  await assert.rejects(() => workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-reserved' }, librarian), (error) => expectStorageCode(error, 'CONFLICT'));
  assert.equal((await db.collection('bookCopies').doc('copy-reserved').get()).get('status'), 'RESERVED');
  assert.equal((await db.collection('loans').where('copyId', '==', 'copy-reserved').get()).size, 0);

  await clearDatabase();
  await putFixtures();
  await db.collection('bookCopies').doc('copy-reserved').update({ status: 'RESERVED', reservationId: 'reservation-success' });
  await db.collection('reservations').doc('reservation-success').set({ reservationId: 'reservation-success', memberId: 'MEMBER-1', isbn: 'isbn-1', copyId: 'copy-reserved', reservationDateTime: Timestamp.now(), expiryDate: future, status: 'PENDING' });
  const reservedLoan = await workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-reserved' }, librarian);
  assert.equal(reservedLoan.loan.status, 'ACTIVE');
  assert.equal((await db.collection('reservations').doc('reservation-success').get()).get('status'), 'FULFILLED');

  await clearDatabase();
  await putFixtures();
  await db.collection('bookCopies').doc('copy-reserved').update({ status: 'RESERVED', reservationId: 'reservation-expired' });
  await db.collection('reservations').doc('reservation-expired').set({ reservationId: 'reservation-expired', memberId: 'MEMBER-1', isbn: 'isbn-1', copyId: 'copy-reserved', reservationDateTime: Timestamp.now(), expiryDate: Timestamp.fromMillis(Date.parse('2025-12-31T00:00:00.000Z')), status: 'PENDING' });
  await assert.rejects(() => workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-reserved' }, librarian), (error) => expectStorageCode(error, 'CONFLICT'));
  assert.equal((await db.collection('loans').where('copyId', '==', 'copy-reserved').get()).size, 0);

  await clearDatabase();
  await putFixtures();
  await db.collection('bookCopies').doc('copy-reserved').update({ status: 'RESERVED', reservationId: 'reservation-missing' });
  await assert.rejects(() => workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-reserved' }, librarian), (error) => expectStorageCode(error, 'NOT_FOUND'));
  assert.equal((await db.collection('loans').where('copyId', '==', 'copy-reserved').get()).size, 0);

  const created = await workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-available' }, librarian);
  await assert.rejects(() => workflows.reportClosure(created.loan.loanId, 'RETURNED', secondMember), (error) => expectStorageCode(error, 'FORBIDDEN'));
  assert.equal((await db.collection('loans').doc(created.loan.loanId).get()).get('status'), 'ACTIVE');
  await db.collection('bookCopies').doc('copy-available').update({ status: 'AVAILABLE' });
  await assert.rejects(() => workflows.reportClosure(created.loan.loanId, 'RETURNED', member), (error) => expectStorageCode(error, 'CONFLICT'));
  assert.equal((await db.collection('loans').doc(created.loan.loanId).get()).get('status'), 'ACTIVE');
});

test('lost rejection and no-eligible-reservation review paths leave no side effects', async () => {
  await clearDatabase();
  await putFixtures();
  const lostLoan = await workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-lost' }, librarian);
  await workflows.reportClosure(lostLoan.loan.loanId, 'LOST', member);
  await workflows.reviewClosure(lostLoan.loan.loanId, 'REJECT', undefined, librarian);
  assert.equal((await db.collection('loans').doc(lostLoan.loan.loanId).get()).get('status'), 'ACTIVE');
  assert.equal((await db.collection('bookCopies').doc('copy-lost').get()).get('status'), 'ON_LOAN');
  assert.equal((await db.collection('fines').where('loanId', '==', lostLoan.loan.loanId).get()).size, 0);

  const returnedLoan = await workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-available' }, librarian);
  await workflows.reportClosure(returnedLoan.loan.loanId, 'RETURNED', member);
  await assert.rejects(() => workflows.reviewClosure(returnedLoan.loan.loanId, 'CONFIRM', 'RESERVED', librarian), (error) => expectStorageCode(error, 'CONFLICT'));
  assert.equal((await db.collection('loans').doc(returnedLoan.loan.loanId).get()).get('status'), 'PENDING_CLOSE');
  assert.equal((await db.collection('bookCopies').doc('copy-available').get()).get('status'), 'IN_TRANSIT');
});

test('reservation insertion and catalog mutation races remain transactional', async () => {
  await clearDatabase();
  await putFixtures();
  const returnedLoan = await workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-available' }, librarian);
  await workflows.reportClosure(returnedLoan.loan.loanId, 'RETURNED', member);
  const reservation = { reservationId: 'reservation-race', memberId: 'MEMBER-2', isbn: 'isbn-1', copyId: null, reservationDateTime: Timestamp.now(), expiryDate: null, status: 'PENDING' };
  const [reviewAttempt, reservationAttempt] = await Promise.allSettled([
    workflows.reviewClosure(returnedLoan.loan.loanId, 'CONFIRM', 'RESERVED', librarian),
    catalog.createReservation(reservation, librarian),
  ]);
  assert.equal(reviewAttempt.status === 'fulfilled' || reservationAttempt.status === 'fulfilled', true);
  const storedReservation = await db.collection('reservations').doc(reservation.reservationId).get();
  const storedCopy = await db.collection('bookCopies').doc('copy-available').get();
  const storedLoan = await db.collection('loans').doc(returnedLoan.loan.loanId).get();
  if (reviewAttempt.status === 'fulfilled') {
    assert.equal(storedLoan.get('status'), 'CLOSED_RETURNED');
    assert.equal(storedCopy.get('status'), 'RESERVED');
    assert.equal(storedReservation.get('copyId'), 'copy-available');
  } else {
    assert.equal(storedLoan.get('status'), 'PENDING_CLOSE');
    assert.equal(storedCopy.get('status'), 'IN_TRANSIT');
    assert.equal(storedReservation.get('copyId'), null);
  }

  await clearDatabase();
  await putFixtures();
  const deletionRaceLoan = await workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-available' }, librarian);
  await workflows.reportClosure(deletionRaceLoan.loan.loanId, 'RETURNED', member);
  const [reviewRace, deleteRace] = await Promise.allSettled([
    workflows.reviewClosure(deletionRaceLoan.loan.loanId, 'CONFIRM', 'AVAILABLE', librarian),
    catalog.deleteCopy('copy-available', librarian),
  ]);
  assert.equal(reviewRace.status, 'fulfilled');
  assert.equal(deleteRace.status, 'rejected');
  assert.equal((await db.collection('loans').doc(deletionRaceLoan.loan.loanId).get()).get('status'), 'CLOSED_RETURNED');
  assert.equal((await db.collection('bookCopies').doc('copy-available').get()).get('status'), 'AVAILABLE');

  const statusRaceLoan = await workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-lost' }, librarian);
  await workflows.reportClosure(statusRaceLoan.loan.loanId, 'RETURNED', member);
  const [statusReview, catalogUpdate] = await Promise.allSettled([
    workflows.reviewClosure(statusRaceLoan.loan.loanId, 'CONFIRM', 'DAMAGED', librarian),
    catalog.updateCopy('copy-lost', 'RACE-SHELF', librarian),
  ]);
  assert.equal(statusReview.status, 'fulfilled');
  assert.equal(catalogUpdate.status, 'fulfilled');
  const finalCopy = await db.collection('bookCopies').doc('copy-lost').get();
  assert.equal(finalCopy.get('status'), 'DAMAGED');
  assert.equal(finalCopy.get('shelfLocation'), 'RACE-SHELF');
});

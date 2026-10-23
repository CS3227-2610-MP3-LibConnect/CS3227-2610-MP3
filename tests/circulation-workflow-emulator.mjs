import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { test } from 'node:test';
import { LibraryWorkflows } from '../dist/apps/api/src/storage/workflows.js';
import { LibraryRepository, StorageError } from '../dist/apps/api/src/storage/repositories.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV === 'production') {
  throw new Error('Run this check with the Firestore Emulator and a non-production environment.');
}

const app = initializeApp(
  { projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-libconnect' },
  'circulation-workflow-test',
);
const db = getFirestore(app);
const workflows = new LibraryWorkflows(db);
const catalog = new LibraryRepository(db);
const librarian = {
  userId: 'librarian-1',
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
  isManager: false,
};
const member = {
  userId: 'member-user-1',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'MEMBER-1',
};
const secondMember = {
  userId: 'member-user-2',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'MEMBER-2',
};

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
  await db.collection('bookCopies').doc('copy-available').set({
    copyId: 'copy-available',
    isbn: 'isbn-1',
    shelfLocation: 'A-1',
    status: 'AVAILABLE',
    reservationId: null,
    updatedAt: now,
  });
  await db.collection('bookCopies').doc('copy-reserved').set({
    copyId: 'copy-reserved',
    isbn: 'isbn-1',
    shelfLocation: 'A-2',
    status: 'AVAILABLE',
    reservationId: null,
    updatedAt: now,
  });
  await db.collection('bookCopies').doc('copy-lost').set({
    copyId: 'copy-lost',
    isbn: 'isbn-1',
    shelfLocation: 'A-3',
    status: 'AVAILABLE',
    reservationId: null,
    updatedAt: now,
  });
}

function expectStorageCode(error, code) {
  assert.equal(error instanceof StorageError, true);
  assert.equal(error.code, code);
}

test('loan creation, member reporting, review transitions, reservation handoff, and lost fine are atomic', async () => {
  await clearDatabase();
  await putFixtures();

  const created = await workflows.createLoan(
    { memberId: 'MEMBER-1', copyId: 'copy-available' },
    librarian,
  );
  assert.equal(created.loan.status, 'ACTIVE');
  assert.equal(
    created.loan.dueDate.toMillis() - created.loan.borrowDateTime.toMillis(),
    30 * 24 * 60 * 60 * 1000,
  );
  assert.equal(
    (await db.collection('bookCopies').doc('copy-available').get()).get('status'),
    'ON_LOAN',
  );
  await assert.rejects(
    () => workflows.createLoan({ memberId: 'MEMBER-2', copyId: 'copy-available' }, librarian),
    (error) => {
      expectStorageCode(error, 'CONFLICT');
      return true;
    },
  );

  await workflows.reportClosure(created.loan.loanId, 'RETURNED', member);
  const pending = await db.collection('loans').doc(created.loan.loanId).get();
  assert.equal(pending.get('status'), 'PENDING_CLOSE');
  assert.equal(
    (await db.collection('bookCopies').doc('copy-available').get()).get('status'),
    'IN_TRANSIT',
  );
  await assert.rejects(
    () => workflows.reportClosure(created.loan.loanId, 'RETURNED', member),
    (error) => {
      expectStorageCode(error, 'CONFLICT');
      return true;
    },
  );
  await workflows.reviewClosure(created.loan.loanId, 'REJECT', undefined, librarian);
  assert.equal(
    (await db.collection('loans').doc(created.loan.loanId).get()).get('closureReviewDecision'),
    'REJECTED',
  );
  assert.equal(
    (await db.collection('bookCopies').doc('copy-available').get()).get('status'),
    'ON_LOAN',
  );

  await workflows.reportClosure(created.loan.loanId, 'RETURNED', member);
  await workflows.reviewClosure(created.loan.loanId, 'CONFIRM', 'AVAILABLE', librarian);
  assert.equal(
    (await db.collection('loans').doc(created.loan.loanId).get()).get('status'),
    'CLOSED_RETURNED',
  );
  assert.equal(
    (await db.collection('bookCopies').doc('copy-available').get()).get('status'),
    'AVAILABLE',
  );

  const reservedLoan = await workflows.createLoan(
    { memberId: 'MEMBER-1', copyId: 'copy-reserved' },
    librarian,
  );
  await workflows.reportClosure(reservedLoan.loan.loanId, 'RETURNED', member);
  const reservationDate = Timestamp.fromMillis(Date.parse('2026-01-02T00:00:00.000Z'));
  await db.collection('reservations').doc('reservation-1').set({
    reservationId: 'reservation-1',
    memberId: 'MEMBER-2',
    isbn: 'isbn-1',
    copyId: null,
    reservationDateTime: reservationDate,
    expiryDate: null,
    status: 'PENDING',
  });
  const preview = await workflows.returnPreview(reservedLoan.loan.loanId, librarian);
  assert.deepEqual(preview.allowedDispositions, ['AVAILABLE', 'DAMAGED', 'RESERVED']);
  const reservedResult = await workflows.reviewClosure(
    reservedLoan.loan.loanId,
    'CONFIRM',
    'RESERVED',
    librarian,
  );
  assert.equal(reservedResult.copy.status, 'RESERVED');
  assert.equal(
    (await db.collection('reservations').doc('reservation-1').get()).get('copyId'),
    'copy-reserved',
  );
  assert.equal(
    (await db.collection('notifications').doc('reservation-ready-reservation-1').get()).get(
      'notificationType',
    ),
    'RESERVATION_READY',
  );

  const lostLoan = await workflows.createLoan(
    { memberId: 'MEMBER-1', copyId: 'copy-lost' },
    librarian,
  );
  await workflows.reportClosure(lostLoan.loan.loanId, 'LOST', member);
  const lostResult = await workflows.reviewClosure(
    lostLoan.loan.loanId,
    'CONFIRM',
    undefined,
    librarian,
  );
  assert.equal(lostResult.copy.status, 'LOST');
  assert.equal(lostResult.fine.amountMinorUnits, 2000);
  const fines = await db.collection('fines').where('loanId', '==', lostLoan.loan.loanId).get();
  assert.equal(fines.size, 1);
  await assert.rejects(
    () => workflows.reviewClosure(lostLoan.loan.loanId, 'CONFIRM', undefined, librarian),
    (error) => {
      expectStorageCode(error, 'CONFLICT');
      return true;
    },
  );
});

test('concurrent loan and closure reviews have one winner and no duplicate side effects', async () => {
  await clearDatabase();
  await putFixtures();

  const loanAttempts = await Promise.allSettled([
    workflows.createLoan({ memberId: 'MEMBER-1', copyId: 'copy-available' }, librarian),
    workflows.createLoan({ memberId: 'MEMBER-2', copyId: 'copy-available' }, librarian),
  ]);
  assert.equal(loanAttempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(loanAttempts.filter((attempt) => attempt.status === 'rejected').length, 1);
  const committedLoan = loanAttempts.find((attempt) => attempt.status === 'fulfilled').value.loan;
  const committedMember = committedLoan.memberId === member.memberId ? member : secondMember;
  const committedLoans = await db.collection('loans').where('copyId', '==', 'copy-available').get();
  assert.equal(committedLoans.size, 1);
  assert.equal(
    (await db.collection('bookCopies').doc('copy-available').get()).get('status'),
    'ON_LOAN',
  );

  await workflows.reportClosure(committedLoan.loanId, 'RETURNED', committedMember);
  const reviewAttempts = await Promise.allSettled([
    workflows.reviewClosure(committedLoan.loanId, 'CONFIRM', 'AVAILABLE', librarian),
    workflows.reviewClosure(committedLoan.loanId, 'CONFIRM', 'DAMAGED', librarian),
  ]);
  assert.equal(reviewAttempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(reviewAttempts.filter((attempt) => attempt.status === 'rejected').length, 1);
  assert.equal(
    (await db.collection('loans').doc(committedLoan.loanId).get()).get('status'),
    'CLOSED_RETURNED',
  );
  assert.ok(
    ['AVAILABLE', 'DAMAGED'].includes(
      (await db.collection('bookCopies').doc('copy-available').get()).get('status'),
    ),
  );

  const lostLoan = await workflows.createLoan(
    { memberId: 'MEMBER-1', copyId: 'copy-lost' },
    librarian,
  );
  await workflows.reportClosure(lostLoan.loan.loanId, 'LOST', member);
  const lostReviewAttempts = await Promise.allSettled([
    workflows.reviewClosure(lostLoan.loan.loanId, 'CONFIRM', undefined, librarian),
    workflows.reviewClosure(lostLoan.loan.loanId, 'CONFIRM', undefined, librarian),
  ]);
  assert.equal(lostReviewAttempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(lostReviewAttempts.filter((attempt) => attempt.status === 'rejected').length, 1);
  assert.equal(
    (await db.collection('loans').doc(lostLoan.loan.loanId).get()).get('status'),
    'CLOSED_LOST',
  );
  assert.equal((await db.collection('bookCopies').doc('copy-lost').get()).get('status'), 'LOST');
  assert.equal(
    (await db.collection('fines').where('loanId', '==', lostLoan.loan.loanId).get()).size,
    1,
  );
});

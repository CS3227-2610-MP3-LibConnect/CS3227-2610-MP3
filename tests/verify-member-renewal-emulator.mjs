import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
if (process.env.NODE_ENV === 'production' || !/^127\.0\.0\.1:\d+$|^localhost:\d+$|^\[::1\]:\d+$/.test(emulatorHost) || !projectId.startsWith('demo-')) {
  throw new Error('Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.');
}

const [{ Timestamp }, { db }, { LibraryWorkflows }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../dist/apps/api/src/storage/firebase.js'),
  import('../dist/apps/api/src/storage/workflows.js'),
]);

const tag = randomUUID().replaceAll('-', '');
const member = { userId: `user-${tag}`, memberId: `member-${tag}`, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const loanId = `loan-${tag}`;
const copyId = `copy-${tag}`;
const pendingReservationId = `pending-${tag}`;
const assignedReservationId = `assigned-${tag}`;
const dueDate = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
const priorDue = dueDate.toMillis();
const loan = {
  loanId, memberId: member.memberId, copyId, isbn: `isbn-${tag}`, bookTitle: `Renewal ${tag}`,
  borrowDateTime: Timestamp.now(), dueDate, returnDateTime: null,
  closureReportType: null, closureReportedDateTime: null, closureReviewedDateTime: null,
  status: 'ACTIVE', isRenewed: false,
};
const copy = { copyId, isbn: loan.isbn, status: 'ON_LOAN', shelfLocation: null, updatedAt: Timestamp.now() };
const pending = { reservationId: pendingReservationId, memberId: `waiting-${tag}`, isbn: loan.isbn, status: 'PENDING', reservationDateTime: Timestamp.now(), copyId: null, expiryDate: null };
const assigned = { ...pending, reservationId: assignedReservationId, status: 'ASSIGNED', copyId: `reserved-copy-${tag}` };
const workflows = new LibraryWorkflows(db);

try {
  await Promise.all([
    db.collection('users').doc(member.userId).set(member),
    db.collection('loans').doc(loanId).set(loan),
    db.collection('bookCopies').doc(copyId).set(copy),
    db.collection('reservations').doc(pendingReservationId).set(pending),
    db.collection('reservations').doc(assignedReservationId).set(assigned),
  ]);

  const attempts = await Promise.allSettled([
    workflows.renewMemberLoan(loanId, member),
    workflows.renewMemberLoan(loanId, member),
  ]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1,
    'one concurrent renewal should succeed');
  assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1,
    'the competing renewal should observe the renewed loan');

  const [storedLoan, storedCopy, storedPending, storedAssigned] = await Promise.all([
    db.collection('loans').doc(loanId).get(),
    db.collection('bookCopies').doc(copyId).get(),
    db.collection('reservations').doc(pendingReservationId).get(),
    db.collection('reservations').doc(assignedReservationId).get(),
  ]);
  assert.equal(storedLoan.get('dueDate').toMillis(), priorDue + 30 * 24 * 60 * 60 * 1000,
    'the due date should advance by exactly thirty days once');
  assert.equal(storedLoan.get('isRenewed'), true);
  assert.equal(storedLoan.get('status'), 'ACTIVE');
  assert.equal(storedCopy.get('status'), 'ON_LOAN');
  assert.equal(storedPending.get('status'), 'PENDING');
  assert.equal(storedAssigned.get('status'), 'ASSIGNED');
  assert.equal(storedAssigned.get('copyId'), assigned.copyId);
  console.info('Member loan renewal Firestore Emulator verification passed.');
} finally {
  await Promise.all([
    db.collection('users').doc(member.userId).delete(),
    db.collection('loans').doc(loanId).delete(),
    db.collection('bookCopies').doc(copyId).delete(),
    db.collection('reservations').doc(pendingReservationId).delete(),
    db.collection('reservations').doc(assignedReservationId).delete(),
  ]);
}

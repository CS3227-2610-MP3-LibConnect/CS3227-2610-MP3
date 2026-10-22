import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
if (process.env.NODE_ENV === 'production' || !/^127\.0\.0\.1:\d+$|^localhost:\d+$|^\[::1\]:\d+$/.test(emulatorHost) || !projectId.startsWith('demo-')) {
  throw new Error('Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.');
}

// Validate the target before importing Firebase initialization, which could otherwise
// initialize the Admin SDK with application default credentials.
const [{ Timestamp }, { db }, { LibraryWorkflows }, { StorageError }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../../dist/apps/api/src/storage/firebase.js'),
  import('../../dist/apps/api/src/storage/workflows.js'),
  import('../../dist/apps/api/src/storage/repositories.js'),
]);

const tag = randomUUID().replaceAll('-', '');
const memberId = `member-${tag}`;
const member = { userId: `user-${tag}`, memberId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const librarian = { userId: `librarian-${tag}`, employeeId: `employee-${tag}`, accountType: 'LIBRARIAN', accountStatus: 'ACTIVE' };
const inactiveMember = { ...member, accountStatus: 'INACTIVE' };
const isbn = `978${tag.slice(0, 10)}`;
const copyIds = ['available', 'reserved', 'damaged'].map((suffix) => `${suffix}-${tag}`);
const workflows = new LibraryWorkflows(db);
const now = Timestamp.now();

const book = {
  isbn, title: `Borrow Eligibility ${tag}`, author: 'Eligibility Tester', publicationYear: 2024,
  publisher: 'Test Press', category: 'Fiction', synopsis: '', createdAt: now, updatedAt: now,
};
const copies = [
  { copyId: copyIds[0], isbn, shelfLocation: 'A1', status: 'AVAILABLE' },
  { copyId: copyIds[1], isbn, shelfLocation: 'A2', status: 'RESERVED', reservationId: `reservation-${tag}` },
  { copyId: copyIds[2], isbn, shelfLocation: 'A3', status: 'DAMAGED' },
].map((copy) => ({ ...copy, createdAt: now, updatedAt: now }));

try {
  await db.collection('books').doc(isbn).set(book);
  await Promise.all(copies.map((copy) => db.collection('bookCopies').doc(copy.copyId).set(copy)));
  await Promise.all(Array.from({ length: 3 }, (_, index) => db.collection('loans').doc(`active-${tag}-${index}`).set({
    loanId: `active-${tag}-${index}`, memberId, copyId: `old-copy-${index}`, isbn, bookTitle: book.title,
    borrowDateTime: now, dueDate: now, returnDateTime: null, closureReportType: null,
    closureReportedDateTime: null, closureReviewedDateTime: null, status: 'ACTIVE', isRenewed: false,
  })));
  await db.collection('loans').doc(`pending-close-${tag}`).set({
    loanId: `pending-close-${tag}`, memberId, copyId: 'old-copy-pending-close', isbn, bookTitle: book.title,
    borrowDateTime: now, dueDate: now, returnDateTime: null, closureReportType: 'RETURNED',
    closureReportedDateTime: now, closureReviewedDateTime: null, status: 'PENDING_CLOSE', isRenewed: false,
  });
  await db.collection('loans').doc(`closed-${tag}`).set({
    loanId: `closed-${tag}`, memberId, copyId: 'old-copy-closed', isbn, bookTitle: book.title,
    borrowDateTime: now, dueDate: now, returnDateTime: now, closureReportType: 'RETURNED',
    closureReportedDateTime: now, closureReviewedDateTime: now, status: 'CLOSED_RETURNED', isRenewed: false,
  });

  // These calls intentionally specify the task-1 workflow contract before its implementation.
  for (const actor of [librarian, inactiveMember, { ...member, memberId: undefined }]) {
    await assert.rejects(workflows.memberBorrowCapacity(actor), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
    await assert.rejects(workflows.checkMemberBorrowCopy(copyIds[0], actor), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  }

  const capacity = await workflows.memberBorrowCapacity(member);
  assert.deepEqual(capacity, { openLoanCount: 4, remainingSlots: 6 }, 'capacity counts this member\'s ACTIVE and PENDING_CLOSE loans');
  await assert.rejects(workflows.checkMemberBorrowCopy(`missing-${tag}`, member),
    (error) => error instanceof StorageError && error.code === 'NOT_FOUND');

  const eligible = await workflows.checkMemberBorrowCopy(copyIds[0], member);
  assert.equal(eligible.copy.copyId, copyIds[0]);
  assert.equal(eligible.copy.status, 'AVAILABLE');
  assert.equal(eligible.book.isbn, isbn);
  assert.equal(eligible.book.title, book.title);
  for (const copyId of copyIds.slice(1)) {
    await assert.rejects(workflows.checkMemberBorrowCopy(copyId, member),
      (error) => error instanceof StorageError && error.code === 'CONFLICT');
  }

  const [storedCopies, loans] = await Promise.all([
    Promise.all(copyIds.map((copyId) => db.collection('bookCopies').doc(copyId).get())),
    db.collection('loans').where('memberId', '==', memberId).get(),
  ]);
  assert.deepEqual(storedCopies.map((snapshot) => snapshot.get('status')), ['AVAILABLE', 'RESERVED', 'DAMAGED'],
    'eligibility checks do not mutate or reserve copies');
  assert.equal(loans.size, 5, 'eligibility checks do not create loans');
  console.info('Member borrow eligibility Emulator verification passed.');
} finally {
  await Promise.all([
    ...copyIds.map((copyId) => db.collection('bookCopies').doc(copyId).delete()),
    ...Array.from({ length: 4 }, (_, index) => db.collection('loans').doc(index < 3 ? `active-${tag}-${index}` : `closed-${tag}`).delete()),
    db.collection('loans').doc(`pending-close-${tag}`).delete(),
    db.collection('books').doc(isbn).delete(),
  ]);
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
if (process.env.NODE_ENV === 'production' || !/^127\.0\.0\.1:\d+$|^localhost:\d+$|^\[::1\]:\d+$/.test(emulatorHost) || !projectId.startsWith('demo-')) {
  throw new Error('Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.');
}

// Validate the target before importing Firebase initialization, which could otherwise
// initialize the Admin SDK with application default credentials.
const [{ Timestamp }, { db }, { LibraryWorkflows }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../dist/apps/api/src/storage/firebase.js'),
  import('../dist/apps/api/src/storage/workflows.js'),
]);

const tag = randomUUID().replaceAll('-', '');
const memberId = `member-${tag}`;
const userId = `user-${tag}`;
const isbn = `979${tag.slice(0, 10)}`;
const candidateCopyIds = [`copy-a-${tag}`, `copy-b-${tag}`];
const seededLoanIds = Array.from({ length: 9 }, (_, index) => `loan-seed-${tag}-${index}`);
const workflows = new LibraryWorkflows(db);
const now = Timestamp.now();
const member = { userId, memberId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const book = {
  isbn, title: `Borrow Concurrency ${tag}`, author: 'Concurrency Tester', publicationYear: 2024,
  publisher: 'Test Press', category: 'Fiction', synopsis: '', createdAt: now, updatedAt: now,
};
const copies = candidateCopyIds.map((copyId) => ({
  copyId, isbn, status: 'AVAILABLE', shelfLocation: 'A1', createdAt: now, updatedAt: now,
}));
const seededLoans = seededLoanIds.map((loanId, index) => ({
  loanId, memberId, copyId: `existing-copy-${tag}-${index}`, isbn, bookTitle: book.title,
  borrowDateTime: now, dueDate: now, returnDateTime: null, closureReportType: null,
  closureReportedDateTime: null, closureReviewedDateTime: null, status: 'ACTIVE', isRenewed: false,
}));

try {
  await Promise.all([
    db.collection('users').doc(userId).set({ ...member, updatedAt: now }),
    db.collection('books').doc(isbn).set(book),
    ...copies.map((copy) => db.collection('bookCopies').doc(copy.copyId).set(copy)),
    ...seededLoans.map((loan) => db.collection('loans').doc(loan.loanId).set(loan)),
  ]);

  const results = await Promise.all(candidateCopyIds.map((copyId) =>
    workflows.confirmMemberBorrow([copyId], member)));
  const outcomes = results.flat();
  assert.equal(outcomes.filter((outcome) => outcome.success).length, 1,
    'only one of two concurrent requests may use the member\'s final loan slot');
  assert.equal(outcomes.filter((outcome) => !outcome.success).length, 1,
    'the request that loses the transaction race must receive a per-copy failure');
  assert.match(outcomes.find((outcome) => !outcome.success).reason, /10 active-loan limit/i);

  const [storedCopies, memberLoans] = await Promise.all([
    Promise.all(candidateCopyIds.map((copyId) => db.collection('bookCopies').doc(copyId).get())),
    db.collection('loans').where('memberId', '==', memberId).where('status', '==', 'ACTIVE').get(),
  ]);
  assert.equal(memberLoans.size, 10, 'the member must not exceed ten active loans');
  assert.equal(storedCopies.filter((snapshot) => snapshot.get('status') === 'ON_LOAN').length, 1,
    'only the successful copy transitions to ON_LOAN');
  assert.equal(storedCopies.filter((snapshot) => snapshot.get('status') === 'AVAILABLE').length, 1,
    'the rejected copy remains AVAILABLE');
  const successfulCopyId = outcomes.find((outcome) => outcome.success).copyId;
  const failedCopyId = outcomes.find((outcome) => !outcome.success).copyId;
  const storedById = new Map(storedCopies.map((snapshot) => [snapshot.id, snapshot]));
  assert.equal(storedById.get(successfulCopyId).get('shelfLocation'), null,
    'the successfully borrowed copy must no longer have a shelf location');
  assert.equal(storedById.get(failedCopyId).get('shelfLocation'), 'A1',
    'the copy rejected at the loan limit must retain its original shelf location');
  console.info('Member borrow confirmation Firestore Emulator verification passed.');
} finally {
  await Promise.all([
    db.collection('users').doc(userId).delete(),
    db.collection('books').doc(isbn).delete(),
    ...candidateCopyIds.map((copyId) => db.collection('bookCopies').doc(copyId).delete()),
    ...seededLoanIds.map((loanId) => db.collection('loans').doc(loanId).delete()),
  ]);
  const createdLoans = await db.collection('loans').where('memberId', '==', memberId).get();
  await Promise.all(createdLoans.docs.map((snapshot) => snapshot.ref.delete()));
}

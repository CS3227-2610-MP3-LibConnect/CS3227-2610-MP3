import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
if (
  process.env.NODE_ENV === 'production' ||
  !/^127\.0\.0\.1:\d+$|^localhost:\d+$|^\[::1\]:\d+$/.test(emulatorHost) ||
  !projectId.startsWith('demo-')
) {
  throw new Error(
    'Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.',
  );
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
const isbn = `979${tag.slice(0, 10)}`;
const now = Timestamp.now();
const workflows = new LibraryWorkflows(db);
const book = {
  isbn,
  title: `Atomic Borrow ${tag}`,
  author: 'Transaction Tester',
  publicationYear: 2024,
  publisher: 'Test Press',
  category: 'Fiction',
  synopsis: '',
  createdAt: now,
  updatedAt: now,
};

function member(label) {
  return {
    userId: `user-${label}-${tag}`,
    memberId: `member-${label}-${tag}`,
    accountType: 'MEMBER',
    accountStatus: 'ACTIVE',
  };
}

function copy(copyId, status = 'AVAILABLE') {
  return { copyId, isbn, status, shelfLocation: 'A1', createdAt: now, updatedAt: now };
}

function loan(loanId, actor, index, status = 'ACTIVE') {
  return {
    loanId,
    memberId: actor.memberId,
    copyId: `existing-copy-${actor.memberId}-${index}`,
    isbn,
    bookTitle: book.title,
    borrowDateTime: now,
    dueDate: now,
    returnDateTime: null,
    closureReportType: status === 'PENDING_CLOSE' ? 'RETURNED' : null,
    closureReportedDateTime: status === 'PENDING_CLOSE' ? now : null,
    closureReviewedDateTime: null,
    status,
    isRenewed: false,
  };
}

const raceMember = member('race');
const mixedMember = member('mixed');
const capacityMember = member('capacity');
const successMember = member('success');
const members = [raceMember, mixedMember, capacityMember, successMember];
const raceCopyIds = [`race-a-${tag}`, `race-b-${tag}`];
const mixedCopyIds = [`mixed-stale-${tag}`, `mixed-eligible-${tag}`];
const capacityCopyIds = [`capacity-a-${tag}`, `capacity-b-${tag}`, `capacity-c-${tag}`];
const successCopyIds = [`success-a-${tag}`, `success-b-${tag}`];
const allCopyIds = [...raceCopyIds, ...mixedCopyIds, ...capacityCopyIds, ...successCopyIds];
const seededLoans = [
  ...Array.from({ length: 8 }, (_, index) =>
    loan(`race-active-${tag}-${index}`, raceMember, index),
  ),
  loan(`race-pending-${tag}`, raceMember, 8, 'PENDING_CLOSE'),
  ...Array.from({ length: 8 }, (_, index) =>
    loan(`capacity-active-${tag}-${index}`, capacityMember, index),
  ),
];

try {
  await Promise.all([
    db.collection('books').doc(isbn).set(book),
    ...members.map((actor) =>
      db
        .collection('users')
        .doc(actor.userId)
        .set({ ...actor, updatedAt: now }),
    ),
    ...allCopyIds.map((copyId) =>
      db
        .collection('bookCopies')
        .doc(copyId)
        .set(copy(copyId, copyId === mixedCopyIds[0] ? 'ON_LOAN' : 'AVAILABLE')),
    ),
    ...seededLoans.map((record) => db.collection('loans').doc(record.loanId).set(record)),
  ]);

  const raceResults = await Promise.allSettled(
    raceCopyIds.map((copyId) => workflows.confirmMemberBorrow([copyId], raceMember)),
  );
  assert.equal(
    raceResults.filter((result) => result.status === 'fulfilled').length,
    1,
    'only one concurrent request may use the final open-loan slot',
  );
  assert.equal(
    raceResults.filter(
      (result) =>
        result.status === 'rejected' &&
        result.reason instanceof StorageError &&
        result.reason.code === 'CONFLICT',
    ).length,
    1,
    'the losing request must fail as a whole',
  );
  const raceOpenLoans = await db
    .collection('loans')
    .where('memberId', '==', raceMember.memberId)
    .where('status', 'in', ['ACTIVE', 'PENDING_CLOSE'])
    .get();
  assert.equal(
    raceOpenLoans.size,
    10,
    'ACTIVE and PENDING_CLOSE loans together stay capped at ten',
  );
  const raceCopies = await Promise.all(
    raceCopyIds.map((copyId) => db.collection('bookCopies').doc(copyId).get()),
  );
  assert.equal(raceCopies.filter((snapshot) => snapshot.get('status') === 'ON_LOAN').length, 1);
  assert.equal(raceCopies.filter((snapshot) => snapshot.get('status') === 'AVAILABLE').length, 1);

  await assert.rejects(
    workflows.confirmMemberBorrow(mixedCopyIds, mixedMember),
    (error) => error instanceof StorageError && error.code === 'CONFLICT',
  );
  const mixedEligible = await db.collection('bookCopies').doc(mixedCopyIds[1]).get();
  const mixedLoans = await db
    .collection('loans')
    .where('memberId', '==', mixedMember.memberId)
    .get();
  assert.equal(
    mixedEligible.get('status'),
    'AVAILABLE',
    'an eligible sibling remains unchanged when one copy is stale',
  );
  assert.equal(mixedEligible.get('shelfLocation'), 'A1');
  assert.equal(mixedLoans.size, 0, 'a mixed-invalid batch creates no loans');

  await assert.rejects(
    workflows.confirmMemberBorrow(capacityCopyIds, capacityMember),
    (error) => error instanceof StorageError && error.code === 'CONFLICT',
  );
  const capacityCopies = await Promise.all(
    capacityCopyIds.map((copyId) => db.collection('bookCopies').doc(copyId).get()),
  );
  const capacityLoans = await db
    .collection('loans')
    .where('memberId', '==', capacityMember.memberId)
    .get();
  assert.equal(capacityLoans.size, 8, 'an over-capacity batch creates no loans');
  assert.equal(
    capacityCopies.every((snapshot) => snapshot.get('status') === 'AVAILABLE'),
    true,
  );

  const successfulLoans = await workflows.confirmMemberBorrow(successCopyIds, successMember);
  assert.deepEqual(
    successfulLoans.map((record) => record.copyId),
    successCopyIds,
  );
  const successfulCopies = await Promise.all(
    successCopyIds.map((copyId) => db.collection('bookCopies').doc(copyId).get()),
  );
  assert.equal(
    successfulCopies.every((snapshot) => snapshot.get('status') === 'ON_LOAN'),
    true,
  );
  assert.equal(
    successfulCopies.every((snapshot) => snapshot.get('shelfLocation') === null),
    true,
  );

  console.info('Atomic member borrow confirmation Firestore Emulator verification passed.');
} finally {
  const loanSnapshots = await Promise.all(
    members.map((actor) => db.collection('loans').where('memberId', '==', actor.memberId).get()),
  );
  await Promise.all([
    ...loanSnapshots.flatMap((snapshot) => snapshot.docs.map((document) => document.ref.delete())),
    ...allCopyIds.map((copyId) => db.collection('bookCopies').doc(copyId).delete()),
    ...members.map((actor) => db.collection('users').doc(actor.userId).delete()),
    db.collection('books').doc(isbn).delete(),
  ]);
}

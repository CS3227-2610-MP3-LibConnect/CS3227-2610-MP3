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

const [{ Timestamp }, { db }, { LibraryWorkflows }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../../dist/apps/api/src/storage/firebase.js'),
  import('../../dist/apps/api/src/storage/workflows.js'),
]);

const tag = randomUUID().replaceAll('-', '');
const member = {
  userId: `user-${tag}`,
  memberId: `member-${tag}`,
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
};
const copyId = `copy-${tag}`;
const loanId = `loan-${tag}`;
const now = Timestamp.now();
const priorReturnDateTime = Timestamp.fromMillis(now.toMillis() - 60_000);
const loan = {
  loanId,
  memberId: member.memberId,
  copyId,
  isbn: `isbn-${tag}`,
  bookTitle: `Closure report ${tag}`,
  borrowDateTime: now,
  dueDate: now,
  returnDateTime: priorReturnDateTime,
  closureReportType: null,
  closureReportedDateTime: null,
  closureReviewedDateTime: null,
  status: 'ACTIVE',
  isRenewed: false,
};
const copy = { copyId, isbn: loan.isbn, status: 'ON_LOAN', shelfLocation: null, updatedAt: now };
const workflows = new LibraryWorkflows(db);

try {
  await Promise.all([
    db.collection('loans').doc(loanId).set(loan),
    db.collection('bookCopies').doc(copyId).set(copy),
  ]);
  const attempts = await Promise.allSettled([
    workflows.reportClosure(loanId, 'RETURNED', member),
    workflows.reportClosure(loanId, 'LOST', member),
  ]);
  assert.equal(
    attempts.filter((result) => result.status === 'fulfilled').length,
    1,
    'only one concurrent report should transition the active loan',
  );
  assert.equal(
    attempts.filter((result) => result.status === 'rejected').length,
    1,
    'the competing report should observe the changed loan state',
  );

  const [storedLoan, storedCopy] = await Promise.all([
    db.collection('loans').doc(loanId).get(),
    db.collection('bookCopies').doc(copyId).get(),
  ]);
  assert.equal(storedLoan.get('status'), 'PENDING_CLOSE');
  assert.ok(['RETURNED', 'LOST'].includes(storedLoan.get('closureReportType')));
  assert.ok(storedLoan.get('closureReportedDateTime') instanceof Timestamp);
  assert.equal(
    storedLoan.get('returnDateTime').toMillis(),
    priorReturnDateTime.toMillis(),
    'report submission must preserve returnDateTime',
  );
  assert.equal(storedCopy.get('status'), 'IN_TRANSIT');
  assert.equal(
    storedCopy.get('updatedAt').toMillis(),
    storedLoan.get('closureReportedDateTime').toMillis(),
    'loan and copy must carry the same transition timestamp',
  );
  console.info('Member loan closure report Firestore Emulator verification passed.');
} finally {
  await Promise.all([
    db.collection('loans').doc(loanId).delete(),
    db.collection('bookCopies').doc(copyId).delete(),
  ]);
}

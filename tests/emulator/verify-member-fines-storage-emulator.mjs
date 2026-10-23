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

const [{ Timestamp }, { db }, { LibraryRepository }, { LibraryWorkflows }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../../dist/apps/api/src/storage/firebase.js'),
  import('../../dist/apps/api/src/storage/repositories.js'),
  import('../../dist/apps/api/src/storage/workflows.js'),
]);
const tag = randomUUID().replaceAll('-', '');
const memberId = `fine-member-${tag}`;
const fine = (fineId, status, issuedDateTime) => ({
  fineId,
  loanId: `loan-${fineId}`,
  memberId,
  bookTitle: `Book ${fineId}`,
  amountMinorUnits: 125,
  currency: 'SGD',
  reason: 'Late return',
  status,
  issuedDateTime,
  paidDateTime: null,
  waivedDateTime: null,
});
const sharedTime = Timestamp.fromMillis(1_800_000_000_000);
const refs = [
  db.collection('fines').doc(`fine-${tag}-outstanding`),
  db.collection('fines').doc(`fine-${tag}-paid-a`),
  db.collection('fines').doc(`fine-${tag}-paid-b`),
  db.collection('fines').doc(`fine-${tag}-waived`),
  db.collection('fines').doc(`fine-${tag}-transition-race`),
  db.collection('fines').doc(`fine-${tag}-payment-race`),
];
const actor = { userId: memberId, memberId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const librarian = {
  userId: `librarian-${tag}`,
  employeeId: `employee-${tag}`,
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
};
const repository = new LibraryRepository(db);
const workflows = new LibraryWorkflows(db);

try {
  await Promise.all([
    refs[0].set(fine(refs[0].id, 'OUTSTANDING', sharedTime)),
    refs[1].set(fine(refs[1].id, 'PAID', sharedTime)),
    refs[2].set(fine(refs[2].id, 'PAID', sharedTime)),
    refs[3].set(fine(refs[3].id, 'WAIVED', Timestamp.fromMillis(sharedTime.toMillis() - 1))),
    refs[4].set(fine(refs[4].id, 'OUTSTANDING', sharedTime)),
    refs[5].set(fine(refs[5].id, 'OUTSTANDING', sharedTime)),
  ]);
  const outstanding = await repository.memberFines(actor, 'outstanding', 20);
  assert.deepEqual(
    outstanding.items.map((item) => item.fineId).sort(),
    [refs[0].id, refs[4].id, refs[5].id].sort(),
  );

  const firstPage = await repository.memberFines(actor, 'history', 2);
  assert.deepEqual(
    firstPage.items.map((item) => item.fineId),
    [refs[2].id, refs[1].id],
  );
  assert.ok(firstPage.nextCursor);
  const secondPage = await repository.memberFines(actor, 'history', 2, firstPage.nextCursor);
  assert.deepEqual(
    secondPage.items.map((item) => item.fineId),
    [refs[3].id],
  );
  assert.equal(
    new Set([...firstPage.items, ...secondPage.items].map((item) => item.fineId)).size,
    3,
  );

  const original = (await refs[4].get()).data();
  const transitions = await Promise.allSettled([
    workflows.payFine(refs[4].id, actor),
    workflows.waiveFine(refs[4].id, librarian),
  ]);
  const winners = transitions.flatMap((result, index) =>
    result.status === 'fulfilled' ? [index] : [],
  );
  const losers = transitions.filter((result) => result.status === 'rejected');
  assert.equal(
    winners.length,
    1,
    'exactly one of payment and waiver can transition the outstanding fine',
  );
  assert.equal(losers.length, 1, 'the competing transition must fail');
  assert.equal(
    losers[0].reason?.code,
    'CONFLICT',
    'the competing transition must observe the already transitioned status',
  );
  const after = (await refs[4].get()).data();
  const winningStatus = winners[0] === 0 ? 'PAID' : 'WAIVED';
  assert.equal(after.status, winningStatus, 'stored status must match the successful transition');
  assert.ok(
    after.status === 'PAID'
      ? after.paidDateTime instanceof Timestamp
      : after.waivedDateTime instanceof Timestamp,
  );
  assert.equal(
    after.status === 'PAID' ? after.waivedDateTime : after.paidDateTime,
    null,
    'only the winning transition timestamp is populated',
  );
  for (const field of [
    'fineId',
    'loanId',
    'memberId',
    'bookTitle',
    'amountMinorUnits',
    'currency',
    'reason',
    'issuedDateTime',
  ]) {
    assert.deepEqual(after[field], original[field], `${field} remains unchanged by transition`);
  }
  await assert.rejects(
    workflows.payFine(refs[4].id, actor),
    { code: 'CONFLICT' },
    'a transitioned fine cannot be paid again',
  );

  const paymentRaceOriginal = (await refs[5].get()).data();
  const payments = await Promise.allSettled([
    workflows.payFine(refs[5].id, actor),
    workflows.payFine(refs[5].id, actor),
  ]);
  assert.equal(
    payments.filter((result) => result.status === 'fulfilled').length,
    1,
    'exactly one concurrent payment can transition an outstanding fine',
  );
  const paymentLosers = payments.filter((result) => result.status === 'rejected');
  assert.equal(paymentLosers.length, 1);
  assert.equal(
    paymentLosers[0].reason?.code,
    'CONFLICT',
    'the losing payment sees the transitioned status',
  );
  const afterPaymentRace = (await refs[5].get()).data();
  assert.equal(afterPaymentRace.status, 'PAID');
  assert.ok(afterPaymentRace.paidDateTime instanceof Timestamp);
  assert.equal(afterPaymentRace.waivedDateTime, null);
  for (const field of [
    'fineId',
    'loanId',
    'memberId',
    'bookTitle',
    'amountMinorUnits',
    'currency',
    'reason',
    'issuedDateTime',
  ]) {
    assert.deepEqual(
      afterPaymentRace[field],
      paymentRaceOriginal[field],
      `${field} remains unchanged by concurrent payment`,
    );
  }
  await assert.rejects(
    workflows.payFine(refs[5].id, actor),
    { code: 'CONFLICT' },
    'a paid fine cannot be paid again',
  );
  console.info('Member fine Firestore Emulator query, cursor, and transition verification passed.');
} finally {
  await Promise.all(refs.map((ref) => ref.delete()));
}

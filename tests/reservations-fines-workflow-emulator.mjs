import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { test } from 'node:test';
import { LibraryWorkflows } from '../dist/apps/api/src/storage/workflows.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV === 'production') {
  throw new Error('Run this check with the Firestore Emulator and a non-production environment.');
}

const app = initializeApp(
  { projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-libconnect' },
  'reservations-fines-workflow-test',
);
const db = getFirestore(app);
const workflows = new LibraryWorkflows(db);
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

async function clearDatabase() {
  for (const collection of await db.listCollections()) {
    const snapshot = await collection.get();
    if (snapshot.empty) continue;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

async function putMember() {
  await db.collection('users').doc(member.userId).set(member);
}

test('waiver/payment race has one terminal winner and one consistent record', async () => {
  await clearDatabase();
  await putMember();
  await db.collection('fines').doc('fine-race').set({
    fineId: 'fine-race',
    loanId: 'loan-race',
    memberId: 'MEMBER-1',
    bookTitle: 'Race Book',
    amountMinorUnits: 500,
    currency: 'SGD',
    reason: 'Overdue loan',
    status: 'OUTSTANDING',
    issuedDateTime: Timestamp.now(),
    paidDateTime: null,
    waivedDateTime: null,
  });
  const attempts = await Promise.allSettled([
    workflows.payFine('fine-race', member),
    workflows.waiveFine('fine-race', librarian),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
  const stored = await db.collection('fines').doc('fine-race').get();
  assert.ok(['PAID', 'WAIVED'].includes(stored.get('status')));
  if (stored.get('status') === 'PAID') assert.ok(stored.get('paidDateTime') instanceof Timestamp);
  if (stored.get('status') === 'WAIVED') {
    assert.ok(stored.get('waivedDateTime') instanceof Timestamp);
    assert.equal(
      (await db.collection('notifications').where('referenceId', '==', 'fine-race').get()).size,
      1,
    );
  }
});

test('overdue processing and assigned reservation expiry are bounded and retry-safe', async () => {
  await clearDatabase();
  await putMember();
  const now = Timestamp.fromMillis(Date.parse('2026-10-22T12:00:00.000Z'));
  await db
    .collection('loans')
    .doc('loan-overdue')
    .set({
      loanId: 'loan-overdue',
      memberId: 'MEMBER-1',
      copyId: 'copy-overdue',
      isbn: '978-1',
      bookTitle: 'Overdue Book',
      borrowDateTime: Timestamp.fromMillis(now.toMillis() - 40 * 24 * 60 * 60 * 1000),
      dueDate: Timestamp.fromMillis(now.toMillis() - 73 * 60 * 60 * 1000),
      returnDateTime: null,
      closureReportType: null,
      closureReportedDateTime: null,
      closureReviewedDateTime: null,
      closureReviewDecision: null,
      closureReviewedByUserId: null,
      status: 'ACTIVE',
      isRenewed: false,
    });
  const overdueAttempts = await Promise.all([
    workflows.processOverdue(now, 100),
    workflows.processOverdue(now, 100),
  ]);
  assert.equal((await db.collection('fines').doc('overdue-loan-overdue').get()).exists, true);
  assert.equal(
    (await db.collection('notifications').doc('overdue-alert-loan-overdue').get()).exists,
    true,
  );
  assert.equal((await db.collection('fines').where('loanId', '==', 'loan-overdue').get()).size, 1);
  assert.ok(overdueAttempts.every((result) => result.examined === 1));

  const overdueBatch = db.batch();
  for (let index = 0; index < 101; index += 1) {
    const loanId = `loan-overdue-batch-${String(index).padStart(3, '0')}`;
    overdueBatch.set(db.collection('loans').doc(loanId), {
      loanId,
      memberId: 'MEMBER-1',
      copyId: `copy-${loanId}`,
      isbn: `978-batch-${index}`,
      bookTitle: `Batch Book ${index}`,
      borrowDateTime: now,
      dueDate: Timestamp.fromMillis(now.toMillis() - 80 * 60 * 60 * 1000 + index * 60 * 1000),
      returnDateTime: null,
      closureReportType: null,
      closureReportedDateTime: null,
      closureReviewedDateTime: null,
      closureReviewDecision: null,
      closureReviewedByUserId: null,
      status: 'ACTIVE',
      isRenewed: false,
    });
  }
  await overdueBatch.commit();
  const firstOverduePage = await workflows.processOverdue(now, 100);
  const secondOverduePage = await workflows.processOverdue(now, 100);
  assert.equal(firstOverduePage.examined, 100);
  assert.equal(secondOverduePage.examined, 2);
  assert.equal(
    (await db.collection('fines').doc('overdue-loan-overdue-batch-100').get()).exists,
    true,
  );

  await db.collection('bookCopies').doc('copy-reserved').set({
    copyId: 'copy-reserved',
    isbn: '978-2',
    shelfLocation: 'A-1',
    status: 'RESERVED',
    reservationId: 'reservation-expired',
    updatedAt: now,
  });
  await db
    .collection('reservations')
    .doc('reservation-expired')
    .set({
      reservationId: 'reservation-expired',
      memberId: 'MEMBER-1',
      isbn: '978-2',
      copyId: 'copy-reserved',
      reservationDateTime: Timestamp.fromMillis(now.toMillis() - 20 * 24 * 60 * 60 * 1000),
      expiryDate: Timestamp.fromMillis(now.toMillis() - 1),
      status: 'PENDING',
      updatedAt: now,
    });
  await Promise.all([
    workflows.expireReservations(now, 100),
    workflows.expireReservations(now, 100),
  ]);
  assert.equal(
    (await db.collection('reservations').doc('reservation-expired').get()).get('status'),
    'EXPIRED',
  );
  const copy = await db.collection('bookCopies').doc('copy-reserved').get();
  assert.equal(copy.get('status'), 'AVAILABLE');
  assert.equal(copy.get('reservationId'), null);
});

test('lost-fine and waiver notification references are linked atomically', async () => {
  await clearDatabase();
  await putMember();
  const now = Timestamp.now();
  await db.collection('loans').doc('loan-lost').set({
    loanId: 'loan-lost',
    memberId: 'MEMBER-1',
    copyId: 'copy-lost',
    isbn: '978-3',
    bookTitle: 'Lost Book',
    borrowDateTime: now,
    dueDate: now,
    returnDateTime: null,
    closureReportType: 'LOST',
    closureReportedDateTime: now,
    closureReviewedDateTime: null,
    closureReviewDecision: null,
    closureReviewedByUserId: null,
    status: 'PENDING_CLOSE',
    isRenewed: false,
  });
  await db.collection('bookCopies').doc('copy-lost').set({
    copyId: 'copy-lost',
    isbn: '978-3',
    shelfLocation: 'A-2',
    status: 'IN_TRANSIT',
    reservationId: null,
    updatedAt: now,
  });
  const result = await workflows.reviewClosure('loan-lost', 'CONFIRM', undefined, librarian);
  assert.equal(result.notification.notificationType, 'FINE_ISSUED');
  assert.equal(
    (await db.collection('notifications').doc('fine-issued-lost-loan-lost').get()).get(
      'referenceId',
    ),
    'lost-loan-lost',
  );
  await workflows.waiveFine('lost-loan-lost', librarian);
  assert.equal(
    (await db.collection('notifications').doc('fine-updated-lost-loan-lost').get()).get(
      'notificationType',
    ),
    'FINE_UPDATED',
  );
});

test('automatic reservation notifications persist for inactive members and validate existing records', async () => {
  await clearDatabase();
  const now = Timestamp.now();
  await db.collection('users').doc('inactive-reservation-user').set({
    userId: 'inactive-reservation-user',
    accountType: 'MEMBER',
    accountStatus: 'INACTIVE',
    memberId: 'MEMBER-INACTIVE',
  });
  await db.collection('loans').doc('loan-reserved-inactive').set({
    loanId: 'loan-reserved-inactive',
    memberId: 'MEMBER-1',
    copyId: 'copy-reserved-inactive',
    isbn: '978-inactive',
    bookTitle: 'Inactive Reservation Book',
    borrowDateTime: now,
    dueDate: now,
    returnDateTime: null,
    closureReportType: 'RETURNED',
    closureReportedDateTime: now,
    closureReviewedDateTime: null,
    closureReviewDecision: null,
    closureReviewedByUserId: null,
    status: 'PENDING_CLOSE',
    isRenewed: false,
  });
  await db.collection('bookCopies').doc('copy-reserved-inactive').set({
    copyId: 'copy-reserved-inactive',
    isbn: '978-inactive',
    shelfLocation: 'A-3',
    status: 'IN_TRANSIT',
    reservationId: null,
    updatedAt: now,
  });
  await db.collection('reservations').doc('reservation-inactive').set({
    reservationId: 'reservation-inactive',
    memberId: 'MEMBER-INACTIVE',
    isbn: '978-inactive',
    copyId: null,
    reservationDateTime: now,
    expiryDate: null,
    status: 'PENDING',
    updatedAt: now,
  });
  const result = await workflows.reviewClosure(
    'loan-reserved-inactive',
    'CONFIRM',
    'RESERVED',
    librarian,
  );
  assert.equal(result.notification.recipientUserId, 'inactive-reservation-user');
  assert.equal(
    (await db.collection('notifications').doc('reservation-ready-reservation-inactive').get())
      .exists,
    true,
  );

  await clearDatabase();
  await db.collection('users').doc('member-user-1').set(member);
  await db.collection('loans').doc('loan-malformed-ready').set({
    loanId: 'loan-malformed-ready',
    memberId: 'MEMBER-1',
    copyId: 'copy-malformed-ready',
    isbn: '978-malformed',
    bookTitle: 'Malformed Ready Book',
    borrowDateTime: now,
    dueDate: now,
    returnDateTime: null,
    closureReportType: 'RETURNED',
    closureReportedDateTime: now,
    closureReviewedDateTime: null,
    closureReviewDecision: null,
    closureReviewedByUserId: null,
    status: 'PENDING_CLOSE',
    isRenewed: false,
  });
  await db.collection('bookCopies').doc('copy-malformed-ready').set({
    copyId: 'copy-malformed-ready',
    isbn: '978-malformed',
    shelfLocation: 'A-4',
    status: 'IN_TRANSIT',
    reservationId: null,
    updatedAt: now,
  });
  await db.collection('reservations').doc('reservation-malformed-ready').set({
    reservationId: 'reservation-malformed-ready',
    memberId: 'MEMBER-1',
    isbn: '978-malformed',
    copyId: null,
    reservationDateTime: now,
    expiryDate: null,
    status: 'PENDING',
    updatedAt: now,
  });
  await db.collection('notifications').doc('reservation-ready-reservation-malformed-ready').set({
    notificationId: 'reservation-ready-reservation-malformed-ready',
    recipientUserId: 'member-user-1',
    notificationType: 'FINE_ISSUED',
    referenceType: 'FINE',
    referenceId: 'wrong-fine',
    message: 'wrong',
    createdAt: now,
    read: false,
  });
  await assert.rejects(
    () => workflows.reviewClosure('loan-malformed-ready', 'CONFIRM', 'RESERVED', librarian),
    /conflicting reservation notification/,
  );
  assert.equal(
    (await db.collection('loans').doc('loan-malformed-ready').get()).get('status'),
    'PENDING_CLOSE',
  );
});

test('librarian messages resolve active members and replay idempotently', async () => {
  await clearDatabase();
  await putMember();
  await db.collection('users').doc('inactive-member-user').set({
    userId: 'inactive-member-user',
    accountType: 'MEMBER',
    accountStatus: 'INACTIVE',
    memberId: 'MEMBER-INACTIVE',
  });
  const first = await workflows.sendLibrarianMessage(
    { memberId: 'MEMBER-1', message: 'Please visit the library.' },
    librarian,
    'message-2026-10-22-0001',
  );
  const replay = await workflows.sendLibrarianMessage(
    { memberId: 'MEMBER-1', message: 'Please visit the library.' },
    librarian,
    'message-2026-10-22-0001',
  );
  assert.equal(first.notification.notificationId, replay.notification.notificationId);
  assert.equal(
    (
      await db
        .collection('notifications')
        .where('notificationType', '==', 'LIBRARIAN_MESSAGE')
        .get()
    ).size,
    1,
  );
  await db
    .collection('users')
    .doc(member.userId)
    .set({ ...member, accountStatus: 'INACTIVE' });
  const inactiveReplay = await workflows.sendLibrarianMessage(
    { memberId: 'MEMBER-1', message: 'Please visit the library.' },
    librarian,
    'message-2026-10-22-0001',
  );
  assert.equal(inactiveReplay.notification.notificationId, first.notification.notificationId);
  await db.collection('users').doc(member.userId).set(member);
  await assert.rejects(
    () =>
      workflows.sendLibrarianMessage(
        { memberId: 'MEMBER-1', message: 'Different text.' },
        librarian,
        'message-2026-10-22-0001',
      ),
    /different message/,
  );
  await assert.rejects(
    () =>
      workflows.sendLibrarianMessage(
        { memberId: 'MEMBER-INACTIVE', message: 'Please visit.' },
        librarian,
        'message-2026-10-22-0002',
      ),
    /active members/,
  );
  const old = Timestamp.fromMillis(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await db
    .collection('notificationIdempotency')
    .doc((await db.collection('notificationIdempotency').get()).docs[0].id)
    .update({ createdAt: old, expiresAt: old });
  const afterExpiry = await workflows.sendLibrarianMessage(
    { memberId: 'MEMBER-1', message: 'A new message after retention.' },
    librarian,
    'message-2026-10-22-0001',
  );
  assert.notEqual(afterExpiry.notification.notificationId, first.notification.notificationId);
  const idempotencyDocs = await db.collection('notificationIdempotency').get();
  assert.equal(
    idempotencyDocs.docs.some((document) =>
      JSON.stringify(document.data()).includes('message-2026-10-22-0001'),
    ),
    false,
  );
});

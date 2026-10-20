import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? '';
if (process.env.NODE_ENV === 'production' || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulatorHost) || !projectId.startsWith('demo-')) {
  throw new Error('Run this check with a local Firestore Emulator, a demo-* project ID, and a non-production environment.');
}

const [{ FieldPath, Timestamp }, { db }, { LibraryRepository }] = await Promise.all([
  import('firebase-admin/firestore'),
  import('../dist/apps/api/src/storage/firebase.js'),
  import('../dist/apps/api/src/storage/repositories.js'),
]);

const tag = randomUUID().replaceAll('-', '');
const memberId = `reservation-index-${tag}`;
const pageMemberId = `${memberId}-pages`;
const isbn = `reservation-index-${tag}`;
const refs = ['pending', 'fulfilled', 'cancelled', 'expired'].map((id) => db.collection('reservations').doc(`${tag}-${id}`));
const pageRefs = ['page-a', 'page-b', 'page-c', 'page-d'].map((id) => db.collection('reservations').doc(`${tag}-${id}`));
const bookRef = db.collection('books').doc(isbn);
const pageBookRef = db.collection('books').doc(`reservation-page-${tag}`);
const now = Timestamp.now();

try {
  await Promise.all(refs.map((ref, index) => ref.set({
    reservationId: ref.id,
    memberId,
    isbn,
    copyId: null,
    reservationDateTime: Timestamp.fromMillis(now.toMillis() + index),
    expiryDate: null,
    status: ['PENDING', 'FULFILLED', 'CANCELLED', 'EXPIRED'][index],
  })));
  await pageBookRef.set({
    isbn: pageBookRef.id, title: 'Reservation pagination fixture', author: 'Emulator Verifier', publicationYear: 2024,
    publisher: 'Test Press', category: 'Fiction', synopsis: '', createdAt: now, updatedAt: now,
  });
  await Promise.all(pageRefs.map((ref) => ref.set({
    reservationId: ref.id, memberId: pageMemberId, isbn: pageBookRef.id, status: 'PENDING',
    reservationDateTime: now, copyId: null, expiryDate: null,
  })));

  const repository = new LibraryRepository(db);
  const member = { userId: `reservation-user-${tag}`, memberId: pageMemberId, accountType: 'MEMBER', accountStatus: 'ACTIVE' };
  const pagedIds = [];
  let cursor;
  do {
    const page = await repository.memberReservations(member, 'pending', 2, cursor);
    assert.ok(page.items.length <= 2, 'repository must return at most the requested page size');
    assert.ok(page.items.every(({ bookTitle }) => bookTitle === 'Reservation pagination fixture'));
    pagedIds.push(...page.items.map(({ reservationId }) => reservationId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(pagedIds, pageRefs.map(({ id }) => id).sort().reverse(),
    'equal timestamp pages must follow descending document ID with no skipped or repeated records');

  const collection = db.collection('reservations');
  const queryView = (statuses) => collection.where('memberId', '==', memberId)
    .where('status', 'in', statuses)
    .orderBy('reservationDateTime', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  const [pending, history] = await Promise.all([
    queryView(['PENDING']).limit(2).get(),
    queryView(['FULFILLED', 'CANCELLED', 'EXPIRED']).limit(4).get(),
  ]);
  assert.deepEqual(pending.docs.map((doc) => doc.get('status')), ['PENDING']);
  assert.deepEqual(new Set(history.docs.map((doc) => doc.get('status'))), new Set(['FULFILLED', 'CANCELLED', 'EXPIRED']));
  const assignmentQueue = await new LibraryRepository(db).pendingReservations(isbn, {
    userId: `reservation-librarian-${tag}`, accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', employeeId: `employee-${tag}`,
  });
  assert.deepEqual(assignmentQueue.map(({ status }) => status), ['PENDING']);
  console.info('Member reservation list and librarian assignment query shapes executed in the Firestore Emulator.');
} finally {
  await Promise.all([...refs, ...pageRefs].map((ref) => ref.delete()));
  await bookRef.delete();
  await pageBookRef.delete();
}

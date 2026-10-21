import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../dist/apps/api/src/storage/firebase.js';
import { LibraryRepository, StorageError } from '../dist/apps/api/src/storage/repositories.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV === 'production') {
  throw new Error('Run this check with the Firestore Emulator and a non-production environment.');
}

const runId = randomUUID();
const actor = {
  userId: `librarian-${runId}`,
  name: 'Catalog Test Librarian',
  email: `${runId}@example.test`,
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
  employeeId: `EMP-${runId}`,
  isManager: false,
};
const repository = new LibraryRepository(db);
const bookIsbn = `978-${runId.replaceAll('-', '').slice(0, 10)}`;
const bookRef = db.collection('books').doc(bookIsbn);
const extraBookRefs = [];
const copyIds = [];
const loanIds = [];
const reservationIds = [];

function expectStorageError(code) {
  return (error) => error instanceof StorageError && error.code === code;
}

async function setCopy(copyId, status) {
  const now = Timestamp.now();
  copyIds.push(copyId);
  await db.collection('bookCopies').doc(copyId).set({
    copyId, isbn: bookIsbn, shelfLocation: `TEST-${copyId}`, status,
    createdAt: now, updatedAt: now,
  });
}

try {
  await repository.createBook({
    isbn: bookIsbn, title: 'Emulator Book', author: ['Author One', 'Author Two'],
    publicationYear: 2026, publisher: 'Test Publisher', category: 'Testing', synopsis: 'A test book',
  }, actor);
  await assert.rejects(
    repository.createBook({
      isbn: bookIsbn, title: 'Duplicate', author: 'Author', publicationYear: 2026,
      publisher: 'Test Publisher', category: 'Testing', synopsis: '',
    }, actor),
    expectStorageError('CONFLICT'),
  );

  const createdCopy = await repository.createCopy({ copyId: `copy-${runId}-parent`, isbn: bookIsbn, shelfLocation: 'SHELF-A' }, actor);
  copyIds.push(createdCopy.copyId);
  assert.equal(createdCopy.status, 'AVAILABLE');
  const updatedCopy = await repository.updateCopy(createdCopy.copyId, 'SHELF-B', actor);
  assert.equal(updatedCopy.shelfLocation, 'SHELF-B');
  assert.equal(updatedCopy.status, 'AVAILABLE');
  await bookRef.set({ passwordHash: 'CANARY' }, { merge: true });
  await db.collection('bookCopies').doc(createdCopy.copyId).set({ sessionId: 'CANARY' }, { merge: true });
  const searchedBooks = await repository.searchBooks({ title: 'Emulator Book', author: 'Author One' });
  const searchedCopies = await repository.searchCopies({ isbn: bookIsbn });
  assert.equal(searchedBooks.items[0].passwordHash, undefined);
  assert.equal(searchedCopies.items[0].sessionId, undefined);

  const cursorBookIsbn = `978-${runId.replaceAll('-', '').slice(30, 40)}`;
  const cursorBookRef = db.collection('books').doc(cursorBookIsbn);
  extraBookRefs.push(cursorBookRef);
  await repository.createBook({
    isbn: cursorBookIsbn, title: 'Emulator Book', author: ['Author One'], publicationYear: 2026,
    publisher: 'Test Publisher', category: 'Testing', synopsis: '',
  }, actor);
  const firstSearchPage = await repository.searchBooks({ title: 'Emulator Book', author: 'Author One' }, 1);
  assert.ok(firstSearchPage.nextCursor);
  const secondSearchPage = await repository.searchBooks({ author: 'Author One', title: 'Emulator Book' }, 1, firstSearchPage.nextCursor);
  assert.equal(secondSearchPage.items.length, 1);
  assert.notEqual(secondSearchPage.items[0].isbn, firstSearchPage.items[0].isbn);
  await assert.rejects(
    repository.updateBook(bookIsbn, { isbn: 'forged-isbn' }, actor),
    expectStorageError('INVALID'),
  );
  const unchangedBook = await repository.getBook(bookIsbn);
  assert.equal(unchangedBook.isbn, bookIsbn);

  const missingCopyId = `copy-${runId}-missing-parent`;
  await assert.rejects(
    repository.createCopy({ copyId: missingCopyId, isbn: `missing-${runId}`, shelfLocation: 'SHELF-X' }, actor),
    expectStorageError('NOT_FOUND'),
  );
  assert.equal((await db.collection('bookCopies').doc(missingCopyId).get()).exists, false);

  await assert.rejects(repository.deleteBook(bookIsbn, actor), expectStorageError('CONFLICT'));

  const activeLoanCopy = `copy-${runId}-active-loan`;
  await setCopy(activeLoanCopy, 'DAMAGED');
  const loanId = `loan-${runId}`;
  loanIds.push(loanId);
  await db.collection('loans').doc(loanId).set({ copyId: activeLoanCopy, status: 'ACTIVE' });
  await assert.rejects(repository.deleteCopy(activeLoanCopy, actor), expectStorageError('CONFLICT'));
  assert.equal((await db.collection('bookCopies').doc(activeLoanCopy).get()).exists, true);
  await db.collection('loans').doc(loanId).delete();

  const activeReservationCopy = `copy-${runId}-active-reservation`;
  await setCopy(activeReservationCopy, 'LOST');
  const reservationId = `reservation-${runId}`;
  reservationIds.push(reservationId);
  await db.collection('reservations').doc(reservationId).set({ copyId: activeReservationCopy, status: 'PENDING' });
  await assert.rejects(repository.deleteCopy(activeReservationCopy, actor), expectStorageError('CONFLICT'));
  assert.equal((await db.collection('bookCopies').doc(activeReservationCopy).get()).exists, true);
  await db.collection('reservations').doc(reservationId).delete();

  for (const status of ['IN_TRANSIT', 'ON_LOAN', 'RESERVED']) {
    const copyId = `copy-${runId}-${status.toLowerCase()}`;
    await setCopy(copyId, status);
    await assert.rejects(repository.deleteCopy(copyId, actor), expectStorageError('CONFLICT'));
    assert.equal((await db.collection('bookCopies').doc(copyId).get()).exists, true);
  }

  const eligibleCopy = `copy-${runId}-eligible`;
  await setCopy(eligibleCopy, 'LOST');
  await repository.deleteCopy(eligibleCopy, actor);
  assert.equal((await db.collection('bookCopies').doc(eligibleCopy).get()).exists, false);

  const summary = await repository.inventorySummary(actor);
  assert.equal(summary.totalTitles >= 1, true);
  assert.equal(summary.totalCopies >= 1, true);
  assert.equal(summary.byStatus.AVAILABLE >= 1, true);
  assert.deepEqual(Object.keys(summary.byStatus).sort(), ['AVAILABLE', 'DAMAGED', 'IN_TRANSIT', 'LOST', 'ON_LOAN', 'RESERVED']);

  const concurrentBookIsbn = `978-${runId.replaceAll('-', '').slice(10, 20)}`;
  const concurrentBookRef = db.collection('books').doc(concurrentBookIsbn);
  extraBookRefs.push(concurrentBookRef);
  await repository.createBook({
    isbn: concurrentBookIsbn, title: 'Concurrent Book', author: 'Author', publicationYear: 2026,
    publisher: 'Test Publisher', category: 'Testing', synopsis: '',
  }, actor);
  const concurrentCopyId = `copy-${runId}-concurrent-create`;
  copyIds.push(concurrentCopyId);
  const bookRace = await Promise.allSettled([
    repository.deleteBook(concurrentBookIsbn, actor),
    repository.createCopy({ copyId: concurrentCopyId, isbn: concurrentBookIsbn, shelfLocation: 'RACE-SHELF' }, actor),
  ]);
  assert.equal(bookRace.filter((result) => result.status === 'fulfilled').length, 1);
  const bookAfterRace = await concurrentBookRef.get();
  const copyAfterBookRace = await db.collection('bookCopies').doc(concurrentCopyId).get();
  assert.equal(bookAfterRace.exists, copyAfterBookRace.exists);
  if (bookAfterRace.exists) assert.equal(copyAfterBookRace.get('isbn'), concurrentBookIsbn);

  const statusRaceCopyId = `copy-${runId}-concurrent-status`;
  await setCopy(statusRaceCopyId, 'AVAILABLE');
  const statusRaceRef = db.collection('bookCopies').doc(statusRaceCopyId);
  const statusRace = await Promise.allSettled([
    repository.deleteCopy(statusRaceCopyId, actor),
    db.runTransaction(async (tx) => {
      const snapshot = await tx.get(statusRaceRef);
      if (!snapshot.exists) throw new Error('Copy was deleted before the status transaction read it.');
      tx.update(statusRaceRef, { status: 'ON_LOAN', updatedAt: Timestamp.now() });
    }),
  ]);
  assert.equal(statusRace.filter((result) => result.status === 'fulfilled').length, 1);
  const copyAfterStatusRace = await statusRaceRef.get();
  if (copyAfterStatusRace.exists) assert.equal(copyAfterStatusRace.get('status'), 'ON_LOAN');

  const emptyBookIsbn = `978-${runId.replaceAll('-', '').slice(20, 30)}`;
  const emptyBookRef = db.collection('books').doc(emptyBookIsbn);
  extraBookRefs.push(emptyBookRef);
  await repository.createBook({
    isbn: emptyBookIsbn, title: 'Empty Book', author: 'Author', publicationYear: 0,
    publisher: 'Test Publisher', category: 'Testing', synopsis: '',
  }, actor);
  await repository.deleteBook(emptyBookIsbn, actor);
  assert.equal((await db.collection('books').doc(emptyBookIsbn).get()).exists, false);

  console.info('Catalog repository emulator verification passed: CRUD, immutable fields, parent/deletion guards, status conflicts, summary, non-cascading book deletion, and concurrency races are enforced.');
}
finally {
  await Promise.all([
    bookRef.delete(),
    ...extraBookRefs.map((ref) => ref.delete()),
    ...copyIds.map((copyId) => db.collection('bookCopies').doc(copyId).delete()),
    ...loanIds.map((loanId) => db.collection('loans').doc(loanId).delete()),
    ...reservationIds.map((reservationId) => db.collection('reservations').doc(reservationId).delete()),
  ]);
}

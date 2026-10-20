import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { LibraryWorkflows } from '../../dist/apps/api/src/storage/workflows.js';
import { LibraryRepository, StorageError } from '../../dist/apps/api/src/storage/repositories.js';
import { BookCopyRecordSchema, LoanRecordSchema } from '../../dist/packages/shared/src/domain/records.js';

class Snapshot {
  constructor(id, value) { this.id = id; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
  get(field) { return this.value?.[field]; }
}

function cloneFirestoreValue(value) {
  if (value instanceof Timestamp) return Timestamp.fromMillis(value.toMillis());
  if (Array.isArray(value)) return value.map(cloneFirestoreValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneFirestoreValue(item)]));
  }
  return value;
}

class Query {
  constructor(records, filters = [], ordering = []) { this.records = records; this.filters = filters; this.ordering = ordering; }
  where(field, operator, value) {
    assert.equal(operator, '==');
    return new Query(this.records, [...this.filters, [field, value]], this.ordering);
  }
  orderBy(field, direction) {
    if (field === 'borrowDateTime') {
      assert.equal(field, 'borrowDateTime');
      assert.equal(direction, 'desc');
    }
    return new Query(this.records, this.filters, [...this.ordering, [field, direction ?? 'asc']]);
  }
  limit() { return this; }
  async get() {
    const docs = [...this.records.entries()]
      .filter(([, value]) => this.filters.every(([field, expected]) => value[field] === expected))
      .map(([id, value]) => new Snapshot(id, value));
    for (const [field, direction] of [...this.ordering].reverse()) {
      if (typeof field !== 'string') continue;
      docs.sort((left, right) => {
        const leftValue = left.get(field);
        const rightValue = right.get(field);
        const comparison = leftValue?.toMillis && rightValue?.toMillis
          ? leftValue.toMillis() - rightValue.toMillis()
          : String(leftValue ?? '').localeCompare(String(rightValue ?? ''));
        return direction === 'desc' ? -comparison : comparison;
      });
    }
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  records = new Map(['users', 'books', 'bookCopies', 'loans', 'reservations', 'notifications'].map((name) => [name, new Map()]));
  transactionTail = Promise.resolve();
  collection(name) {
    const records = this.records.get(name) ?? new Map();
    this.records.set(name, records);
    const reference = (id) => ({
      id,
      get: async () => new Snapshot(id, records.get(id)),
      set: async (value) => records.set(id, structuredClone(value)),
      delete: async () => records.delete(id),
      collectionName: name,
      records,
    });
    return {
      doc: reference,
      where: (field, operator, value) => new Query(records).where(field, operator, value),
    };
  }
  async runTransaction(callback) {
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const writes = [];
      const tx = {
        get: async (target) => {
          if (target instanceof Query) return target.get();
          return new Snapshot(target.id, target.records.get(target.id));
        },
        create: (ref, value) => writes.push(() => {
          if (ref.records.has(ref.id)) throw new Error(`Document ${ref.id} already exists`);
          ref.records.set(ref.id, cloneFirestoreValue(value));
        }),
        update: (ref, value) => writes.push(() => {
          const current = ref.records.get(ref.id);
          if (!current) throw new Error(`Document ${ref.id} does not exist`);
          ref.records.set(ref.id, { ...current, ...cloneFirestoreValue(value) });
        }),
      };
      const result = await callback(tx);
      for (const write of writes) write();
      return result;
    }
    finally { release(); }
  }
}

const member = { userId: 'user-member', memberId: 'member-1', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const librarian = { userId: 'user-librarian', employeeId: 'employee-1', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE' };
const inactiveMember = { ...member, accountStatus: 'INACTIVE' };
const missingMemberId = { userId: 'user-no-member-id', accountType: 'MEMBER', accountStatus: 'ACTIVE' };
const now = Timestamp.now();
const book = {
  isbn: 'isbn-1', title: 'Test Book', author: 'Test Author', publicationYear: 2024,
  publisher: 'Test Press', category: 'Fiction', synopsis: '', createdAt: now, updatedAt: now,
};
const copy = {
  copyId: 'copy-available', isbn: book.isbn, status: 'AVAILABLE', shelfLocation: 'A1', createdAt: now, updatedAt: now,
};

function setup({ loans = [] } = {}) {
  const db = new MemoryFirestore();
  db.records.get('users').set(member.userId, { ...member, updatedAt: now });
  db.records.get('books').set(book.isbn, structuredClone(book));
  for (const value of loans) db.records.get('loans').set(value.loanId, structuredClone(value));
  db.records.get('bookCopies').set(copy.copyId, structuredClone(copy));
  db.records.get('bookCopies').set('copy-reserved', structuredClone({ ...copy, copyId: 'copy-reserved', status: 'RESERVED', reservationId: 'reservation-1' }));
  db.records.get('bookCopies').set('copy-damaged', structuredClone({ ...copy, copyId: 'copy-damaged', status: 'DAMAGED' }));
  return { db, workflows: new LibraryWorkflows(db) };
}

function reservationsSetup({ copies = [copy], reservations = [] } = {}) {
  const { db, workflows } = setup();
  db.records.get('bookCopies').clear();
  for (const value of copies) db.records.get('bookCopies').set(value.copyId, cloneFirestoreValue(value));
  for (const value of reservations) db.records.get('reservations').set(value.reservationId, cloneFirestoreValue(value));
  return { db, workflows };
}

function reservation(reservationId, memberId, isbn = book.isbn, status = 'PENDING') {
  return { reservationId, memberId, isbn, status, reservationDateTime: now, copyId: null, expiryDate: null };
}

test('member pending reservation lookup returns only the actor’s pending reservation and requires active member access', async () => {
  const own = reservation('own-reservation', member.memberId);
  const other = reservation('other-reservation', 'member-2');
  const { workflows } = reservationsSetup({ reservations: [own, other] });
  assert.deepEqual(await workflows.memberReservation(book.isbn, member), own);
  assert.equal(await workflows.memberReservation('isbn-without-reservation', member), null);
  for (const actor of [undefined, librarian, inactiveMember, missingMemberId]) {
    await assert.rejects(workflows.memberReservation(book.isbn, actor), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  }
});

test('member reservation creation uses the authenticated member ID and creates a pending unassigned record without assignment or notification', async () => {
  const { db, workflows } = reservationsSetup({ copies: [{ ...copy, status: 'ON_LOAN' }] });
  const before = Date.now();
  const created = await workflows.createMemberReservation(book.isbn, member);
  assert.equal(created.memberId, member.memberId);
  assert.equal(created.isbn, book.isbn);
  assert.equal(created.status, 'PENDING');
  assert.ok(created.reservationDateTime instanceof Timestamp);
  assert.ok(created.reservationDateTime.toMillis() >= before);
  assert.equal(created.copyId, null);
  assert.equal(created.expiryDate, null);
  assert.equal(db.records.get('reservations').size, 1);
  assert.equal(db.records.get('notifications').size, 0);
  assert.equal(db.records.get('bookCopies').get(copy.copyId).status, 'ON_LOAN');
});

test('reservation creation permits a title with no copies or only unavailable copies', async () => {
  const noCopies = reservationsSetup({ copies: [] });
  assert.equal((await noCopies.workflows.createMemberReservation(book.isbn, member)).status, 'PENDING');
  const unavailable = reservationsSetup({ copies: [{ ...copy, status: 'DAMAGED' }] });
  assert.equal((await unavailable.workflows.createMemberReservation(book.isbn, member)).status, 'PENDING');
});

test('reservation creation rejects unknown ISBN and any title with an AVAILABLE copy', async () => {
  const { workflows } = reservationsSetup({ copies: [copy, { ...copy, copyId: 'copy-on-loan', status: 'ON_LOAN' }] });
  await assert.rejects(workflows.createMemberReservation('unknown-isbn', member), (error) => error instanceof StorageError && error.code === 'NOT_FOUND');
  await assert.rejects(workflows.createMemberReservation(book.isbn, member), (error) => error instanceof StorageError && error.code === 'CONFLICT');
});

test('sequential and concurrent member requests create exactly one pending reservation', async () => {
  const { db, workflows } = reservationsSetup({ copies: [{ ...copy, status: 'ON_LOAN' }] });
  await workflows.createMemberReservation(book.isbn, member);
  await assert.rejects(workflows.createMemberReservation(book.isbn, member), (error) => error instanceof StorageError && error.code === 'CONFLICT');
  db.records.get('reservations').clear();
  const outcomes = await Promise.allSettled([
    workflows.createMemberReservation(book.isbn, member),
    workflows.createMemberReservation(book.isbn, member),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal([...db.records.get('reservations').values()].filter((value) => value.memberId === member.memberId && value.isbn === book.isbn && value.status === 'PENDING').length, 1);
});

test('member reservation creation rechecks the last AVAILABLE copy when concurrent with borrowing', async () => {
  const { db, workflows } = reservationsSetup();
  const outcomes = await Promise.allSettled([
    workflows.createMemberReservation(book.isbn, member),
    workflows.confirmMemberBorrow([copy.copyId], member),
  ]);
  const reservationResult = outcomes[0];
  const borrowResult = outcomes[1];
  assert.equal(borrowResult.status, 'fulfilled');
  if (reservationResult.status === 'rejected') {
    assert.equal(reservationResult.reason instanceof StorageError, true);
    assert.equal(successful(borrowResult.value[0]), true);
  }
  if (reservationResult.status === 'fulfilled') {
    assert.equal(reservationResult.value.status, 'PENDING');
    assert.equal(successful(borrowResult.value[0]), true, 'a borrow may follow reservation creation in the serialized order');
  }
  assert.equal(db.records.get('reservations').size, reservationResult.status === 'fulfilled' ? 1 : 0);
  if (reservationResult.status === 'rejected') assert.equal(db.records.get('bookCopies').get(copy.copyId).status, 'ON_LOAN');
});

test('member reservation workflow does not weaken librarian-only repository creation', async () => {
  const { db } = reservationsSetup({ copies: [{ ...copy, status: 'ON_LOAN' }] });
  const repository = new LibraryRepository(db);
  await assert.rejects(repository.createReservation({
    reservationId: 'repository-reservation', memberId: member.memberId, isbn: book.isbn,
    status: 'PENDING', reservationDateTime: now, copyId: null, expiryDate: null,
  }, member), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
});

function loan(loanId, memberId, status = 'ACTIVE') { return { loanId, memberId, status }; }

function outcomesFor(result) {
  assert.ok(Array.isArray(result), 'confirmation returns one outcome per submitted copy');
  return result;
}
function successful(outcome) {
  return outcome.success === true || ['SUCCESS', 'BORROWED'].includes(outcome.status);
}
function failureReason(outcome) {
  return outcome.reason ?? outcome.message ?? outcome.error;
}

test('member loan listing reads only the actor’s loans and returns an allowlisted summary', async () => {
  const ownLoan = {
    loanId: 'owned-loan', memberId: member.memberId, copyId: 'private-copy-id', isbn: book.isbn,
    bookTitle: 'Owned book', borrowDateTime: Timestamp.fromDate(new Date('2026-10-18T00:00:00.000Z')),
    dueDate: Timestamp.fromDate(new Date('2026-11-20T00:00:00.000Z')),
    status: 'ACTIVE', returnDateTime: null, closureReportType: null,
    closureReportedDateTime: null, closureReviewedDateTime: null, isRenewed: false,
    createdBy: 'internal-user',
  };
  const foreignLoan = {
    ...ownLoan, loanId: 'foreign-loan', memberId: 'another-member', bookTitle: 'Foreign book',
  };
  const newerLoan = {
    ...ownLoan, loanId: 'newer-loan', bookTitle: 'Newer book',
    borrowDateTime: Timestamp.fromDate(new Date('2026-10-19T00:00:00.000Z')),
    status: 'PENDING_CLOSE', closureReportType: 'LOST',
    closureReportedDateTime: Timestamp.fromDate(new Date('2026-10-19T01:00:00.000Z')),
  };
  const { db, workflows } = setup({ loans: [ownLoan, foreignLoan, newerLoan] });
  db.records.get('loans').set(ownLoan.loanId, ownLoan);
  db.records.get('loans').set(foreignLoan.loanId, foreignLoan);
  db.records.get('loans').set(newerLoan.loanId, newerLoan);
  const copiesBefore = structuredClone([...db.records.get('bookCopies').entries()]);

  assert.deepEqual(await workflows.memberLoans(member), [{
    loanId: 'newer-loan', bookTitle: 'Newer book', dueDate: ownLoan.dueDate,
    status: 'PENDING_CLOSE', returnDateTime: null, closureReportType: 'LOST', isRenewed: false,
  }, {
    loanId: 'owned-loan', bookTitle: 'Owned book', dueDate: ownLoan.dueDate,
    status: 'ACTIVE', returnDateTime: null, closureReportType: null, isRenewed: false,
  }]);
  const summary = JSON.stringify(await workflows.memberLoans(member));
  assert.equal(summary.includes('memberId'), false);
  assert.equal(summary.includes('copyId'), false);
  assert.deepEqual([...db.records.get('bookCopies').entries()], copiesBefore);
  assert.deepEqual([...db.records.get('loans').keys()].sort(), ['foreign-loan', 'newer-loan', 'owned-loan']);
  await assert.rejects(workflows.memberLoans(librarian), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
});

function renewalLoan(overrides = {}) {
  return {
    loanId: 'renewal-loan', memberId: member.memberId, copyId: copy.copyId, isbn: book.isbn,
    bookTitle: book.title, borrowDateTime: Timestamp.fromDate(new Date('2026-10-01T00:00:00.000Z')),
    dueDate: Timestamp.fromDate(new Date('2026-10-25T05:30:00.000Z')),
    status: 'ACTIVE', returnDateTime: null, closureReportType: null,
    closureReportedDateTime: null, closureReviewedDateTime: null, isRenewed: false,
    ...overrides,
  };
}

function renewalSetup(loans) {
  const result = setup({ loans });
  for (const value of loans) result.db.records.get('loans').set(value.loanId, cloneFirestoreValue(value));
  return result;
}

function closureLoan(overrides = {}) {
  return {
    loanId: 'closure-loan', memberId: member.memberId, copyId: copy.copyId, isbn: book.isbn,
    bookTitle: book.title, borrowDateTime: Timestamp.fromDate(new Date('2026-10-01T00:00:00.000Z')),
    dueDate: Timestamp.fromDate(new Date('2026-10-31T00:00:00.000Z')),
    returnDateTime: null, closureReportType: null, closureReportedDateTime: null,
    closureReviewedDateTime: null, status: 'ACTIVE', isRenewed: false,
    ...overrides,
  };
}

function closureSetup({ loan = closureLoan(), copyState = 'ON_LOAN' } = {}) {
  const result = setup({ loans: [loan] });
  result.db.records.get('loans').set(loan.loanId, cloneFirestoreValue(loan));
  result.db.records.get('bookCopies').set(copy.copyId, cloneFirestoreValue({ ...copy, status: copyState, shelfLocation: null }));
  return result;
}

test('closure report atomically moves the owned ACTIVE loan and ON_LOAN copy into review without setting a return time', async () => {
  const existingReturnDateTime = Timestamp.fromDate(new Date('2026-10-19T04:00:00.000Z'));
  const loan = closureLoan({ returnDateTime: existingReturnDateTime });
  const { db, workflows } = closureSetup({ loan });
  const before = Date.now();

  await workflows.reportClosure(loan.loanId, 'RETURNED', member);

  const storedLoan = db.records.get('loans').get(loan.loanId);
  const storedCopy = db.records.get('bookCopies').get(copy.copyId);
  assert.equal(storedLoan.status, 'PENDING_CLOSE');
  assert.equal(storedLoan.closureReportType, 'RETURNED');
  assert.ok(storedLoan.closureReportedDateTime instanceof Timestamp);
  assert.ok(storedLoan.closureReportedDateTime.toMillis() >= before);
  assert.equal(storedLoan.returnDateTime.toMillis(), existingReturnDateTime.toMillis());
  assert.equal(storedCopy.status, 'IN_TRANSIT');
  assert.equal(storedCopy.updatedAt.toMillis(), storedLoan.closureReportedDateTime.toMillis());
  assert.equal(db.records.get('notifications').size, 0);
  assert.equal(db.records.get('fines')?.size ?? 0, 0);
});

test('closure report validates actor, ownership, report type, loan and copy state without changing records', async () => {
  const ownLoan = closureLoan();
  const { db, workflows } = closureSetup({ loan: ownLoan });
  const otherLoan = closureLoan({ loanId: 'other-loan', memberId: 'member-2', copyId: 'copy-other' });
  db.records.get('loans').set(otherLoan.loanId, cloneFirestoreValue(otherLoan));
  db.records.get('bookCopies').set('copy-other', cloneFirestoreValue({ ...copy, copyId: 'copy-other', status: 'ON_LOAN' }));

  for (const [loanId, reportType, actor, expectedCode] of [
    [ownLoan.loanId, 'RETURNED', librarian, 'FORBIDDEN'],
    [ownLoan.loanId, 'RETURNED', inactiveMember, 'FORBIDDEN'],
    [ownLoan.loanId, 'RETURNED', undefined, 'FORBIDDEN'],
    [ownLoan.loanId, 'DAMAGED', member, 'INVALID'],
    ['missing-loan', 'LOST', member, 'NOT_FOUND'],
    [otherLoan.loanId, 'LOST', member, 'FORBIDDEN'],
  ]) {
    const loansBefore = cloneFirestoreValue([...db.records.get('loans').entries()]);
    const copiesBefore = cloneFirestoreValue([...db.records.get('bookCopies').entries()]);
    await assert.rejects(workflows.reportClosure(loanId, reportType, actor),
      (error) => error instanceof StorageError && error.code === expectedCode);
    assert.deepEqual([...db.records.get('loans').entries()], loansBefore);
    assert.deepEqual([...db.records.get('bookCopies').entries()], copiesBefore);
  }

  for (const stale of [
    { loan: closureLoan({ loanId: 'pending', status: 'PENDING_CLOSE', closureReportType: 'LOST', closureReportedDateTime: now }), copyState: 'ON_LOAN' },
    { loan: closureLoan({ loanId: 'closed', status: 'CLOSED_RETURNED' }), copyState: 'ON_LOAN' },
    { loan: closureLoan({ loanId: 'stale-copy' }), copyState: 'AVAILABLE' },
  ]) {
    const staleSetup = closureSetup(stale);
    const loansBefore = cloneFirestoreValue([...staleSetup.db.records.get('loans').entries()]);
    const copiesBefore = cloneFirestoreValue([...staleSetup.db.records.get('bookCopies').entries()]);
    await assert.rejects(staleSetup.workflows.reportClosure(stale.loan.loanId, 'LOST', member),
      (error) => error instanceof StorageError && error.code === 'CONFLICT');
    assert.deepEqual([...staleSetup.db.records.get('loans').entries()], loansBefore);
    assert.deepEqual([...staleSetup.db.records.get('bookCopies').entries()], copiesBefore);
  }
});

test('repeated and concurrent closure reports permit one transition only', async () => {
  const { db, workflows } = closureSetup();
  await workflows.reportClosure('closure-loan', 'LOST', member);
  const afterFirst = cloneFirestoreValue([...db.records.get('loans').entries()]);
  await assert.rejects(workflows.reportClosure('closure-loan', 'RETURNED', member),
    (error) => error instanceof StorageError && error.code === 'CONFLICT');
  assert.deepEqual([...db.records.get('loans').entries()], afterFirst);
  assert.equal(db.records.get('bookCopies').get(copy.copyId).status, 'IN_TRANSIT');

  const concurrent = closureSetup({ loan: closureLoan({ loanId: 'concurrent-loan' }) });
  const results = await Promise.allSettled([
    concurrent.workflows.reportClosure('concurrent-loan', 'RETURNED', member),
    concurrent.workflows.reportClosure('concurrent-loan', 'LOST', member),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason instanceof StorageError && result.reason.code === 'CONFLICT').length, 1);
  assert.equal(concurrent.db.records.get('loans').get('concurrent-loan').status, 'PENDING_CLOSE');
  assert.ok(['RETURNED', 'LOST'].includes(concurrent.db.records.get('loans').get('concurrent-loan').closureReportType));
  assert.equal(concurrent.db.records.get('bookCopies').get(copy.copyId).status, 'IN_TRANSIT');
});

async function withNow(instant, action) {
  const originalNow = Date.now;
  Date.now = () => instant;
  try { return await action(); }
  finally { Date.now = originalNow; }
}

test('member loan renewal validates the active account and renews only the owner’s ACTIVE, unrenewed loan', async () => {
  const beforeDue = renewalLoan();
  const { db, workflows } = renewalSetup([beforeDue]);
  const priorCopy = structuredClone(db.records.get('bookCopies').get(copy.copyId));
  const otherLoan = renewalLoan({ loanId: 'other-loan', memberId: 'member-2' });
  db.records.get('loans').set(otherLoan.loanId, otherLoan);

  const renewed = await workflows.renewMemberLoan(beforeDue.loanId, member);
  const stored = db.records.get('loans').get(beforeDue.loanId);
  assert.equal(stored.dueDate.toMillis(), beforeDue.dueDate.toMillis() + 30 * 24 * 60 * 60 * 1000);
  assert.equal(stored.isRenewed, true);
  assert.equal(stored.status, 'ACTIVE');
  assert.equal(renewed.dueDate.toMillis(), stored.dueDate.toMillis());
  assert.deepEqual(db.records.get('bookCopies').get(copy.copyId), priorCopy);
  assert.equal(db.records.get('loans').get(otherLoan.loanId).isRenewed, false);
  await assert.rejects(workflows.renewMemberLoan(otherLoan.loanId, member),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN');

  for (const actor of [undefined, librarian, inactiveMember, missingMemberId]) {
    await assert.rejects(workflows.renewMemberLoan(beforeDue.loanId, actor),
      (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  }
  db.records.get('users').set(member.userId, { ...member, accountStatus: 'INACTIVE' });
  await assert.rejects(workflows.renewMemberLoan('other-loan', member),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  assert.equal(db.records.get('loans').get('other-loan').isRenewed, false);
});

test('renewal accepts until Singapore midnight after the due date, then conflicts at the cutoff', async () => {
  const dueDate = Timestamp.fromDate(new Date('2026-10-25T05:30:00.000Z')); // 13:30 Singapore time
  const loanAtEndOfDay = renewalLoan({ dueDate });
  const cutoff = Date.parse('2026-10-26T00:00:00+08:00');
  const { db, workflows } = renewalSetup([loanAtEndOfDay]);
  await withNow(cutoff - 1, () => workflows.renewMemberLoan(loanAtEndOfDay.loanId, member));

  const atCutoffLoan = renewalLoan({ loanId: 'cutoff-loan', dueDate });
  db.records.get('loans').set(atCutoffLoan.loanId, cloneFirestoreValue(atCutoffLoan));
  await withNow(cutoff, () => assert.rejects(workflows.renewMemberLoan(atCutoffLoan.loanId, member),
    (error) => error instanceof StorageError && error.code === 'CONFLICT'));
  assert.equal(db.records.get('loans').get(atCutoffLoan.loanId).dueDate.toMillis(), dueDate.toMillis());
  assert.equal(db.records.get('loans').get(atCutoffLoan.loanId).isRenewed, false);
});

test('renewal does not depend on pending or assigned reservations and preserves reservation and copy state', async () => {
  const activeLoan = renewalLoan();
  const { db, workflows } = renewalSetup([activeLoan]);
  const pending = { reservationId: 'pending-reservation', memberId: 'member-2', isbn: book.isbn,
    status: 'PENDING', reservationDateTime: now, copyId: null, expiryDate: null };
  const assigned = { ...pending, reservationId: 'assigned-reservation', status: 'ASSIGNED', copyId: 'copy-reserved' };
  db.records.get('reservations').set(pending.reservationId, pending);
  db.records.get('reservations').set(assigned.reservationId, assigned);
  const copiesBefore = cloneFirestoreValue([...db.records.get('bookCopies').entries()]);
  const reservationsBefore = cloneFirestoreValue([...db.records.get('reservations').entries()]);

  await workflows.renewMemberLoan(activeLoan.loanId, member);
  assert.deepEqual([...db.records.get('bookCopies').entries()], copiesBefore);
  assert.deepEqual([...db.records.get('reservations').entries()], reservationsBefore);
});

test('renewal rejects PENDING_CLOSE, closed, already-renewed, and stale requests without partial updates', async () => {
  const candidates = [
    renewalLoan({ loanId: 'pending-close', status: 'PENDING_CLOSE' }),
    renewalLoan({ loanId: 'closed-returned', status: 'CLOSED_RETURNED' }),
    renewalLoan({ loanId: 'closed-lost', status: 'CLOSED_LOST' }),
    renewalLoan({ loanId: 'already-renewed', isRenewed: true }),
  ];
  const { db, workflows } = renewalSetup(candidates);
  const before = cloneFirestoreValue([...db.records.get('loans').entries()]);
  const copiesBefore = cloneFirestoreValue([...db.records.get('bookCopies').entries()]);
  const reservationsBefore = cloneFirestoreValue([...db.records.get('reservations').entries()]);
  for (const candidate of candidates) {
    await assert.rejects(workflows.renewMemberLoan(candidate.loanId, member),
      (error) => error instanceof StorageError && error.code === 'CONFLICT');
    assert.deepEqual([...db.records.get('loans').entries()], before);
    assert.deepEqual([...db.records.get('bookCopies').entries()], copiesBefore);
    assert.deepEqual([...db.records.get('reservations').entries()], reservationsBefore);
  }
  await assert.rejects(workflows.renewMemberLoan('missing-loan', member),
    (error) => error instanceof StorageError && error.code === 'NOT_FOUND');
  assert.deepEqual([...db.records.get('loans').entries()], before);
  assert.deepEqual([...db.records.get('bookCopies').entries()], copiesBefore);
  assert.deepEqual([...db.records.get('reservations').entries()], reservationsBefore);
});

test('repeated and concurrent renewals permit one extension only', async () => {
  const activeLoan = renewalLoan();
  const { db, workflows } = renewalSetup([activeLoan]);
  const priorDue = activeLoan.dueDate.toMillis();
  const concurrent = await Promise.allSettled([
    workflows.renewMemberLoan(activeLoan.loanId, member),
    workflows.renewMemberLoan(activeLoan.loanId, member),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((result) => result.status === 'rejected' && result.reason instanceof StorageError && result.reason.code === 'CONFLICT').length, 1);
  await assert.rejects(workflows.renewMemberLoan(activeLoan.loanId, member),
    (error) => error instanceof StorageError && error.code === 'CONFLICT');
  const stored = db.records.get('loans').get(activeLoan.loanId);
  assert.equal(stored.dueDate.toMillis(), priorDue + 30 * 24 * 60 * 60 * 1000);
  assert.equal(stored.isRenewed, true);
  assert.equal(stored.status, 'ACTIVE');
});

test('member borrow capacity counts this member’s ACTIVE loans only and reports remaining slots', async () => {
  const { workflows } = setup({ loans: [
    loan('active-1', member.memberId), loan('active-2', member.memberId),
    loan('closed-1', member.memberId, 'CLOSED_RETURNED'), loan('other-member', 'member-2'),
  ] });
  assert.deepEqual(await workflows.memberBorrowCapacity(member), { activeLoanCount: 2, remainingSlots: 8 });
});

test('member borrow capacity reports zero remaining slots at the 10-loan limit', async () => {
  const { workflows } = setup({ loans: Array.from({ length: 10 }, (_, i) => loan(`active-${i}`, member.memberId)) });
  assert.deepEqual(await workflows.memberBorrowCapacity(member), { activeLoanCount: 10, remainingSlots: 0 });
});

test('member capacity and copy eligibility reject librarian, inactive, and member actors without member IDs', async () => {
  const { workflows } = setup();
  for (const actor of [undefined, librarian, inactiveMember, missingMemberId, { ...member, memberId: '  ' }]) {
    await assert.rejects(workflows.memberBorrowCapacity(actor), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
    await assert.rejects(workflows.checkMemberBorrowCopy(copy.copyId, actor), (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
  }
});

test('copy eligibility returns the available copy and its book', async () => {
  const { workflows } = setup();
  const result = await workflows.checkMemberBorrowCopy(copy.copyId, member);
  assert.deepEqual(result, { copy: structuredClone(copy), book: structuredClone(book) });
});

test('unknown copy eligibility uses the established NOT_FOUND storage error', async () => {
  const { workflows } = setup();
  await assert.rejects(workflows.checkMemberBorrowCopy('unknown-copy', member),
    (error) => error instanceof StorageError && error.code === 'NOT_FOUND');
});

test('copy eligibility rejects reserved and other unavailable copies', async () => {
  const { workflows } = setup();
  for (const copyId of ['copy-reserved', 'copy-damaged']) {
    await assert.rejects(workflows.checkMemberBorrowCopy(copyId, member),
      (error) => error instanceof StorageError && error.code === 'CONFLICT');
  }
});

test('eligibility checks do not create loans or change/reserve copy state', async () => {
  const { db, workflows } = setup({ loans: [loan('existing-active', member.memberId)] });
  const beforeCopies = structuredClone([...db.records.get('bookCopies').entries()]);
  const beforeLoans = structuredClone([...db.records.get('loans').entries()]);
  await workflows.checkMemberBorrowCopy(copy.copyId, member);
  assert.deepEqual([...db.records.get('bookCopies').entries()], beforeCopies);
  assert.deepEqual([...db.records.get('loans').entries()], beforeLoans);
});

test('member confirmation borrows available copies and returns schema-valid server-created loans', async () => {
  const { db, workflows } = setup();
  const before = Date.now();
  const result = outcomesFor(await workflows.confirmMemberBorrow([copy.copyId], member));
  const outcome = result[0];
  assert.equal(outcome.copyId, copy.copyId);
  assert.equal(successful(outcome), true);
  const storedLoan = [...db.records.get('loans').values()].find((value) => value.copyId === copy.copyId);
  assert.ok(storedLoan);
  assert.equal(LoanRecordSchema.safeParse(storedLoan).success, true);
  assert.equal(storedLoan.memberId, member.memberId);
  assert.equal(storedLoan.copyId, copy.copyId);
  assert.notEqual(storedLoan.loanId, '');
  assert.ok(storedLoan.borrowDateTime.toMillis() >= before);
  assert.equal(storedLoan.dueDate.toMillis() - storedLoan.borrowDateTime.toMillis(), 30 * 24 * 60 * 60 * 1000);
  assert.equal(db.records.get('bookCopies').get(copy.copyId).status, 'ON_LOAN');
  assert.equal(db.records.get('bookCopies').get(copy.copyId).shelfLocation, null);
});

test('member confirmation rejects librarian and inactive actors without mutating copy or loan state', async () => {
  const { db, workflows } = setup();
  const beforeCopies = structuredClone([...db.records.get('bookCopies').entries()]);
  const beforeLoans = structuredClone([...db.records.get('loans').entries()]);

  for (const actor of [librarian, inactiveMember]) {
    await assert.rejects(workflows.confirmMemberBorrow([copy.copyId], actor),
      (error) => error instanceof StorageError && error.code === 'FORBIDDEN');
    assert.deepEqual([...db.records.get('bookCopies').entries()], beforeCopies);
    assert.deepEqual([...db.records.get('loans').entries()], beforeLoans);
  }
});

test('book copy record schema accepts a null shelf location', () => {
  assert.equal(BookCopyRecordSchema.safeParse({ ...copy, shelfLocation: null }).success, true);
});

test('member confirmation reports per-copy failures but still borrows other available copies', async () => {
  const { db, workflows } = setup();
  db.records.get('bookCopies').set('copy-available-2', structuredClone({ ...copy, copyId: 'copy-available-2' }));
  const ids = ['copy-missing', 'copy-reserved', copy.copyId, 'copy-available-2'];
  const result = outcomesFor(await workflows.confirmMemberBorrow(ids, member));
  assert.deepEqual(result.map((outcome) => outcome.copyId), ids);
  assert.equal(successful(result[0]), false);
  assert.match(String(failureReason(result[0])), /not found|missing|exist/i);
  assert.equal(successful(result[1]), false);
  assert.match(String(failureReason(result[1])), /available|reserved|status/i);
  assert.equal(successful(result[2]), true);
  assert.equal(successful(result[3]), true);
  assert.equal(db.records.get('bookCopies').get('copy-reserved').status, 'RESERVED');
  assert.equal(db.records.get('bookCopies').get('copy-reserved').shelfLocation, 'A1');
  assert.equal(db.records.get('bookCopies').get(copy.copyId).status, 'ON_LOAN');
  assert.equal(db.records.get('bookCopies').get('copy-available-2').status, 'ON_LOAN');
  assert.equal(db.records.get('bookCopies').get(copy.copyId).shelfLocation, null);
  assert.equal(db.records.get('bookCopies').get('copy-available-2').shelfLocation, null);
});

test('confirmation rejects a copy that became unavailable after staging while borrowing eligible siblings', async () => {
  const { db, workflows } = setup();
  db.records.get('bookCopies').set('copy-available-2', structuredClone({ ...copy, copyId: 'copy-available-2' }));
  await workflows.checkMemberBorrowCopy(copy.copyId, member);
  await workflows.checkMemberBorrowCopy('copy-available-2', member);

  db.records.get('bookCopies').set(copy.copyId, structuredClone({ ...copy, status: 'ON_LOAN' }));
  const result = outcomesFor(await workflows.confirmMemberBorrow([copy.copyId, 'copy-available-2'], member));

  assert.equal(successful(result[0]), false);
  assert.match(String(failureReason(result[0])), /available/i);
  assert.equal(successful(result[1]), true);
  assert.equal(db.records.get('bookCopies').get(copy.copyId).status, 'ON_LOAN');
  assert.equal(db.records.get('bookCopies').get(copy.copyId).shelfLocation, 'A1');
  assert.equal(db.records.get('bookCopies').get('copy-available-2').status, 'ON_LOAN');
  assert.equal(db.records.get('bookCopies').get('copy-available-2').shelfLocation, null);
  assert.equal([...db.records.get('loans').values()].filter((value) => value.copyId === copy.copyId).length, 0);
  assert.equal([...db.records.get('loans').values()].filter((value) => value.copyId === 'copy-available-2').length, 1);
});

test('repeated member confirmations cannot borrow the same copy twice', async () => {
  const { db, workflows } = setup();
  const first = outcomesFor(await workflows.confirmMemberBorrow([copy.copyId], member));
  const second = outcomesFor(await workflows.confirmMemberBorrow([copy.copyId], member));
  assert.equal(successful(first[0]), true);
  assert.equal(successful(second[0]), false);
  assert.ok(failureReason(second[0]));
  assert.equal([...db.records.get('loans').values()].filter((value) => value.copyId === copy.copyId).length, 1);
});

test('concurrent confirmations serialize the member loan limit at ten active loans', async () => {
  const { db, workflows } = setup({ loans: Array.from({ length: 9 }, (_, i) => loan(`existing-${i}`, member.memberId)) });
  db.records.get('bookCopies').set('copy-concurrent-1', structuredClone({ ...copy, copyId: 'copy-concurrent-1' }));
  db.records.get('bookCopies').set('copy-concurrent-2', structuredClone({ ...copy, copyId: 'copy-concurrent-2' }));
  const [left, right] = await Promise.all([
    workflows.confirmMemberBorrow(['copy-concurrent-1'], member),
    workflows.confirmMemberBorrow(['copy-concurrent-2'], member),
  ]);
  const outcomes = [...outcomesFor(left), ...outcomesFor(right)];
  assert.equal(outcomes.filter(successful).length, 1);
  assert.equal(outcomes.filter((outcome) => !successful(outcome)).length, 1);
  assert.ok(outcomes.find((outcome) => !successful(outcome)) && failureReason(outcomes.find((outcome) => !successful(outcome))));
  assert.equal([...db.records.get('loans').values()].filter((value) => value.memberId === member.memberId && value.status === 'ACTIVE').length, 10);
});

test('a confirmation submitted above remaining capacity borrows only up to ten and fails excess copies individually', async () => {
  const { db, workflows } = setup({ loans: Array.from({ length: 8 }, (_, i) => loan(`existing-${i}`, member.memberId)) });
  const ids = ['copy-limit-1', 'copy-limit-2', 'copy-limit-3'];
  for (const copyId of ids) db.records.get('bookCopies').set(copyId, structuredClone({ ...copy, copyId }));
  const result = outcomesFor(await workflows.confirmMemberBorrow(ids, member));
  assert.deepEqual(result.map((outcome) => outcome.copyId), ids);
  assert.equal(result.filter(successful).length, 2);
  assert.equal(result.filter((outcome) => !successful(outcome)).length, 1);
  assert.ok(failureReason(result.find((outcome) => !successful(outcome))));
  assert.equal([...db.records.get('loans').values()].filter((value) => value.memberId === member.memberId && value.status === 'ACTIVE').length, 10);
});

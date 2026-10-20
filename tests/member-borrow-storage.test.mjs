import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { LibraryWorkflows } from '../dist/apps/api/src/storage/workflows.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';
import { BookCopyRecordSchema, LoanRecordSchema } from '../dist/packages/shared/src/domain/records.js';

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
  constructor(records, filters = []) { this.records = records; this.filters = filters; }
  where(field, operator, value) {
    assert.equal(operator, '==');
    return new Query(this.records, [...this.filters, [field, value]]);
  }
  orderBy(field, direction) {
    assert.equal(field, 'borrowDateTime');
    assert.equal(direction, 'desc');
    return this;
  }
  async get() {
    const docs = [...this.records.entries()]
      .filter(([, value]) => this.filters.every(([field, expected]) => value[field] === expected))
      .map(([id, value]) => new Snapshot(id, value));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  records = new Map(['users', 'books', 'bookCopies', 'loans', 'reservations'].map((name) => [name, new Map()]));
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
    bookTitle: 'Owned book', borrowDateTime: now,
    dueDate: Timestamp.fromDate(new Date('2026-11-20T00:00:00.000Z')),
    status: 'ACTIVE', returnDateTime: null, closureReportType: null,
    closureReportedDateTime: null, closureReviewedDateTime: null, isRenewed: false,
    createdBy: 'internal-user',
  };
  const foreignLoan = {
    ...ownLoan, loanId: 'foreign-loan', memberId: 'another-member', bookTitle: 'Foreign book',
  };
  const { db, workflows } = setup({ loans: [ownLoan, foreignLoan] });
  db.records.get('loans').set(ownLoan.loanId, ownLoan);
  db.records.get('loans').set(foreignLoan.loanId, foreignLoan);
  const copiesBefore = structuredClone([...db.records.get('bookCopies').entries()]);

  assert.deepEqual(await workflows.memberLoans(member), [{
    loanId: 'owned-loan', bookTitle: 'Owned book', dueDate: ownLoan.dueDate,
    status: 'ACTIVE', returnDateTime: null,
  }]);
  assert.deepEqual([...db.records.get('bookCopies').entries()], copiesBefore);
  assert.deepEqual([...db.records.get('loans').keys()].sort(), ['foreign-loan', 'owned-loan']);
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

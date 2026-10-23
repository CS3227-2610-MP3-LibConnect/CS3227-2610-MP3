import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { test } from 'node:test';
import { LibraryWorkflows } from '../dist/apps/api/src/storage/workflows.js';

const librarian = {
  userId: 'librarian-1',
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
  isManager: false,
};

function document(id, data) {
  return { id, data: () => data, ref: { id } };
}

test('pending queue asks Firestore for only one page plus a look-ahead document', async () => {
  const borrowDateTime = Timestamp.fromMillis(Date.parse('2026-01-01T00:00:00.000Z'));
  const docs = [0, 1, 2].map((index) =>
    document(`loan-${index}`, {
      loanId: `loan-${index}`,
      copyId: `copy-${index}`,
      borrowDateTime,
    }),
  );
  let requestedLimit;
  let startedAfter;
  const query = {
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    startAfter(...values) {
      startedAfter = values;
      return this;
    },
    limit(value) {
      requestedLimit = value;
      return this;
    },
    async get() {
      return { docs, size: docs.length };
    },
  };
  const db = {
    collection(name) {
      if (name === 'loans') return query;
      return {
        doc(id) {
          return {
            async get() {
              return { id, exists: true, data: () => ({ copyId: id, status: 'IN_TRANSIT' }) };
            },
          };
        },
      };
    },
  };
  const workflows = new LibraryWorkflows(db);
  const firstPage = await workflows.listPendingClose({ limit: 2 }, librarian);
  assert.equal(requestedLimit, 3);
  assert.equal(firstPage.items.length, 2);
  assert.ok(firstPage.nextCursor);
  await workflows.listPendingClose({ limit: 2, cursor: firstPage.nextCursor }, librarian);
  assert.deepEqual(startedAfter[1], firstPage.nextCursor.lastLoanId);
});

test('reservation preview query is bounded to the earliest eligible reservation', async () => {
  const loan = {
    ...document('loan-1', {
      loanId: 'loan-1',
      copyId: 'copy-1',
      isbn: 'isbn-1',
      status: 'PENDING_CLOSE',
      closureReportType: 'RETURNED',
    }),
    exists: true,
  };
  const copy = { ...document('copy-1', { copyId: 'copy-1', status: 'IN_TRANSIT' }), exists: true };
  const reservation = document('reservation-1', {
    reservationId: 'reservation-1',
    memberId: 'MEMBER-1',
    isbn: 'isbn-1',
    copyId: null,
    expiryDate: null,
    reservationDateTime: Timestamp.now(),
    status: 'PENDING',
  });
  let reservationLimit;
  const db = {
    collection(name) {
      if (name === 'loans')
        return {
          doc() {
            return {
              async get() {
                return loan;
              },
            };
          },
        };
      if (name === 'bookCopies')
        return {
          doc() {
            return {
              async get() {
                return copy;
              },
            };
          },
        };
      return {
        where() {
          return this;
        },
        orderBy() {
          return this;
        },
        limit(value) {
          reservationLimit = value;
          return this;
        },
        async get() {
          return { docs: [reservation] };
        },
      };
    },
  };
  const preview = await new LibraryWorkflows(db).returnPreview('loan-1', librarian);
  assert.equal(reservationLimit, 1);
  assert.equal(preview.earliestReservation.reservationId, 'reservation-1');
});

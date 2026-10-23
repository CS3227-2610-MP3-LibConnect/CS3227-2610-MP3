import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { test } from 'node:test';
import { LibraryWorkflows } from '../dist/apps/api/src/storage/workflows.js';
import { LibraryRepository, StorageError } from '../dist/apps/api/src/storage/repositories.js';
import {
  emptyBodySchema,
  memberFineListQuerySchema,
  memberIntegrationContract,
  memberNotificationListQuerySchema,
  memberReservationCreateSchema,
  memberReservationListQuerySchema,
} from '../dist/apps/api/src/http/reservations-fines-contracts.js';

const member = {
  userId: 'member-user-1',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'MEMBER-1',
};
const otherMember = {
  userId: 'member-user-2',
  accountType: 'MEMBER',
  accountStatus: 'ACTIVE',
  memberId: 'MEMBER-2',
};

test('member integration contracts exclude client ownership and mutation fields', () => {
  assert.equal(memberReservationCreateSchema.safeParse({ isbn: '978-1' }).success, true);
  assert.equal(
    memberReservationCreateSchema.safeParse({ isbn: '978-1', memberId: 'MEMBER-2' }).success,
    false,
  );
  assert.equal(emptyBodySchema.safeParse({ status: 'PAID' }).success, false);
  assert.deepEqual(memberReservationListQuerySchema.parse({ limit: '10' }), { limit: 10 });
  assert.deepEqual(memberFineListQuerySchema.parse({ status: 'OUTSTANDING' }), {
    status: 'OUTSTANDING',
    limit: 20,
  });
  assert.deepEqual(memberNotificationListQuerySchema.parse({ unread: 'true' }), {
    unread: true,
    limit: 20,
  });
  assert.match(memberIntegrationContract.authorization, /server-loaded active member/);
});

test('member payment ownership and state checks reject foreign or terminal records without writes', async () => {
  const updates = [];
  const fineData = {
    fineId: 'fine-1',
    loanId: 'loan-1',
    memberId: 'MEMBER-1',
    bookTitle: 'Book',
    amountMinorUnits: 500,
    currency: 'SGD',
    reason: 'Overdue loan',
    status: 'OUTSTANDING',
    issuedDateTime: Timestamp.now(),
    paidDateTime: null,
    waivedDateTime: null,
  };
  const db = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { exists: true, data: () => fineData };
            },
          };
        },
      };
    },
    async runTransaction(callback) {
      const tx = {
        async get() {
          return { exists: true, data: () => fineData };
        },
        update(...args) {
          updates.push(args);
        },
      };
      return callback(tx);
    },
  };
  const workflows = new LibraryWorkflows(db);
  await assert.rejects(
    () => workflows.payFine('fine-1', otherMember),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN',
  );
  assert.equal(updates.length, 0);
  await workflows.payFine('fine-1', member);
  assert.equal(updates.length, 1);
  const terminalDb = {
    ...db,
    async runTransaction(callback) {
      const tx = {
        async get() {
          return { exists: true, data: () => ({ ...fineData, status: 'WAIVED' }) };
        },
        update(...args) {
          updates.push(args);
        },
      };
      return callback(tx);
    },
  };
  await assert.rejects(
    () => new LibraryWorkflows(terminalDb).payFine('fine-1', member),
    (error) => error instanceof StorageError && error.code === 'CONFLICT',
  );
});

test('member reservation reads enforce ownership from the server-loaded actor', async () => {
  const reservation = {
    reservationId: 'reservation-1',
    memberId: 'MEMBER-1',
    isbn: 'isbn-1',
    copyId: null,
    reservationDateTime: Timestamp.now(),
    expiryDate: null,
    status: 'PENDING',
  };
  const db = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { exists: true, data: () => reservation };
            },
          };
        },
      };
    },
  };
  const repository = new LibraryRepository(db);
  await assert.rejects(
    () => repository.getReservation('reservation-1', otherMember),
    (error) => error instanceof StorageError && error.code === 'FORBIDDEN',
  );
  assert.equal((await repository.getReservation('reservation-1', member)).memberId, 'MEMBER-1');
});

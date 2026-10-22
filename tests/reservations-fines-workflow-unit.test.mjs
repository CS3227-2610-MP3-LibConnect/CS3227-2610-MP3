import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { test } from 'node:test';
import { LibraryWorkflows } from '../dist/apps/api/src/storage/workflows.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';

const librarian = { userId: 'librarian-1', accountType: 'LIBRARIAN', accountStatus: 'ACTIVE', isManager: false };
const fine = { fineId: 'fine-1', loanId: 'loan-1', memberId: 'MEMBER-1', bookTitle: 'Book', amountMinorUnits: 500, currency: 'SGD', reason: 'Overdue loan', status: 'OUTSTANDING', issuedDateTime: Timestamp.fromMillis(Date.parse('2026-01-01T00:00:00.000Z')), paidDateTime: null, waivedDateTime: null };
const memberUser = { userId: 'member-user-1', accountType: 'MEMBER', accountStatus: 'ACTIVE', memberId: 'MEMBER-1' };

function docRef(collection, id) { return { collection, id, kind: 'doc' }; }
function queryRef(collection, field, value) { return { collection, field, value, kind: 'query' }; }
function snapshot(exists, data, id = '') { return { exists, data: () => data, id, docs: exists ? [{ id: 'member-user-1', get(field) { return memberUser[field]; }, data: () => memberUser }] : [] }; }

function fakeDb({ fineValue = fine, existingNotification = false } = {}) {
  const operations = [];
  const db = {
    collection(collection) {
      return {
        doc(id) { return docRef(collection, id); },
        where(field, _operator, value) {
          const query = queryRef(collection, field, value);
          query.limit = () => query;
          return query;
        },
        orderBy() { return this; },
        limit() { return this; },
        async get() { return { docs: [], size: 0 }; },
      };
    },
    async runTransaction(callback) {
      const tx = {
        async get(target) {
          if (target.kind === 'doc' && target.collection === 'fines') return snapshot(Boolean(fineValue), fineValue, target.id);
          if (target.kind === 'doc' && target.collection === 'notifications') return snapshot(existingNotification, existingNotification ? { notificationId: target.id } : undefined, target.id);
          if (target.kind === 'query' && target.collection === 'users') return { docs: [{ id: 'member-user-1', get(field) { return memberUser[field]; }, data: () => memberUser }] };
          return snapshot(false, undefined, target.id);
        },
        update(...args) { operations.push(['update', ...args]); },
        create(...args) { operations.push(['create', ...args]); },
        delete(...args) { operations.push(['delete', ...args]); },
      };
      return callback(tx);
    },
  };
  return { db, operations };
}

test('librarian list queries are database-bounded and return deterministic cursors', async () => {
  let reservationLimit;
  let fineLimit;
  const reservationDateTime = Timestamp.fromMillis(Date.parse('2026-01-01T00:00:00.000Z'));
  const db = {
    collection(name) {
      const query = {
        where() { return this; },
        orderBy() { return this; },
        limit(value) { if (name === 'reservations') reservationLimit = value; else fineLimit = value; return this; },
        async get() {
          return { docs: name === 'reservations'
            ? [{ exists: true, id: 'reservation-1', data: () => ({ memberId: 'MEMBER-1', isbn: '978-1', copyId: null, reservationDateTime, expiryDate: null, status: 'PENDING' }) }, { exists: true, id: 'reservation-2', data: () => ({ memberId: 'MEMBER-2', isbn: '978-1', copyId: null, reservationDateTime, expiryDate: null, status: 'PENDING' }) }]
            : [{ exists: true, id: 'fine-1', data: () => fine }, { exists: true, id: 'fine-2', data: () => ({ ...fine, memberId: 'MEMBER-2' }) }] };
        },
      };
      return query;
    },
  };
  const workflows = new LibraryWorkflows(db);
  const reservations = await workflows.listReservations({ limit: 1 }, librarian);
  const fines = await workflows.listFines({ limit: 1 }, librarian);
  assert.equal(reservationLimit, 2);
  assert.equal(fineLimit, 2);
  assert.equal(reservations.items.length, 1);
  assert.equal(fines.items.length, 1);
  assert.ok(reservations.nextCursor);
  assert.ok(fines.nextCursor);
});

test('waiver atomically changes only outstanding status metadata and creates one linked update', async () => {
  const { db, operations } = fakeDb();
  const result = await new LibraryWorkflows(db).waiveFine('fine-1', librarian);
  assert.equal(result.fine.status, 'WAIVED');
  assert.equal(result.notification.notificationType, 'FINE_UPDATED');
  assert.equal(operations.filter(([kind]) => kind === 'update').length, 1);
  assert.equal(operations.filter(([kind]) => kind === 'create').length, 1);
  assert.equal(operations.find(([kind]) => kind === 'update')[2].status, 'WAIVED');
  assert.equal(operations.find(([kind]) => kind === 'update')[2].amountMinorUnits, undefined);
});

test('waiver rejects terminal or missing fines before any write', async () => {
  const terminal = fakeDb({ fineValue: { ...fine, status: 'PAID' } });
  await assert.rejects(() => new LibraryWorkflows(terminal.db).waiveFine('fine-1', librarian), (error) => error instanceof StorageError && error.code === 'CONFLICT');
  assert.equal(terminal.operations.length, 0);
  const missing = fakeDb({ fineValue: null });
  await assert.rejects(() => new LibraryWorkflows(missing.db).waiveFine('fine-1', librarian), (error) => error instanceof StorageError && error.code === 'NOT_FOUND');
  assert.equal(missing.operations.length, 0);
});

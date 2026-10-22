import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  emptyBodySchema,
  fineListQuerySchema,
  idempotencyKeySchema,
  librarianMessageSchema,
  reservationListQuerySchema,
  safeFine,
  safeReservation,
} from '../dist/apps/api/src/http/reservations-fines-contracts.js';
import { defaultOverdueFineMinorUnits, defaultOverdueGraceHours, getOverdueFinePolicy, overdueFinePolicyKey } from '../dist/apps/api/src/config/fines.js';

const original = {
  NODE_ENV: process.env.NODE_ENV,
  OVERDUE_FINE_POLICY_KEY: process.env.OVERDUE_FINE_POLICY_KEY,
  OVERDUE_FINE_MINOR_UNITS: process.env.OVERDUE_FINE_MINOR_UNITS,
  OVERDUE_FINE_GRACE_HOURS: process.env.OVERDUE_FINE_GRACE_HOURS,
};

afterEach(() => {
  for (const key of Object.keys(original)) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test('reservation, fine, message, and idempotency schemas are strict and bounded', () => {
  assert.deepEqual(reservationListQuerySchema.parse({ status: 'PENDING', limit: '10' }), { status: 'PENDING', limit: 10 });
  assert.equal(reservationListQuerySchema.safeParse({ isbn: 'isbn-1', role: 'LIBRARIAN' }).success, false);
  assert.equal(fineListQuerySchema.safeParse({ memberId: 'member/1' }).success, false);
  assert.equal(emptyBodySchema.safeParse({ status: 'WAIVED' }).success, false);
  assert.equal(librarianMessageSchema.safeParse({ memberId: 'member-1', message: 'Please collect your book.' }).success, true);
  assert.equal(librarianMessageSchema.safeParse({ memberId: 'member-1', message: '', recipientUserId: 'forged' }).success, false);
  assert.equal(idempotencyKeySchema.safeParse('short').success, false);
  assert.equal(idempotencyKeySchema.safeParse('message-2026-10-21-0001').success, true);
});

test('safe reservation and fine DTOs omit raw record fields', () => {
  const reservation = safeReservation({ reservationId: 'reservation-1', memberId: 'member-1', isbn: 'isbn-1', copyId: null, reservationDateTime: 'time', expiryDate: null, status: 'PENDING', passwordHash: 'secret' });
  const fine = safeFine({ fineId: 'fine-1', loanId: 'loan-1', memberId: 'member-1', bookTitle: 'Book', amountMinorUnits: 500, currency: 'SGD', reason: 'Overdue loan', status: 'OUTSTANDING', issuedDateTime: 'time', paidDateTime: null, waivedDateTime: null, passwordHash: 'secret' });
  assert.equal(reservation.passwordHash, undefined);
  assert.equal(fine.passwordHash, undefined);
  assert.equal(fine.amountMinorUnits, 500);
});

test('overdue policy has the approved values and fails closed in production', () => {
  process.env.NODE_ENV = 'test';
  delete process.env.OVERDUE_FINE_POLICY_KEY;
  delete process.env.OVERDUE_FINE_MINOR_UNITS;
  delete process.env.OVERDUE_FINE_GRACE_HOURS;
  assert.deepEqual(getOverdueFinePolicy(), { policyKey: overdueFinePolicyKey, amountMinorUnits: defaultOverdueFineMinorUnits, graceHours: defaultOverdueGraceHours });
    process.env.OVERDUE_FINE_POLICY_KEY = 'wrong-policy';
    assert.throws(() => getOverdueFinePolicy(), /policy key must match/);
    delete process.env.OVERDUE_FINE_POLICY_KEY;
  process.env.NODE_ENV = 'production';
  assert.throws(() => getOverdueFinePolicy(), /must be configured in production/);
  process.env.OVERDUE_FINE_POLICY_KEY = overdueFinePolicyKey;
  process.env.OVERDUE_FINE_MINOR_UNITS = String(defaultOverdueFineMinorUnits);
  process.env.OVERDUE_FINE_GRACE_HOURS = String(defaultOverdueGraceHours);
  assert.deepEqual(getOverdueFinePolicy(), { policyKey: overdueFinePolicyKey, amountMinorUnits: defaultOverdueFineMinorUnits, graceHours: defaultOverdueGraceHours });
});

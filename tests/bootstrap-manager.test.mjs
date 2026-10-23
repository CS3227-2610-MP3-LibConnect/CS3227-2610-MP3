import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';

import {
  assertLocalBootstrapEnvironment,
  buildManagerRecord,
  validateManagerInput,
} from '../scripts/bootstrap-manager.mjs';

const localEnvironment = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_PROJECT_ID: 'demo-libconnect',
  NODE_ENV: 'test',
};

test('manager bootstrap requires the local emulator project', () => {
  assert.throws(() => assertLocalBootstrapEnvironment({}), /FIRESTORE_EMULATOR_HOST/);
  assert.throws(
    () => assertLocalBootstrapEnvironment({ ...localEnvironment, NODE_ENV: 'production' }),
    /production/,
  );
  assert.throws(
    () =>
      assertLocalBootstrapEnvironment({
        ...localEnvironment,
        FIREBASE_PROJECT_ID: 'other-project',
      }),
    /demo-libconnect/,
  );
  assert.doesNotThrow(() => assertLocalBootstrapEnvironment(localEnvironment));
});

test('manager input validation rejects invalid credentials and identity fields', () => {
  const invalidInputs = [
    {
      name: '',
      email: 'manager@example.test',
      employeeId: 'EMP-1',
      password: 'validpass',
      confirmPassword: 'validpass',
    },
    {
      name: 'Manager',
      email: 'not-an-email',
      employeeId: 'EMP-1',
      password: 'validpass',
      confirmPassword: 'validpass',
    },
    {
      name: 'Manager',
      email: 'manager@example.test',
      employeeId: '',
      password: 'validpass',
      confirmPassword: 'validpass',
    },
    {
      name: 'Manager',
      email: 'manager@example.test',
      employeeId: 'EMP-1',
      password: 'short',
      confirmPassword: 'short',
    },
    {
      name: 'Manager',
      email: 'manager@example.test',
      employeeId: 'EMP-1',
      password: 'has space',
      confirmPassword: 'has space',
    },
    {
      name: 'Manager',
      email: 'manager@example.test',
      employeeId: 'EMP-1',
      password: 'validpass',
      confirmPassword: 'different',
    },
  ];
  for (const input of invalidInputs) assert.equal(validateManagerInput(input).ok, false);
});

test('manager record fixes trusted role and status fields', () => {
  const record = buildManagerRecord(
    {
      name: 'Local Manager',
      email: 'manager@example.test',
      employeeId: 'EMP-LOCAL',
    },
    'argon2id-test-placeholder',
    {
      userId: 'manager-user-test',
      now: Timestamp.fromMillis(0),
    },
  );
  assert.deepEqual(
    {
      userId: record.userId,
      emailCanonical: record.emailCanonical,
      accountType: record.accountType,
      accountStatus: record.accountStatus,
      authVersion: record.authVersion,
      employeeIdCanonical: record.employeeIdCanonical,
      isManager: record.isManager,
    },
    {
      userId: 'manager-user-test',
      emailCanonical: 'manager@example.test',
      accountType: 'LIBRARIAN',
      accountStatus: 'ACTIVE',
      authVersion: 0,
      employeeIdCanonical: 'emp-local',
      isManager: true,
    },
  );
});

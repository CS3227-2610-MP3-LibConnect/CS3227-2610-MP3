import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../dist/apps/api/src/storage/firebase.js';
import { AccountStorage } from '../dist/apps/api/src/storage/accounts.js';
import { FirestoreSessionStore } from '../dist/apps/api/src/storage/firestore-session-store.js';
import { StorageError } from '../dist/apps/api/src/storage/repositories.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV === 'production') {
  throw new Error('Run this check with the Firestore Emulator and a non-production environment.');
}

const runId = randomUUID();
const managerAId = `manager-a-${runId}`;
const managerBId = `manager-b-${runId}`;

function manager(userId, employeeId) {
  return {
    userId,
    name: employeeId,
    email: `${userId}@example.test`,
    emailCanonical: `${userId}@example.test`,
    passwordHash: 'emulator-test-hash',
    registrationDateTime: Timestamp.now(),
    accountType: 'LIBRARIAN',
    accountStatus: 'ACTIVE',
    employeeId,
    employeeIdCanonical: employeeId.toLowerCase(),
    isManager: true,
  };
}

const managerA = manager(managerAId, `EMP-A-${runId}`);
const managerB = manager(managerBId, `EMP-B-${runId}`);
const userRefs = [db.collection('users').doc(managerAId), db.collection('users').doc(managerBId)];

try {
  await Promise.all([
    userRefs[0].set(managerA),
    userRefs[1].set(managerB),
  ]);
  const storage = new AccountStorage(db, new FirestoreSessionStore(db));
  const results = await Promise.allSettled([
    storage.updateLibrarianStatus(managerAId, 'INACTIVE', managerA),
    storage.updateLibrarianStatus(managerBId, 'INACTIVE', managerA),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason instanceof StorageError && result.reason.code === 'CONFLICT').length, 1);
  const remainingManagers = await db.collection('users')
    .where('accountType', '==', 'LIBRARIAN')
    .where('accountStatus', '==', 'ACTIVE')
    .where('isManager', '==', true)
    .get();
  assert.equal(remainingManagers.size, 1);
  console.info('Manager emulator concurrency verification passed: concurrent last-manager deactivations preserve one active manager.');
}
finally {
  await Promise.all(userRefs.map((ref) => ref.delete()));
}

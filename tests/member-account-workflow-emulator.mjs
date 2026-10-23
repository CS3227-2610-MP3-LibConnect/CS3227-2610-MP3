import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../dist/apps/api/src/storage/firebase.js';
import { AccountStorage } from '../dist/apps/api/src/storage/accounts.js';
import { FirestoreSessionStore } from '../dist/apps/api/src/storage/firestore-session-store.js';
import { StorageError, UserRepository } from '../dist/apps/api/src/storage/repositories.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV === 'production') {
  throw new Error('Run this check with the Firestore Emulator and a non-production environment.');
}

const runId = randomUUID();
const actorId = `librarian-${runId}`;
const activeMemberId = `member-active-${runId}`;
const inactiveMemberId = `member-inactive-${runId}`;
const nonMemberId = `librarian-target-${runId}`;
const ids = [actorId, activeMemberId, inactiveMemberId, nonMemberId];
const relatedIds = [
  `loan-${runId}`,
  `reservation-${runId}`,
  `fine-${runId}`,
  `notification-${runId}`,
];
const now = Timestamp.now();

function member(userId, memberId, accountStatus) {
  return {
    userId,
    memberId,
    name: memberId,
    email: `${userId}@example.test`,
    emailCanonical: `${userId}@example.test`,
    passwordHash: 'emulator-test-password-hash',
    registrationDateTime: now,
    accountType: 'MEMBER',
    accountStatus,
  };
}

const actor = {
  userId: actorId,
  name: 'Librarian',
  email: `${actorId}@example.test`,
  accountType: 'LIBRARIAN',
  accountStatus: 'ACTIVE',
  employeeId: `employee-${runId}`,
  isManager: false,
};
const sessions = {
  destroyed: [],
  failures: new Set(),
  enqueued: [],
  async destroyForUser(userId) {
    if (this.failures.has(userId)) throw new Error('session store unavailable');
    this.destroyed.push(userId);
  },
  async enqueueRevocation(userId) {
    this.enqueued.push(userId);
  },
};
const storage = new AccountStorage(db, sessions);
const users = new UserRepository(db);
const realSessionStore = new FirestoreSessionStore(db);

function expectStorageError(code) {
  return (error) => error instanceof StorageError && error.code === code;
}

try {
  await Promise.all([
    db
      .collection('users')
      .doc(actorId)
      .set({ ...actor, passwordHash: 'actor-hash', emailCanonical: actor.email }),
    db
      .collection('users')
      .doc(activeMemberId)
      .set(member(activeMemberId, `MEMBER-A-${runId}`, 'ACTIVE')),
    db
      .collection('users')
      .doc(inactiveMemberId)
      .set(member(inactiveMemberId, `MEMBER-I-${runId}`, 'INACTIVE')),
    db
      .collection('users')
      .doc(nonMemberId)
      .set({
        userId: nonMemberId,
        name: 'Librarian target',
        email: `${nonMemberId}@example.test`,
        emailCanonical: `${nonMemberId}@example.test`,
        passwordHash: 'librarian-hash',
        registrationDateTime: now,
        accountType: 'LIBRARIAN',
        accountStatus: 'ACTIVE',
        employeeId: `employee-target-${runId}`,
        employeeIdCanonical: `employee-target-${runId}`,
        isManager: false,
      }),
    db
      .collection('loans')
      .doc(relatedIds[0])
      .set({
        loanId: relatedIds[0],
        memberId: `MEMBER-A-${runId}`,
        status: 'ACTIVE',
        bookTitle: 'Preserved loan',
      }),
    db
      .collection('reservations')
      .doc(relatedIds[1])
      .set({
        reservationId: relatedIds[1],
        memberId: `MEMBER-A-${runId}`,
        status: 'PENDING',
        isbn: '978-preserved',
      }),
    db
      .collection('fines')
      .doc(relatedIds[2])
      .set({
        fineId: relatedIds[2],
        memberId: `MEMBER-A-${runId}`,
        status: 'OUTSTANDING',
        amountMinorUnits: 100,
      }),
    db.collection('notifications').doc(relatedIds[3]).set({
      notificationId: relatedIds[3],
      recipientUserId: activeMemberId,
      notificationType: 'LIBRARIAN_MESSAGE',
      message: 'Preserved notification',
    }),
  ]);

  const firstPage = await storage.listMembers({ limit: 1 }, actor);
  assert.equal(firstPage.items.length, 1);
  assert.ok(firstPage.nextCursor);
  assert.equal(firstPage.items[0].passwordHash, undefined);
  const secondPage = await storage.listMembers({ limit: 1, cursor: firstPage.nextCursor }, actor);
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(secondPage.items[0].userId, firstPage.items[0].userId);
  await assert.rejects(
    storage.listMembers({ status: 'ACTIVE', limit: 1, cursor: firstPage.nextCursor }, actor),
    expectStorageError('INVALID'),
  );

  const before = await db.collection('users').doc(activeMemberId).get();
  const beforeHash = before.get('passwordHash');
  const deactivated = await storage.updateMemberStatus(activeMemberId, 'INACTIVE', actor);
  assert.equal(deactivated.accountStatus, 'INACTIVE');
  assert.deepEqual(sessions.destroyed, [activeMemberId]);
  const afterDeactivate = await db.collection('users').doc(activeMemberId).get();
  assert.equal(afterDeactivate.get('passwordHash'), beforeHash);
  assert.equal(afterDeactivate.get('accountType'), 'MEMBER');
  assert.equal(afterDeactivate.get('memberId'), before.get('memberId'));
  for (const [collection, id] of [
    ['loans', relatedIds[0]],
    ['reservations', relatedIds[1]],
    ['fines', relatedIds[2]],
    ['notifications', relatedIds[3]],
  ]) {
    assert.equal((await db.collection(collection).doc(id).get()).exists, true);
  }

  const unchangedAt = afterDeactivate.get('updatedAt');
  await assert.rejects(
    storage.updateMemberStatus(activeMemberId, 'INACTIVE', actor),
    expectStorageError('CONFLICT'),
  );
  assert.equal(
    (await db.collection('users').doc(activeMemberId).get()).get('updatedAt').toMillis(),
    unchangedAt.toMillis(),
  );
  const activated = await storage.updateMemberStatus(activeMemberId, 'ACTIVE', actor);
  assert.equal(activated.accountStatus, 'ACTIVE');
  assert.equal(sessions.destroyed.length, 1);

  await new Promise((resolve, reject) =>
    realSessionStore.set(
      `session-${runId}`,
      {
        userId: activeMemberId,
        accountType: 'MEMBER',
        cookie: { expires: new Date(Date.now() + 60_000) },
      },
      (error) => (error ? reject(error) : resolve()),
    ),
  );
  await new AccountStorage(db, realSessionStore).updateMemberStatus(
    activeMemberId,
    'INACTIVE',
    actor,
  );
  await new Promise((resolve, reject) =>
    realSessionStore.get(`session-${runId}`, (error, value) => {
      if (error) reject(error);
      else {
        assert.equal(value, null);
        resolve();
      }
    }),
  );
  await storage.updateMemberStatus(activeMemberId, 'ACTIVE', actor);

  await assert.rejects(storage.getMember(nonMemberId, actor), expectStorageError('FORBIDDEN'));
  await assert.rejects(
    storage.getMember(`missing-${runId}`, actor),
    expectStorageError('NOT_FOUND'),
  );
  await assert.rejects(
    storage.updateMemberStatus(`missing-${runId}`, 'ACTIVE', actor),
    expectStorageError('NOT_FOUND'),
  );
  await assert.rejects(
    storage.listMembers({}, { ...actor, accountType: 'MEMBER' }),
    expectStorageError('FORBIDDEN'),
  );
  await assert.rejects(
    storage.listMembers({}, { ...actor, accountStatus: 'INACTIVE' }),
    expectStorageError('FORBIDDEN'),
  );

  const failureTarget = inactiveMemberId;
  await storage.updateMemberStatus(failureTarget, 'ACTIVE', actor);
  sessions.failures.add(failureTarget);
  await assert.rejects(
    storage.updateMemberStatus(failureTarget, 'INACTIVE', actor),
    /session store unavailable/,
  );
  sessions.failures.delete(failureTarget);
  assert.equal(
    (await db.collection('users').doc(failureTarget).get()).get('accountStatus'),
    'INACTIVE',
  );
  sessions.failures.add(failureTarget);
  await assert.rejects(
    storage.updateMemberStatus(failureTarget, 'INACTIVE', actor),
    expectStorageError('CONFLICT'),
  );
  sessions.failures.delete(failureTarget);

  const raceTarget = activeMemberId;
  await storage.updateMemberStatus(raceTarget, 'INACTIVE', actor);
  const race = await Promise.allSettled([
    storage.updateMemberStatus(raceTarget, 'ACTIVE', actor),
    storage.updateMemberStatus(raceTarget, 'ACTIVE', actor),
  ]);
  assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    race.filter(
      (result) =>
        result.status === 'rejected' &&
        result.reason instanceof StorageError &&
        result.reason.code === 'CONFLICT',
    ).length,
    1,
  );

  console.info(
    'Member account workflow emulator verification passed: bounded member reads, safe transitions, no-op conflicts, target validation, revocation failure preservation, and concurrent status serialization are enforced.',
  );
} finally {
  await Promise.all([
    ...ids.map((userId) => db.collection('users').doc(userId).delete()),
    ...relatedIds.map((id, index) =>
      db.collection(['loans', 'reservations', 'fines', 'notifications'][index]).doc(id).delete(),
    ),
  ]);
}

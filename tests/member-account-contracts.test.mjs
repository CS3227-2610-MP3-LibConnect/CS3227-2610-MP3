import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import {
  memberCursorSchema,
  memberListQuerySchema,
  memberStatusRequestSchema,
  memberUserIdSchema,
  safeMemberAccount,
} from '../dist/apps/api/src/http/member-account-contracts.js';

test('member account contracts apply bounded strict validation', () => {
  assert.deepEqual(memberListQuerySchema.parse({}), { limit: 20 });
  assert.deepEqual(memberListQuerySchema.parse({ status: 'ACTIVE', limit: '50' }), {
    status: 'ACTIVE',
    limit: 50,
  });
  assert.throws(() => memberListQuerySchema.parse({ role: 'LIBRARIAN' }));
  assert.throws(() => memberListQuerySchema.parse({ limit: 51 }));
  assert.throws(() => memberListQuerySchema.parse({ cursor: '' }));
  assert.throws(() => memberStatusRequestSchema.parse({ status: 'PENDING' }));
  assert.throws(() =>
    memberStatusRequestSchema.parse({ status: 'ACTIVE', accountType: 'LIBRARIAN' }),
  );
  assert.throws(() => memberUserIdSchema.parse('member/foreign'));
});

test('member cursors are filter-bound contract values', () => {
  const cursor = memberCursorSchema.parse({
    status: null,
    lastRegistrationDateTime: '2026-10-22T00:00:00.000Z',
    lastUserId: 'member-1',
  });
  assert.equal(cursor.status, null);
  assert.throws(() => memberCursorSchema.parse({ ...cursor, status: 'PENDING' }));
  assert.throws(() => memberCursorSchema.parse({ ...cursor, lastUserId: 'member/1' }));
});

test('member DTO serialization allowlists only approved fields', () => {
  const member = safeMemberAccount({
    userId: 'user-1',
    memberId: 'member-1',
    name: 'Member',
    email: 'member@example.test',
    accountStatus: 'ACTIVE',
    registrationDateTime: Timestamp.fromMillis(0),
    accountType: 'MEMBER',
    passwordHash: 'secret',
    sessionId: 'session-secret',
    authVersion: 9,
    isManager: true,
  });
  assert.deepEqual(member, {
    userId: 'user-1',
    memberId: 'member-1',
    name: 'Member',
    email: 'member@example.test',
    accountStatus: 'ACTIVE',
    registrationDateTime: '1970-01-01T00:00:00.000Z',
  });
  assert.doesNotMatch(JSON.stringify(member), /secret|session|authVersion|isManager|accountType/);
});

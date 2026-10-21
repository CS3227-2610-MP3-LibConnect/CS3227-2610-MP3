import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemberAssistantRateLimiter } from '../../dist/apps/api/src/assistant/rate-limiter.js';

test('enforces five reservations per member in a fixed minute window', () => {
  let now = 1_000;
  const limiter = createMemberAssistantRateLimiter({ now: () => now });

  for (let request = 0; request < 5; request += 1) {
    assert.equal(limiter.reserve('member-a'), true, `request ${request + 1} should be allowed`);
  }
  assert.equal(limiter.reserve('member-a'), false);
  assert.equal(limiter.reserve('member-b'), true, 'one member must not consume another member quota');

  now += 60_000;
  assert.equal(limiter.reserve('member-a'), true, 'quota resets at the next fixed-window boundary');
});

test('enforces the process-global cap of 60 reservations per fixed minute window', () => {
  let now = 2_000;
  const limiter = createMemberAssistantRateLimiter({ now: () => now });

  for (let request = 0; request < 60; request += 1) {
    assert.equal(limiter.reserve(`member-${request}`), true, `global request ${request + 1} should be allowed`);
  }
  assert.equal(limiter.reserve('member-after-global-cap'), false);

  now += 60_000;
  assert.equal(limiter.reserve('member-after-global-cap'), true, 'global quota resets at the next window');
});

test('denies when either quota is exhausted and does not reserve the other quota on denial', () => {
  let now = 3_000;
  const limiter = createMemberAssistantRateLimiter({ now: () => now });

  // Exhaust one member's quota, then verify that this member cannot use any
  // remaining process-global capacity.
  for (let request = 0; request < 5; request += 1) assert.equal(limiter.reserve('member-a'), true);
  assert.equal(limiter.reserve('member-a'), false);
  for (let member = 0; member < 55; member += 1) assert.equal(limiter.reserve(`other-${member}`), true);
  assert.equal(limiter.reserve('member-a'), false);
  assert.equal(limiter.reserve('one-more-member'), false, 'the preceding denial must not bypass the global cap');

  now += 60_000;
  assert.equal(limiter.reserve('member-a'), true, 'both quotas become available in the next window');
});

test('concurrent same-process reservations never exceed per-member or global quotas', async () => {
  const limiter = createMemberAssistantRateLimiter({ now: () => 4_000 });
  const memberResults = await Promise.all(Array.from({ length: 100 }, async () => limiter.reserve('same-member')));
  assert.equal(memberResults.filter(Boolean).length, 5);

  const globalLimiter = createMemberAssistantRateLimiter({ now: () => 4_000 });
  const globalResults = await Promise.all(Array.from({ length: 100 }, async (_unused, index) => globalLimiter.reserve(`member-${index}`)));
  assert.equal(globalResults.filter(Boolean).length, 60);
});

test('expires stale member entries and keeps tracked member state bounded', () => {
  let now = 5_000;
  const limiter = createMemberAssistantRateLimiter({ now: () => now, maxMembers: 3 });

  assert.equal(limiter.reserve('member-a'), true);
  assert.equal(limiter.reserve('member-b'), true);
  assert.equal(limiter.reserve('member-c'), true);
  assert.equal(limiter.getTrackedMemberCount(), 3);
  assert.equal(limiter.reserve('member-d'), false, 'new member is denied when the bounded state is full');
  assert.equal(limiter.getTrackedMemberCount(), 3);

  now += 60_000;
  assert.equal(limiter.reserve('member-d'), true, 'expired entries are pruned before admitting a new member');
  assert.equal(limiter.getTrackedMemberCount(), 1);

  for (let member = 0; member < 20; member += 1) {
    now += 60_000;
    assert.equal(limiter.reserve(`rolling-${member}`), true);
    assert.ok(limiter.getTrackedMemberCount() <= 3, 'tracked member state must never exceed maxMembers');
  }
});


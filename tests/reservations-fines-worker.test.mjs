import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

process.env.FIREBASE_PROJECT_ID ??= 'demo-libconnect';
const { WorkerDeadlineError, runWorker } =
  await import('../dist/apps/api/src/storage/expire-reservations.js');

test('worker retries transient failures with bounded backoff', async () => {
  let attempts = 0;
  const startedAt = Date.now();
  await runWorker(() => {
    attempts += 1;
    return {
      async expireReservations() {
        if (attempts < 3) throw new Error('transient');
        return { examined: 0, expired: 0 };
      },
      async processOverdue() {
        if (attempts < 3) throw new Error('transient');
        return { examined: 0, issued: 0, policyKey: 'test' };
      },
    };
  }, 1_000);
  assert.equal(attempts, 3);
  assert.ok(Date.now() - startedAt >= 250);
});

test('worker does not retry after a deadline timeout', async () => {
  let attempts = 0;
  const pending = new Promise(() => {});
  await assert.rejects(
    () =>
      runWorker(() => {
        attempts += 1;
        return { expireReservations: async () => pending, processOverdue: async () => pending };
      }, 10),
    WorkerDeadlineError,
  );
  assert.equal(attempts, 1);
});

test('worker failure logging excludes raw error messages', async () => {
  const source = await readFile(
    new URL('../apps/api/src/storage/expire-reservations.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /errorType: error instanceof Error \? error\.name/);
  assert.doesNotMatch(source, /event: 'circulation_worker_failed',[^\n]*message:/);
});

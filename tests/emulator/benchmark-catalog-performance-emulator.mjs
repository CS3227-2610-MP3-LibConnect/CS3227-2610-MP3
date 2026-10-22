import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { Query } from '@google-cloud/firestore';
import { Timestamp } from 'firebase-admin/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? 'demo-libconnect';
if (process.env.NODE_ENV === 'production' || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulatorHost) || projectId !== 'demo-libconnect') {
  throw new Error('Benchmark requires a local Firestore emulator, non-production NODE_ENV, and demo-libconnect project.');
}

process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.NODE_ENV = 'development';
process.env.SESSION_SECRET = randomUUID() + randomUUID();
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

let booksDocumentsReturned = 0;
const originalQueryGet = Query.prototype.get;
Query.prototype.get = async function (...args) {
  const snapshot = await originalQueryGet.apply(this, args);
  booksDocumentsReturned += snapshot.docs.filter((doc) => doc.ref.parent.id === 'books').length;
  return snapshot;
};

const portProbe = createServer();
await new Promise((resolve, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolve);
});
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
process.env.PORT = String(port);
const apiOrigin = `http://127.0.0.1:${port}`;

const { db } = await import('../../dist/apps/api/src/storage/firebase.js');
await import('../../dist/apps/api/src/server.js');

const runId = randomUUID().replaceAll('-', '');
const numericRunId = [...runId].map((digit) => Number.parseInt(digit, 16) % 10).join('');
const email = `catalog-benchmark-${runId}@example.test`;
const password = `Bench-${runId}-Password`;
const tag = `CatalogBench${runId}`;
const isbnFor = (index) => `978${numericRunId.slice(0, 6)}${String(index).padStart(4, '0')}`;
const userIds = [];
const bookIds = [];
let cookie;

async function call(path, options = {}) {
  return fetch(new URL(path, apiOrigin), {
    ...options,
    headers: {
      Origin: process.env.CLIENT_ORIGIN,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
}

async function waitForApi() {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    try {
      const response = await fetch(`${apiOrigin}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local API did not become ready at ${apiOrigin}.`);
}

async function authenticate() {
  const registration = await call('/api/v1/auth/register', {
    method: 'POST', body: JSON.stringify({
      accountType: 'MEMBER', name: 'Catalog Performance Benchmark', email, password, confirmPassword: password,
    }),
  });
  assert.equal(registration.status, 201, 'benchmark member registration must succeed on the local API');
  userIds.push((await registration.json()).user.userId);
  const login = await call('/api/v1/auth/login', {
    method: 'POST', body: JSON.stringify({ accountType: 'MEMBER', email, password }),
  });
  assert.equal(login.status, 200, 'benchmark member login must succeed');
  const session = login.headers.getSetCookie().find((header) => header.startsWith('libconnect.sid='));
  assert.ok(session, 'login must return the session cookie');
  cookie = session.split(';')[0];
}

async function seedBooks() {
  const now = Timestamp.now();
  const records = Array.from({ length: 1000 }, (_, index) => {
    const isbn = isbnFor(index);
    const isSparseMatch = index % 100 === 0;
    const title = isSparseMatch ? `${tag} sparse` : `${tag} common`;
    return {
      isbn, title, author: 'Benchmark Author', publicationYear: 8888,
      publisher: 'Benchmark Press', category: 'Benchmark', synopsis: 'Emulator benchmark fixture.',
      createdAt: now, updatedAt: now,
    };
  });
  bookIds.push(...records.map((book) => book.isbn));
  const writes = await Promise.allSettled(records.map((book) => db.collection('books').doc(book.isbn).create(book)));
  const failures = writes.filter((result) => result.status === 'rejected');
  assert.equal(failures.length, 0, `all benchmark fixture writes must succeed (${failures.length} failed)`);
}

function percentile90(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.9) - 1];
}

async function measure(name, title, expectedItems) {
  booksDocumentsReturned = 0;
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: 50 }, async () => {
    const began = performance.now();
    const response = await call(`/api/v1/books?publicationYear=8888&title=${encodeURIComponent(title)}`);
    assert.equal(response.status, 200, `${name} search should return HTTP 200`);
    const payload = await response.json();
    assert.equal(payload.items.length, expectedItems, `${name} should return its expected item count`);
    const elapsedMs = performance.now() - began;
    return elapsedMs;
  }));
  const wallMs = performance.now() - started;
  const documentsReturned = booksDocumentsReturned;
  return {
    scenario: name,
    requests: results.length,
    concurrency: 50,
    p90ApiLatencyMs: Number(percentile90(results).toFixed(2)),
    minApiLatencyMs: Number(Math.min(...results).toFixed(2)),
    maxApiLatencyMs: Number(Math.max(...results).toFixed(2)),
    batchWallTimeMs: Number(wallMs.toFixed(2)),
    catalogQueryDocumentsReturned: documentsReturned,
    averageReturnedPerRequest: Number((documentsReturned / results.length).toFixed(2)),
  };
}

try {
  await waitForApi();
  await authenticate();
  await seedBooks();

  // Warm the route and indexes before resetting the returned-document counter.
  const warmup = await call('/api/v1/books?publicationYear=8888&title=warmup');
  assert.equal(warmup.status, 200);
  await warmup.arrayBuffer();

  const results = [];
  results.push(await measure('common-match', tag, 20));
  results.push(await measure('sparse-match', `${tag} sparse`, 10));
  results.push(await measure('no-match', `${tag} never-matches`, 0));

  console.log(JSON.stringify({
    measurement: 'local API + Firestore emulator simulation; not production latency or billable production read units',
    fixture: { books: 1000, exactPublicationYear: 8888 },
    workload: { concurrentRequestsPerScenario: 50, pageLimit: 20 },
    documentMetric: 'books Query.get snapshot documents returned, including scan batches and lookahead reads',
    objective: 'p90 API response time < 500 ms',
    results,
  }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  const [sessionSnapshots, identitySnapshots] = await Promise.all([
    Promise.all(userIds.map((userId) => db.collection('sessions').where('userId', '==', userId).get())),
    Promise.all(userIds.map((userId) => db.collection('identityKeys').where('ownerUserId', '==', userId).get())),
  ]);
  await Promise.all([
    ...bookIds.map((isbn) => db.collection('books').doc(isbn).delete()),
    ...sessionSnapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.ref.delete())),
    ...identitySnapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.ref.delete())),
    ...userIds.map((userId) => db.collection('users').doc(userId).delete()),
  ]);
  // This standalone benchmark owns its local API process.
  process.exit();
}

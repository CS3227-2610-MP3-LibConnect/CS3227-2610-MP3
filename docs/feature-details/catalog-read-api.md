# Catalog Read API

## Purpose and status

The catalog API provides authenticated book and physical-copy search and detail reads through Express, with Firestore access confined to the server. Active members and librarians have equal read access. Librarian catalog writes are outside this read feature.

The query-contract, repository filtering, authenticated-route, inclusive year-range, member UI, index, and emulator-acceptance tasks are implemented. The performance objective is p90 API response time below 500 ms, following the [API response-time benchmark article](https://medium.com/@jfindikli/the-ultimate-guide-to-faster-api-response-times-p50-p90-p99-latencies-0fb60f0a0198). Representative catalog size and expected concurrency remain to be agreed, so performance measurement is still blocked.

## Architecture and request flow

- `apps/client/src/pages/MemberDashboard.tsx` builds and submits the selected field-specific book filters. Its `buildMemberBookFilters` trims text, parses year values, requires both range bounds, and prevents combining exact year with a range. Pagination resubmits the same filters with the returned cursor.
- `apps/client/src/api/catalog.ts` defines `BookFilters`, `CopyFilters`, page types, and catalog API methods. `apiRequest` in `apps/client/src/api/base.ts` includes session credentials and shared error handling.
- `apps/api/src/server.ts` mounts catalog routes below `/api/v1` behind active-actor authentication.
- `apps/api/src/routes/catalog.ts` validates query strings, enforces the active-actor policy, returns the established detail response shapes, and converts Firestore timestamps to ISO strings.
- `apps/api/src/storage/repositories.ts` applies exact ISBN/year or ISBN/status filters in Firestore where supported, orders by document ID, scans in batches of 100, and applies case-insensitive substring and year-range checks in the repository. Cursors bind the normalized filter object to the last scanned document ID.

## API contract

| Request | Behavior |
|---|---|
| `GET /api/v1/books` | Returns `{ items, page: { limit, nextCursor } }`. Substring filters: `title`, `author`, `publisher`, `category`. Exact filters: `isbn`, `publicationYear`. Inclusive range: paired `publicationYearFrom` and `publicationYearTo`. |
| `GET /api/v1/copies` | Returns the same page envelope. Substring filter: `shelfLocation`. Exact filters: `isbn`, `copyId`, `status`. |
| `GET /api/v1/books/:isbn` | Returns `{ book, copies, availability }`. |
| `GET /api/v1/books/:isbn/copies` | Returns `{ isbn, items }`; optional `status` narrows the copies. |
| `GET /api/v1/copies/:copyId` | Returns one copy. |

Page size defaults to 20 and allows integers from 1 through 50. Supplied exact years must contain digits only and be between 0 and 9999. Range endpoints must both be supplied, be digit strings from 0 to 9999, and be in ascending order; an exact year cannot be combined with a range. Unknown filters, blank values, malformed cursors, invalid limits, and cursor/filter mismatches use the shared `400` error envelope. Missing individual books/copies return `404`; no-match lists return `200` with an empty `items` array.

Book matching supports author values stored as one string or an array. All filters combine with AND semantics. Synopsis is never searched, but is included in returned book records. Copy status is matched against the supported status enum. Direct browser Firestore access remains denied by `firestore.rules`.

## Indexes

`firestore.indexes.json` contains the catalog composites required by the repository's exact-filter query shapes:

- `books`: `isbn ASCENDING`, `publicationYear ASCENDING`, `__name__ ASCENDING`.
- `bookCopies`: `isbn ASCENDING`, `status ASCENDING`, `__name__ ASCENDING`.

`tests/shared/catalog-firestore-indexes.test.mjs` checks those fields and `COLLECTION` query scope.

## Emulator and automated verification

`npm test` builds the project and passed **251/251** tests on 2026-10-21. Catalog unit coverage includes `tests/shared/catalog-query-contract.test.mjs`, `tests/shared/catalog-year-range.test.mjs`, client API tests, and the composite-index assertion.

`npm run verify:catalog-acceptance:emulator` runs both `tests/emulator/verify-catalog-acceptance-emulator.mjs` and `tests/emulator/verify-catalog-year-range-emulator.mjs`. On 2026-10-21, both passed against the local Firestore Emulator and API using the `demo-libconnect` project. The acceptance verifier exercises member/librarian access, unauthenticated and inactive denial, supported book/copy filters and combinations, synopsis exclusion, timestamp serialization, empty and missing results, validation errors, copy pagination, and sparse scanning across more than two repository batches. The range verifier checks exact-year compatibility, inclusive endpoints, invalid combinations, cursor continuation, and cursor identity across changed ranges/filters. Both scripts guard for the local demo project and clean up created records and sessions.

## Performance verification

`tests/emulator/benchmark-catalog-performance-emulator.mjs` seeds 1,000 tagged books in the local Firestore Emulator and runs 50 concurrent authenticated requests for each of three exact-year-plus-title searches, with a page limit of 20. It measures each request through JSON parsing and calculates p90 using the nearest-rank method. The script instruments Admin SDK `Query.get` snapshots to count book documents returned to the API, including scan batches and lookahead reads. The counter measures documents returned by queries; the emulator does not report production billing units.

On 2026-10-21, this small-scale local simulation produced:

| Scenario | p90 API latency | Book documents returned | Average per request | Returned items per request |
|---|---:|---:|---:|---:|
| Common match | 990.71 ms | 5,050 | 101 | 20 |
| Sparse match (10 of 1,000 books) | 4,483.08 ms | 50,000 | 1,000 | 10 |
| No match | 4,354.73 ms | 50,000 | 1,000 | 0 |

All three p90 values exceed the objective of less than 500 ms. The common-match scan returns one 100-document batch and one lookahead result per request; sparse and no-match searches scan all 1,000 books. These measurements describe the local emulator simulation and do not establish production latency. The scan design has not been changed; selecting an indexed-search strategy or search service requires a separate design decision.

To run the simulation, start `npm run emulator`, then run the benchmark from another shell with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8081` and `FIREBASE_PROJECT_ID=demo-libconnect` set. The benchmark starts a local API process, creates temporary account and book fixtures, and removes its books, account, identity keys, and sessions on completion.

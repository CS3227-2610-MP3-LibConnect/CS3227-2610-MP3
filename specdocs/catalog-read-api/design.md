# Catalog Read API

## Description

Add authenticated read endpoints for catalog books and physical book copies. Express routes query Firestore through server-side repositories so active members and librarians can search catalog data without browser access to Firestore.

## Purpose

Let LibConnect users find books and inspect copy availability by ISBN, status, and selected field-specific substring searches. Firestore remains the source of truth. Substring matching is performed by the API after applying any supported exact Firestore filters.

## Why this change is required

The inspected compiled API already implements some catalog reads, but the available behavior does not meet the requested contract:

- `GET /api/v1/books` searches by title prefix only.
- `GET /api/v1/books/:isbn/copies` lists copies for one ISBN, with no status filter.
- `GET /api/v1/copies/:copyId` retrieves one copy by ID.
- The existing GET handlers do not require an active signed-in actor.

These handlers are in `dist/apps/api/src/routes/catalog.js`. The repository contains compiled backend artifacts but no TypeScript source tree in the inspected paths. `PLAN.md` says implementation has not started, so the compiled artifacts and planning document reflect different states. This design uses compiled artifacts as evidence of the current API shape; implementation should be applied to the actual source when located.

The project already has the relevant foundation: `firebase.json` configures the Firestore emulator on port 8080; `firestore.rules` denies direct browser reads and writes; `dist/apps/api/src/storage/repositories.js` uses `books` and `bookCopies` collections; and `dist/apps/api/src/server.js` mounts catalog routes at `/api/v1` with session middleware.

## Capabilities

### Added

- Authenticated list and filter endpoints for books and book copies.
- Field-specific substring search over the selected supported text fields.
- Optional status filtering for copies, allowing clients to request only `AVAILABLE` copies or another status.
- Bounded, cursor-based pagination for list endpoints.

### Modified

- Existing catalog GET endpoints will require an active signed-in member or librarian.
- Existing book and copy listing endpoints gain the filters described below.

The existing book/copy domain records and state transitions are not changed by this feature.

## Product specifications

### Access

- Only signed-in users with an active account may use these read endpoints.
- Both `MEMBER` and `LIBRARIAN` accounts have the same read access.
- Unauthenticated requests are rejected. Inactive accounts are rejected by the existing active-actor policy.

### Search and filters

Book list filters:

| Query parameter | Match behavior |
|---|---|
| `title` | Case-insensitive substring of title |
| `author` | Case-insensitive substring of an author string, or any element when author is stored as an array |
| `publisher` | Case-insensitive substring of publisher |
| `category` | Case-insensitive substring of category |
| `isbn` | Exact ISBN match |
| `publicationYear` | Exact integer match |

Book synopsis is returned in matching book records but is not searched.

Book-copy list filters:

| Query parameter | Match behavior |
|---|---|
| `shelfLocation` | Case-insensitive substring match |
| `isbn` | Exact ISBN match |
| `copyId` | Exact copy ID match |
| `status` | Exact enum match (`AVAILABLE`, `IN_TRANSIT`, `ON_LOAN`, `DAMAGED`, `LOST`, `RESERVED`) |

When multiple filters are provided, they are combined with AND semantics. A list request with no matching records returns an empty `items` array. Single-record lookup for a missing ISBN or copy ID returns `404`.

### Acceptance criteria

1. An active signed-in member and an active signed-in librarian can read book and copy records.
2. Unauthenticated requests and inactive-account requests are rejected consistently with existing authentication middleware.
3. A query such as `GET /api/v1/books?author=tolkien` matches any author value containing `tolkien`, without case sensitivity.
4. A query such as `GET /api/v1/books?isbn=...&publicationYear=...` applies exact filters together.
5. Synopsis values do not affect whether a book matches a search, but are included in the returned full book record.
6. Copy list requests can combine exact `isbn`, `copyId`, and `status` filters with a `shelfLocation` substring filter.
7. `GET /api/v1/books/:isbn/copies` returns `{ isbn, items }`; an optional `status` filter narrows `items`. Omitting status returns copies in all statuses.
8. List endpoints enforce a maximum page size and use cursors rather than offsets. Cursors are opaque and bound to the filter set and scan position.
9. Invalid query fields, values, cursor/filter mismatches, and out-of-range limits return `400` in the existing API error envelope.
10. Missing specific books and copies return `404`; no-match list queries return `200` with an empty list.
11. Firestore timestamps in API responses are serialized as ISO 8601 strings.
12. Performance is measured against a realistic catalog size and expected concurrent request load. A numeric response-time objective remains to be set before performance verification; no target is invented by this design.

## Technical specifications

### API contract

All routes are under `/api/v1` and require an active actor.

| Method and path | Behavior and response |
|---|---|
| `GET /api/v1/books` | Search/filter books; returns `{ items, page: { limit, nextCursor } }`. |
| `GET /api/v1/books/:isbn` | Preserve existing response shape `{ book, copies, availability }`, where availability contains total count, available count, and counts by status. |
| `GET /api/v1/books/:isbn/copies` | Preserve existing `{ isbn, items }` response shape; accept optional exact `status` filter. |
| `GET /api/v1/copies` | Search/filter copies; returns `{ items, page: { limit, nextCursor } }`. |
| `GET /api/v1/copies/:copyId` | Return the specific copy record. |

The list envelope and pagination parameters should follow the existing `/books` contract where practical: `limit` is bounded (proposed range 1–50; default 20), and `cursor` is opaque. Existing book search currently uses `q` for title-prefix search; replace or deprecate that behavior in favor of field-specific parameters as part of this API change. The client integration must be updated with the route contract.

Single-book responses include all book fields, including synopsis. Existing `GET /books/:isbn` also loads copies and calculates availability; preserve that behavior unless source inspection during implementation establishes a compatibility reason to change it. Single-copy responses include the full copy record.

### Substring implementation and performance

The approved initial approach uses Firestore exact filters to reduce candidate documents, then performs a case-insensitive substring check in the API for the selected field. It does not add n-gram fields or a dedicated search service.

Because Firestore's ordinary query operators do not provide arbitrary substring matching, a request with only a substring filter may need to scan the collection. The repository must scan using bounded batches and cursors, applying the substring check to each candidate and stopping when it has filled the requested result page or reached the end. The continuation cursor must represent the last scanned document, not merely the last returned match, so sparse-match searches can continue without repeating documents. A page size bounds the response, but does not by itself bound the documents that must be scanned to find matches.

For this initial design, performance control consists of:

- Apply exact filters in Firestore before substring matching wherever possible.
- Enforce bounded page sizes and request validation.
- Measure API latency and Firestore documents read for representative and sparse/no-match searches.
- Benchmark against a realistic catalog and expected concurrency, then agree on a numeric response-time objective.
- Keep data access behind a repository boundary so the search implementation can change if measurements show that a scan no longer meets the agreed objective.

If the scan fails the agreed objective, evaluate an indexed search implementation or service. Firebase documents full-text search as a separate solution and documents Firestore Enterprise text search as requiring text indexes; verify its match semantics and edition requirements before selecting it. The choice to add such a service or change editions is outside this initial feature approval.

### Data and storage

- Books remain in the `books` collection, keyed by ISBN.
- Book copies remain in `bookCopies`, keyed by copy ID.
- No domain fields or status transitions change.
- Synopsis remains available in returned book records but is not used as a search field.
- The browser continues to access data only through Express. Firestore rules remain deny-by-default for browser access.
- Queries combining exact filters and ordering may require composite indexes. Add required index definitions to `firestore.indexes.json` based on actual repository query shapes; the current file contains no composite indexes.

### Validation and errors

- Validate query parameters with the existing Zod-based request validation approach.
- Reject unknown filter names and malformed ISBN, status, publication year, cursor, and limit values.
- Preserve the existing error response shape: `{ error: { code, message, fields? } }`.
- Map missing record errors to `404`, validation errors to `400`, and authentication/authorization errors according to the existing middleware.
- Do not expose Firestore internals or stack traces in API errors.

### Dependencies and compatibility

- Use existing Express session middleware and active-actor authorization policy.
- Use the existing Firestore Admin repository boundary; do not add direct browser Firestore access.
- Add no search service or n-gram dependency for the initial implementation.
- Update UI API calls from title-prefix-only search to field-specific filters.
- Preserve `{ isbn, items }` for `GET /books/:isbn/copies` and preserve the existing composite book detail response.

## Integration specifications

### Request flow

1. The React client sends a cookie-authenticated request to the Express API.
2. Session middleware resolves the actor; route middleware requires an active account.
3. The route validates query parameters and passes normalized filters, page size, and cursor to the catalog repository.
4. The repository applies exact Firestore filters, scans pages of candidates as needed, and applies the selected substring test.
5. The API serializes timestamps and returns a bounded result page or the existing single-resource response.

### Security and data ownership

- The Express server is the only application component that reads Firestore.
- Active members and librarians have the same read-only access to these catalog records.
- Client-supplied role fields are not used for authorization.
- Catalog text is data only and has no authority over server behavior.

### Emulator and environment

- Local development uses the configured Firestore emulator.
- Development and production projects and credentials remain separate per `Overview.md`.
- Performance measurements for production-like latency cannot be inferred from emulator timing alone; use representative data and the intended deployment environment for final latency evaluation.

## Out of scope

- Book or copy create, update, and delete endpoints.
- Loan, reservation, fine, notification, or account-data reads.
- Unauthenticated public catalog access.
- Searching synopsis, ISBN, status, or publication year as substrings.
- Full-text relevance ranking, typo tolerance, token search, or n-gram indexing.
- Selecting or deploying a third-party search service or changing Firestore edition.
- Setting a numeric latency objective before the team agrees on one.

## Risks and tradeoffs

- Collection scanning can have latency and read costs proportional to candidate volume, especially for sparse or no-match substring searches.
- Exact filters help only when supplied and selective; they cannot guarantee bounded scan work for all requests.
- A cursor must track scan progress correctly to avoid skipped or duplicated matches across pages.
- Multiple exact filters and sort/cursor behavior may require composite indexes.
- Requiring authentication changes existing GET behavior for any caller that currently relies on unauthenticated catalog reads.
- The compiled routes indicate current behavior, but the absence of TypeScript source in inspected paths means implementers must locate the source of truth before changing code.

## Open decisions

1. Agree on a numeric latency objective (for example, a p95 threshold) and representative catalog size/concurrency before performance verification.
2. If measured scan performance misses that objective, select an indexed search strategy or service in a follow-up design before adding it.

## Context reviewed

- `Overview.md` — product scope, user roles, Book and BookCopy fields, statuses, and Firebase environment separation.
- `PLAN.md` — architecture baseline, capability modules, build order, and catalog/inventory plan.
- `firebase.json` — Firestore emulator on port 8080.
- `firestore.rules` — deny-by-default browser access.
- `firestore.indexes.json` — currently no composite indexes.
- `dist/apps/api/src/routes/catalog.js` — current catalog GET route shapes and authorization behavior.
- `dist/apps/api/src/server.js` — session setup and `/api/v1` route mount.
- `dist/apps/api/src/storage/repositories.js` — Firestore collection names and repository methods.
- `dist/apps/api/src/http/errors.js` — current validation and API error format.
- No TypeScript source files or existing design documents were found in the inspected paths.

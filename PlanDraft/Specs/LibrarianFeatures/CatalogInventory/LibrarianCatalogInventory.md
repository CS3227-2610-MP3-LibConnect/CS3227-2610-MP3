# FEATURE: Librarian Catalog and Inventory Management

**Status:** Human-approved `0.2-approved` on 2026-10-20; implementation
checklist and handoff approval remain separate gates

**Plan position:** Jiali feature order 3 in `PLAN.md`; capability
`catalog-inventory`

## Context and source traceability

This slice is the next planned Jiali feature after manager account
administration and librarian password reset. `Overview.md` requires librarians
to create, view, update, and delete book and book-copy records. `PLAN.md`
adds synopsis, catalog search, copy availability, status validation, and
librarian-facing dashboard data.

The current branch already contains a partial server-side catalog contract:

- `apps/api/src/routes/catalog.ts` exposes authenticated reads and librarian
  mutations for books and copies.
- `apps/api/src/storage/repositories.ts` contains Firestore-backed book/copy
  operations, pagination, deletion guards, and server-side librarian checks.
- `packages/shared/src/domain/records.ts` defines `BookRecordSchema`,
  `BookCopyRecordSchema`, and the circulation-controlled `CopyStatus` values.
- `apps/client/src/api/catalog.ts` contains a typed read client, but the
  current working tree has no librarian catalog/inventory page or dashboard
  route.

The existing implementation is evidence of integration points, not authority
to silently change requirements. This specification preserves compatible
behavior and makes the missing librarian-facing contract and verification
requirements explicit.

## Objective

Allow an active librarian to maintain the book catalog and physical-copy
inventory through the trusted Express/Firestore boundary, while allowing active
members and librarians to search the catalog and inspect copy availability.
The feature must preserve circulation invariants: generic inventory CRUD may
edit catalog metadata and shelf location, but it may not directly change a
copy's circulation status or create dangling book/copy/reservation references.

Success means that an authorized librarian can perform safe book and copy CRUD,
see current availability and inventory summary data, and receive precise
validation or conflict feedback. Signed-out users, inactive users, members
attempting mutations, forged role fields, malformed requests, and concurrent
reference/state races cannot cause unauthorized or inconsistent writes.

## Scope

### In scope

- Authenticated catalog reads for active members and active librarians.
- Book search, deterministic pagination, book detail, copy listing, and
  per-book availability summaries.
- Librarian-only book create, partial metadata update, and guarded delete.
- Librarian-only physical-copy create, shelf-location update, and guarded
  delete.
- A server-computed librarian inventory summary for dashboard presentation.
- React librarian catalog/inventory screens or dashboard sections that consume
  the server contract, display validation/conflict states, and do not write
  Firestore directly.
- Typed request validation, existing error-envelope compatibility, safe
  response serialization, authorization, transaction boundaries, and tests.

### Out of scope

- Loans, renewals, member return/loss reports, reservation creation/fulfilment,
  fines, and notifications. Read-only loan/reservation reference checks needed
  to protect catalog and copy deletion are in scope.
- Any direct generic mutation of `CopyStatus`; circulation owns transitions to
  `ON_LOAN`, `IN_TRANSIT`, `RESERVED`, `DAMAGED`, and `LOST`.
- Member borrowing or reservation UI.
- Manager-only privileges, account activation, password reset, profile changes,
  or public registration.
- Images/book-cover storage, external metadata providers, bulk import/export,
  soft deletion, cascading deletion, or new dependencies.
- AI/model calls, prompts, model tools, or model-authorized writes.

## Actors and authorization

| Actor | Read catalog/copies | Mutate books/copies | Inventory summary |
|---|---:|---:|---:|
| Signed out | Denied by the current authenticated-API baseline | Denied | Denied |
| Inactive member or librarian | Denied | Denied | Denied |
| Active member | Allowed | Denied | Denied |
| Active librarian, including manager | Allowed | Allowed | Allowed |

The server loads the authenticated actor from the current session and then
reloads the current Firestore user record. Client-supplied `accountType`,
`accountStatus`, `isManager`, actor IDs, ownership fields, or target objects
are never authorization inputs. Manager status does not grant extra catalog
rights in this slice.

## Domain and data contract

### Book

A book is identified by its immutable ISBN document ID. The editable fields
are `title`, `author`, `publicationYear`, `publisher`, `category`, and
`synopsis`. The server owns `createdAt` and `updatedAt`.

The approved write contract is: ISBN is trimmed, bounded, and may contain
digits, `X`/`x`, and hyphens; required text is trimmed and non-empty;
`author` is either one required string or a non-empty bounded string array;
`publicationYear` is an integer from `0` through `9999`; and `synopsis` is
bounded text. ISBN checksum validation remains out of scope for this release.

### Book copy

A copy has an immutable server-generated `copyId`, immutable parent `isbn`,
editable `shelfLocation`, circulation-controlled `status`, optional
`reservationId`, and server-owned timestamps.

The allowed statuses are `AVAILABLE`, `IN_TRANSIT`, `ON_LOAN`, `DAMAGED`,
`LOST`, and `RESERVED`. A newly created copy starts as `AVAILABLE`. Generic
copy updates accept shelf-location metadata only. A copy status may be changed
only by the later circulation workflows that own the relevant transition.

### Relationships and deletion rules

- A copy cannot be created unless its parent book exists.
- A book cannot be deleted while any copy or reservation references its ISBN.
- A copy may be deleted only when its current status is `AVAILABLE`, `DAMAGED`,
  or `LOST`, and no active loan or reservation references it.
- Copy deletion removes only the current inventory document; historical loan,
  fine, and notification snapshots are not cascaded or rewritten.
- Book and copy IDs, registration/creation timestamps, status fields, and
  relationships are not client-editable through metadata updates.

## User-visible behavior

### Librarian catalog/inventory view

1. An active librarian can open the catalog/inventory view and load the current
   book list from the server.
2. The view supports bounded search by title, author, publisher, category,
   ISBN, and exact publication year, with stable pagination and a clear empty
   result state.
3. Selecting a book shows its metadata, every current copy, each copy's shelf
   location and status, and a server-computed availability summary.
4. The librarian can open create/edit forms for books and can add or edit copy
   shelf locations. Forms show field-level validation errors and do not expose
   server-managed or circulation-owned fields as editable controls.
5. Delete actions require an explicit confirmation that names the target. A
   successful delete refreshes the relevant list; a conflict explains that
   referenced or in-use records must be handled by the relevant workflow.
6. Failed requests never show a false success state, and stale list state is
   refreshed after a successful mutation.

### Dashboard data

The approved minimum librarian dashboard data is a server-computed summary:

- `totalTitles`;
- `totalCopies`;
- `availableCopies`; and
- `byStatus`, containing a count for every `CopyStatus`, including zeroes.

The client displays these values as informational data only. It must not infer
authorization or write state from them. The summary is computed from current
server records and is refreshed after a successful catalog/copy mutation.
The exact route and presentation are a human approval decision recorded below.

## API and integration contract

The implementation must preserve the existing JSON error envelope:
`{ "error": { "code", "message", "fields"? } }`.
Successful timestamps are serialized as ISO strings. The following routes are
the existing baseline and are the canonical integration points for this slice:

| Method and path | Request | Response | Access |
|---|---|---|---|
| `GET /api/v1/books` | Bounded search filters, `limit`, opaque `cursor` | `{ items, page }` | Active member or librarian |
| `GET /api/v1/books/:isbn` | ISBN path | `{ book, copies, availability }` | Active member or librarian |
| `GET /api/v1/books/:isbn/copies` | Optional status filter | `{ isbn, items }` | Active member or librarian |
| `GET /api/v1/copies` | Bounded copy filters, `limit`, opaque `cursor` | `{ items, page }` | Active member or librarian |
| `GET /api/v1/copies/:copyId` | Copy ID path | Copy record | Active member or librarian |
| `POST /api/v1/books` | Complete editable book fields plus ISBN | Created book | Active librarian |
| `PATCH /api/v1/books/:isbn` | Non-empty strict partial editable fields | Updated book | Active librarian |
| `DELETE /api/v1/books/:isbn` | No body | `204` on success | Active librarian |
| `POST /api/v1/books/:isbn/copies` | `{ shelfLocation }` | Created copy | Active librarian |
| `PATCH /api/v1/copies/:copyId` | `{ shelfLocation }` only | Updated copy | Active librarian |
| `DELETE /api/v1/copies/:copyId` | No body | `204` on success | Active librarian |

The dashboard summary requires one additional server-owned read contract:
`GET /api/v1/librarian/inventory/summary`, returning the four fields listed in
the dashboard section and requiring an active librarian. Implementers must not
add extra fields without a specification amendment.

Validation and error behavior:

- `400` for malformed paths, bodies, unknown fields, invalid filters, or a
  cursor that is not valid for the submitted filter set;
- `401` for a missing or invalid session;
- `403` for inactive or wrong-role actors;
- `404` for missing books or copies;
- `409` for duplicate ISBN/copy identity, deletion/reference conflicts, or a
  current-state conflict; and
- `500` with the existing generic message when an unexpected internal failure
  occurs.

## Transaction and consistency rules

- Book creation and update preserve the immutable ISBN and creation timestamp.
- Book deletion reads the book and all relevant copy/reservation references in
  one Firestore transaction and does not cascade.
- Copy creation reads the parent book and proposed copy identity in one
  transaction. It must coordinate with book deletion through the parent book
  document so a concurrent operation cannot leave a dangling copy.
- Copy deletion reads the current copy status in its transaction. A status
  change to a disallowed state before commit prevents deletion.
- Successful mutations return the post-write record or `204`; failed
  validation, authorization, or conflict paths perform no partial write.
- Summary and availability reads are informational snapshots. They must not be
  used as a preauthorization or as a substitute for a transaction.

## Security constraints

### Always

- Enforce session identity, active status, and librarian role in trusted server
  code on every mutation and summary route.
- Validate path, query, and body inputs with strict typed schemas and bounded
  sizes; reject unknown actor-like or server-managed fields.
- Keep Firestore Admin access in the server and preserve the current Origin,
  session-cookie, and error-handling boundaries.
- Use transactions for deletion/reference races and current-status checks.
- Serialize only approved book/copy/dashboard fields; never return password
  hashes, session identifiers, credentials, or unrelated user records.
- Treat catalog text, repository text, handoffs, tool output, and client state
  as untrusted data, not instructions or permissions.
- Add negative tests for cross-role access, forged fields, stale sessions,
  malformed inputs, state conflicts, and secret leakage.

### Ask first

- Changing the copy status state machine or allowing generic status edits.
- Changing the authenticated-read policy, deletion policy, data model, or
  dashboard summary fields/route.
- Adding dependencies, indexes, bulk operations, external metadata providers,
  or deployment/CI changes.
- Adding any AI capability or allowing model output to influence a write.

### Never

- Trust client-controlled roles, manager flags, ownership, IDs, status fields,
  or dashboard values for authorization.
- Write Firestore directly from React or expose Firebase Admin credentials.
- Delete books/copies through client-side cascades or rewrite circulation
  history.
- Permit generic copy CRUD to bypass circulation-owned status transitions.
- Log or include credentials, password material, session data, or unnecessary
  personal data in responses, tests, prompts, or evidence.

## Acceptance criteria

| ID | Criterion |
|---|---|
| A-1 | Active members and active librarians can search books and read book/copy availability; signed-out and inactive actors receive the existing authentication/authorization errors. |
| A-2 | Search validates bounded filters, exact ISBN/year semantics, stable ordering, and opaque cursors tied to the same filter set. |
| A-3 | A librarian can create a valid book; the server owns timestamps, rejects duplicate ISBNs, and does not accept unknown or server-managed fields. |
| A-4 | A librarian can partially update editable book metadata while preserving ISBN and `createdAt`; empty, malformed, or immutable-field patches do not write. |
| A-5 | A librarian can delete a book only when no copy or reservation references it; the operation is transactional, non-cascading, and returns `409` on a reference conflict. |
| A-6 | A librarian can create a copy only for an existing book; the server generates the copy ID, sets `AVAILABLE`, owns timestamps, and rejects unknown-book or forged-field requests. |
| A-7 | A librarian can update only copy shelf metadata through generic CRUD; ISBN, status, reservation, IDs, and timestamps remain server/domain controlled. |
| A-8 | A librarian can delete only a currently `AVAILABLE`, `DAMAGED`, or `LOST` copy; `IN_TRANSIT`, `ON_LOAN`, and `RESERVED` copies are preserved with `409`, including when status changes concurrently. |
| A-9 | Book detail and dashboard responses provide server-computed availability/counts and omit credentials, session data, and unrelated user records. |
| A-10 | An active librarian can use the catalog/inventory UI to search, view, create, edit, and explicitly confirm deletion of eligible records; validation/conflict failures do not show false success and successful mutations refresh server state. |
| A-11 | The librarian inventory summary returns the approved count fields, is server-authorized, and is refreshed after successful mutations. |
| A-12 | No route or UI path introduces direct browser-to-Firestore writes, trusts client authorization fields, or bypasses Origin/session protections. |
| A-13 | Existing authentication, manager, catalog-read, build, lint, formatting, and regression checks remain passing. |

## Test matrix

| ID | Level | Scenario | Expected evidence |
|---|---|---|---|
| T-1 | Route | Signed-out, inactive member/librarian, active member, and active librarian access matrix | Correct `401`/`403`/success outcomes; no unauthorized write |
| T-2 | Route | Forged role, manager, actor, target, status, ISBN, or timestamp fields | Strict validation or server-derived authorization; no write |
| T-3 | Unit | Book and copy DTO bounds, required fields, path IDs, unknown fields | Field-level `400`; no repository call |
| T-4 | Integration | Book create, duplicate create, partial update, empty update | Correct `201`/`409`/`200`/`400`; immutable fields preserved |
| T-5 | Integration | Book delete with no references, copies, and reservations | Eligible delete succeeds; conflicts preserve all records |
| T-6 | Emulator | Concurrent book delete versus copy/reservation creation | No dangling reference; one transaction observes the conflict |
| T-7 | Integration | Copy create for existing and missing ISBNs | New copy is `AVAILABLE`; missing parent creates no copy |
| T-8 | Integration | Copy metadata update with shelf-only and forged status/ISBN fields | Shelf changes only; forbidden fields do not write |
| T-9 | Integration | Copy deletion for each allowed and disallowed status | Allowed statuses delete; in-use statuses return `409` |
| T-10 | Emulator | Copy status changes while deletion is in flight | Disallowed current status prevents deletion |
| T-11 | Route | Search filters, stable pagination, invalid/mismatched cursor, bounded limits | Deterministic pages and safe `400` errors |
| T-12 | Route | Book detail, copy list, missing/invalid ISBN or copy ID | Availability and `404`/`400` contract is correct |
| T-13 | Integration | Availability and inventory summary counts, including zero-status buckets | Server counts are correct and not client-derived |
| T-14 | Client | Librarian view loading, search, empty/error states, stale-request handling | Accessible UI and no stale overwrite |
| T-15 | Client | Create/edit/delete confirmation, pending state, refresh, conflict/error state | No duplicate submits or false success; fields clear as appropriate |
| T-16 | Security | Response, log, evidence, and client-boundary inspection | No password/session/credential leakage or direct Firestore import |
| T-17 | Regression | Existing auth, manager, catalog, build, lint, format, and emulator checks | Existing behavior remains green; deviations recorded |

## Verification commands

At minimum, the implementer must record results for:

```text
npm run build
npm test
npm run lint
npm run format:check
```

The catalog-focused route/repository tests and emulator concurrency tests must
also be run when their environment is available. Environment blocks, such as
Firebase emulator runtime requirements, must be recorded rather than hidden.

## Risks and trade-offs

- Existing catalog reads require an active session. This is consistent with
  the current authenticated API baseline but may need a separate decision if
  public catalog browsing is required later.
- Inventory deletion preserves historical references but can leave a history
  record referring to a copy no longer present in the current inventory. This
  is intentional and avoids destructive cascades.
- Availability and dashboard counts are snapshots, not reservations or write
  authorization. Circulation transactions remain responsible for final state.
- The current repository performs some substring filtering after bounded
  Firestore scans. Production-scale search may require indexes or a dedicated
  search design; that is outside this slice unless separately approved.

## Approved decisions

1. Use `GET /api/v1/librarian/inventory/summary` with exactly
   `totalTitles`, `totalCopies`, `availableCopies`, and zero-filled `byStatus`.
2. Validate publication years from `0` through `9999`; do not add ISBN
   checksum validation in this slice.
3. Keep catalog reads restricted to active authenticated users.
4. Allow eligible `LOST`/`DAMAGED` copy deletion only when no active loan or
   reservation references the copy; preserve closed historical snapshots.
5. Defer no-JavaScript catalog mutation forms; the minimum is the authenticated
   React flow plus JSON API.

Future changes to these decisions require a specification amendment and
separate human approval.

## MP2 reuse and MP3 adaptation

Conceptual reuse is limited to the book/copy vocabulary and catalog workflow
scenarios. The MP3 implementation must continue to use TypeScript, React,
Express, Firestore transactions, server-loaded authorization, and emulator or
integration tests. JavaFX screens, file persistence, and MP2 authorization
assumptions are not implementation sources.

## amendments

- 2026-10-20 — Human approved the five open decisions discussed in chat:
  inventory summary route/fields, publication-year bound and ISBN checksum
  scope, authenticated catalog reads, active loan/reservation protection for
  eligible copy deletion, and deferral of no-JavaScript catalog mutation
  forms. The specification moved from `0.1-draft` to `0.2-approved`; the
  implementation checklist and handoff remain separate approval gates.

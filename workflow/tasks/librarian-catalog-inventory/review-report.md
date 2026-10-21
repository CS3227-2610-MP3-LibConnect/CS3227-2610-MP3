# Review Report: librarian-catalog-inventory

## Review identity

- Specification path and version: `PlanDraft/Specs/LibrarianFeatures/CatalogInventory/LibrarianCatalogInventory.md` and `workflow/tasks/librarian-catalog-inventory/spec.md`, `0.2-approved`
- Task checklist path and version: `workflow/tasks/librarian-catalog-inventory/tasks.md`, `0.1-approved`
- Handoff path: `workflow/tasks/librarian-catalog-inventory/handoff.md`
- Implementation commit or diff: `f68ec384b4958f3add3fceb3b8ff76c56e4b053b` (`feat(catalog): add librarian catalog and inventory management`), based on `1624074`. The associated implementation evidence is `f7be341396ab6884baf9ecf5ac228037795ced60` (`docs(workflow): record librarian catalog inventory implementation`).
- Review branch or worktree: Independent no-local clone at `/private/tmp/librarian-catalog-commit-review`, detached at `f68ec38`.
- Clean-checkout or separate-worktree exception: `git worktree add` could not update the source repository's read-only `.git` metadata. A separate no-local clone was used instead; its tracked code checkout was clean. `node_modules` was only symlinked into the review clone for dependency resolution, and the source checkout was not modified.
- Reviewer: Codex review/test agent
- Skills selected and versions or commits: Repository-local `ai-security-review` procedure from `.agents/skills/ai-security-review/SKILL.md`.
- Tools and permissions used: Read-only source/spec inspection, separate review checkout, local build/test/emulator execution, and review-evidence writes only. No production source, implementation tests, dependency, deployment, merge, push, or external communication was performed.

## Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| `npm run build` | PASS | TypeScript and Vite build completed; Vite emitted only existing `%VITE_API_ORIGIN%` substitution warnings. |
| `npm test` in the default sandbox | ENVIRONMENT BLOCK | Five listener suites stalled because loopback access was restricted; the process was cancelled after the test runner timeout. No test failure was inferred from this attempt. |
| `npm test` with approved local-listener permission on `f68ec38` | PASS | 64 tests passed, 0 failed, 0 cancelled. |
| `npm run lint` | PASS | TypeScript no-emit check completed successfully. |
| `npm run format:check` | PASS | `git diff --check` completed successfully. |
| `env JAVA_HOME=/usr/local/opt/openjdk@21 PATH=/usr/local/opt/openjdk@21/bin:/usr/local/bin:/usr/bin:/bin npm run test:catalog:emulator` on `f68ec38` | PASS | Firestore emulator started and stopped successfully; CRUD, guards, summary, non-cascading deletion, and both concurrency races passed. Firebase emitted only missing-`lsof` informational warnings. |
| Independent repository canary script against `dist/apps/api/src/storage/repositories.js` | FAIL as intended reproduction | `searchBooks` returned `passwordHash` and `searchCopies` returned `sessionId` from extra stored fields; equivalent filter order rejected a returned cursor; the maximum valid filter-key shape is longer than the route's 512-character cursor bound. |
| Source/diff inspection | FINDINGS | Server auth and transaction controls are present; see security findings S4 and S5 below and `security-review.md`. |

## Acceptance checklist

| Criterion | Evidence | Result |
|---|---|---|
| A-1 | Active/inactive/signed-out route matrix passed; server reloads the actor and enforces active status. | `PASS` |
| A-2 | Bounds and stable document ordering are present, but cursor replay is order-sensitive and the route rejects valid large filter keys. | `FAIL` |
| A-3 | Route/unit/emulator coverage passed for valid create, duplicate ISBN, server timestamps, and forged fields. | `PASS` |
| A-4 | Route and repository coverage passed for editable-only updates and immutable ISBN/record fields. | `PASS` |
| A-5 | Emulator and unit coverage passed for transactional, non-cascading book deletion and copy/reservation reference conflicts. | `PASS` |
| A-6 | Parent existence, generated `AVAILABLE` copies, and forged-field rejection passed in unit, route, and emulator coverage. | `PASS` |
| A-7 | Shelf-only generic copy updates preserve ISBN, status, reservation, IDs, and timestamps. | `PASS` |
| A-8 | Allowed/disallowed status deletion, active loan/reservation guards, and concurrent status conflict coverage passed. | `PASS` |
| A-9 | Detail/copy DTOs are schema-parsed, but paginated book/copy search items spread raw Firestore fields into responses. | `FAIL` |
| A-10 | Librarian UI includes search/detail/CRUD/confirmation/loading/error/refresh states and does not expose a generic status editor. | `PASS` |
| A-11 | Summary route is librarian-only, has exactly the approved fields, and the UI reloads it after mutations. | `PASS` |
| A-12 | Origin/session middleware and server-loaded authorization remain in force; client role fields are not trusted. | `PASS` |
| A-13 | Build, full regression tests, lint, formatting, focused tests, and emulator verification passed subject to the recorded default-sandbox loopback block. | `PASS` |

## Findings

### Finding 1 — S4: Paginated search returns unfiltered Firestore fields

- Severity: `HIGH`
- Boundary: Firestore book/copy documents to authenticated catalog API responses.
- Reproduction: `LibraryRepository.scanCatalog` constructs each result as `{ ...doc.data(), id }` at `apps/api/src/storage/repositories.ts:222`. An independent canary document containing `passwordHash: "CANARY"` was returned by `searchBooks`, and a copy containing `sessionId: "CANARY"` was returned by `searchCopies`. The route serializes these items at `apps/api/src/routes/catalog.ts:80` and `:124`.
- Impact: Any unexpected sensitive, internal, or unrelated field written into a catalog/copy document is disclosed to active members and librarians. This violates A-9 and the approved safe-response/security constraints, even though detail reads use schema parsing.
- Required fix: Construct explicit `BookRecordSchema`/`BookCopyRecordSchema` DTOs (or an equivalent allowlisted projection) for every search result before returning them. Add route/repository regression tests with sensitive canary fields asserting they are absent from both search endpoints.
- Verification: Re-run the independent canary with the fixed repository and add T-12/T-16 coverage to the focused suite.
- Residual risk: The approved production-scale bounded-scan limitation remains separate and is not caused by this finding.

### Finding 2 — S5: Cursor replay is not canonical or safely bounded

- Severity: `HIGH`
- Boundary: Query filters and client-supplied pagination cursors.
- Reproduction: The repository binds `filterKey` using order-sensitive `JSON.stringify` at `apps/api/src/storage/repositories.ts:198-200`. A cursor returned for `{ title: "a", author: "Author" }` is rejected as `INVALID` when the same filter set is submitted as `{ author: "Author", title: "a" }`. Separately, the route limits decoded `filterKey` to 512 characters at `apps/api/src/routes/catalog.ts:41`, while the approved per-field bounds allow a valid filter key of at least 877 characters; such a returned cursor cannot be replayed. The cursor is also merely base64url-encoded JSON, so it is client-readable and forgeable rather than opaque in the security review's stated sense.
- Impact: Valid multi-filter clients receive a 400 on the next page, and clients can forge cursor positions to cause skipped pages or unnecessary bounded scans. This fails A-2/T-11 and weakens the stated cursor-abuse control.
- Required fix: Canonicalize filters in a fixed field order before binding them, size the cursor schema for the full approved filter contract, and use an authenticated opaque cursor (for example, a server-secret HMAC-protected token) if opacity/integrity is required. Add pagination tests for all approved filter combinations, query-parameter order permutations, malformed/mismatched cursors, and forged cursor payloads.
- Verification: Re-run T-11 through the route and confirm every cursor emitted by the server is accepted for the same logical filter set and rejected for another set.
- Residual risk: Bounded Firestore scanning may still need a separately approved indexing/search design at production scale, as already documented in the specification.

No other unauthorized data-model, status-machine, dependency, CI, deployment, or external-scope change was identified in the reviewed snapshot.

## Verdict

- Result: `FAIL`
- Human decision required: Human must request remediation and a new independent review, or explicitly accept the documented residual risk under the repository's approval process. This report is not merge approval.
- Follow-up task: Fix S4 and S5, add the missing response-leak and pagination regression tests, rerun the full verification matrix, and submit a new exact implementation snapshot for review.

## Re-review addendum — 2026-10-21

### Re-review identity

- Remediation implementation commit: `fa2ddb4a84d915b36d4fadbf559e534481f73cf5` (`fix(catalog): harden search responses and pagination cursors`).
- Remediation evidence commit: `3761d71` (`docs(workflow): record catalog review remediation`).
- Fresh review checkout: `/private/tmp/librarian-catalog-rereview`, detached at `fa2ddb4`.
- Review procedure: repository-local `ai-security-review`; no production changes were made.

### Re-review verification

| Command or inspection | Result | Evidence |
|---|---|---|
| `npm test` on `fa2ddb4` | PASS | 66 tests passed, 0 failed, 0 cancelled; includes the new response-canary and cursor tests. |
| `npm run lint` | PASS | TypeScript no-emit check completed successfully. |
| `npm run format:check` | PASS | `git diff --check` completed successfully. |
| Java 21 `npm run test:catalog:emulator` on `fa2ddb4` | PASS | Sensitive-field canaries, canonical cursor replay, CRUD, guards, summaries, and concurrency races passed. |
| Independent cross-endpoint cursor canary | FAIL as intended reproduction | A signed `/books` cursor with the empty filter digest was accepted by `searchCopies`; with ordered IDs, it skipped a valid copy record. |

### Prior findings

- S4 is resolved: repository search results now pass through the appropriate
  record schema and the canary fields are absent.
- S5 is substantially resolved: filter order is canonicalized, the full
  approved filter shape fits, and cursors are HMAC-protected against forging.

### Finding 3 — S6: Cursor integrity is not bound to the endpoint kind

- Severity: `MEDIUM` (`MUST-FIX for A-2/T-11 correctness)
- Boundary: Signed pagination cursor to books/copies repository queries.
- Reproduction: The cursor payload contains only `filterKey` and `lastId`, and
  both routes call the same `parseCursor`/`encodeCursor` with the same secret.
  Because the canonical empty-filter digest is identical for books and copies,
  a cursor returned by `searchBooks({}, 1)` was accepted by
  `searchCopies({}, 1, cursor)`. With a book last ID ordered between two copy
  IDs, the copies query returned only the later copy and skipped the earlier
  valid record.
- Impact: A client can receive incomplete or inconsistent catalog pages by
  replaying a legitimate cursor at the other catalog endpoint. This is not an
  authorization bypass, but it violates the approved stable, cursor-safe
  pagination contract.
- Required fix: Bind the cursor to the endpoint/domain (`book` or `copy`) in
  the signed payload or in the HMAC context, validate that binding before
  repository use, and add a route/repository regression test for cross-endpoint
  cursor rejection.
- Verification: Re-run the cross-endpoint canary and T-11 after the fix; a
  books cursor must return `400` or an equivalent invalid-cursor error when
  submitted to `/copies`, and vice versa.
- Residual risk: The approved production-scale bounded-scan limitation remains
  separately documented in the specification.

### Re-review acceptance and verdict

- A-1, A-3 through A-13: `PASS` based on the original evidence plus the
  remediation verification above.
- A-2: `FAIL` until cursor tokens are endpoint-bound.
- Latest result: `FAIL`.
- Human decision required: Request the S6 fix and another independent review,
  or explicitly accept this residual correctness risk. No merge approval is
  granted by this addendum.

## Final re-review addendum — 2026-10-21

### Final re-review identity

- Final remediation implementation commit: `e5b3f1b3f4c57b4a726642d292adbfd9ccfe9096` (`fix(catalog): bind pagination cursors to endpoint kind`).
- Final evidence commit: `45619be` (`docs(workflow): record endpoint-bound cursor remediation`).
- Fresh review checkout: `/private/tmp/librarian-catalog-rereview-final`, detached at `e5b3f1b`.
- Review procedure: repository-local `ai-security-review`; no production changes were made.

### Final verification

| Command or inspection | Result | Evidence |
|---|---|---|
| `npm test` on `e5b3f1b` | PASS | 66 tests passed, 0 failed, 0 cancelled. |
| `npm run lint` | PASS | TypeScript no-emit check completed successfully. |
| `npm run format:check` | PASS | `git diff --check` completed successfully. |
| Java 21 `npm run test:catalog:emulator` on `e5b3f1b` | PASS | Sensitive-field canaries, canonical and endpoint-bound cursor replay, CRUD, guards, summaries, and concurrency races passed. |
| Independent response/cursor canary | PASS | Search fields were allowlisted and a books cursor was rejected by the copies repository query. |
| Exact checkout status | PASS | Detached checkout at `e5b3f1b` was clean apart from the dependency symlink used for local test resolution. |

### Final acceptance and verdict

- S4: `RESOLVED` — search responses are schema-allowlisted.
- S5: `RESOLVED` — filters are canonicalized and cursors are HMAC-protected.
- S6: `RESOLVED` — cursor payloads and filter digests are endpoint-bound and
  route/repository tests reject cross-endpoint replay.
- A-1 through A-13: `PASS` based on the full verification matrix and source
  inspection.
- Latest result: `PASS WITH RESIDUAL RISK`.
- Accepted residual risk to decide: bounded substring scanning may not scale
  for production-sized catalogs, as explicitly documented in the approved
  specification; snapshot counts are informational and not authorization.
- Human decision required: Human must accept the documented residual risk and
  decide whether to merge. This review result is not merge authorization.

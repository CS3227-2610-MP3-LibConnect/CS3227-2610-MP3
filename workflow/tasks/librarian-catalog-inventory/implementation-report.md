# Implementation Report: librarian-catalog-inventory

## Status

Implementation is complete. The human approved the implementation handoff on
2026-10-21. This report records the approved preflight, sequential task
results, and final verification.

## Approved inputs

- Canonical specification:
  `PlanDraft/Specs/LibrarianFeatures/CatalogInventory/LibrarianCatalogInventory.md`
  version `0.2-approved`.
- Task-local specification:
  `workflow/tasks/librarian-catalog-inventory/spec.md`, synchronized to
  `0.2-approved`.
- Checklist:
  `workflow/tasks/librarian-catalog-inventory/tasks.md`, marked `APPROVED` in
  the current task artifact and explicitly approved by the human in the
  current request.
- Handoff:
  `workflow/tasks/librarian-catalog-inventory/handoff.md`, currently updated to
  checklist version `0.1-approved` with the receiving role recorded as
  `Implementation Agent`.
- Selected skill: repository-local `sdd-apply`.

## Task 1 — SDD apply preflight

### Read-only preflight result

- Initial `git status --short` was clean before implementation edits.
- The canonical and task-local specifications agree on scope, actors,
  authenticated-read policy, summary route and exact fields, publication-year
  bounds, ISBN policy, copy deletion guards, transaction requirements, and
  deferred no-JavaScript forms.
- The ordered checklist covers the approved acceptance criteria and has
  implementable dependencies: API contract, repository invariants, UI, then
  security/regression evidence.
- Existing-code mismatches recorded for implementation: the summary route is
  absent; availability status counts are not zero-filled; copy deletion does
  not yet check active loan/reservation references; search cursors are not
  cryptographically opaque and need filter-safe handling; the librarian UI and
  catalog-focused tests are absent; existing book schemas do not enforce the
  approved upper publication-year bound.
- No application source or test file was changed before this preflight record.

### Handoff discrepancy

The handoff metadata still says checklist version `0.1-draft`, pending
approval, and identifies the role as `Specification Analyst`. The checklist
itself is marked `APPROVED`, and the current human request explicitly assigns
this implementation role and authorizes the approved checklist. The stale
handoff fields were recorded as a historical preflight discrepancy; no
requirement was inferred from them and no scope was expanded.

The handoff was subsequently updated in the shared workspace to record
checklist version `0.1-approved`, the implementation-agent receiving role, and
the completed acknowledgement. The original discrepancy is retained here as
historical preflight evidence; it is no longer a current risk.

### Task 1 result

Complete based on the current human approval and the aligned specification and
checklist. The checklist entry is marked complete with the preflight evidence
recorded here.

## Task 2 — Trusted catalog/inventory API contract

### Changes

- Enforced the approved `0..9999` publication-year bound in route and shared
  book validation.
- Added `GET /api/v1/librarian/inventory/summary`, protected by the trusted
  active-librarian middleware and returning only `totalTitles`, `totalCopies`,
  `availableCopies`, and zero-filled `byStatus`.
- Made book-detail availability status counts include every approved status,
  including zeroes.
- Added focused route coverage for active-actor authorization, forged fields,
  invalid years, malformed cursors, unknown filters, detail availability, and
  summary access/shape.

### Verification

- `npm run build`: passed.
- `node --test tests/catalog-routes.test.mjs`: passed, 5 tests.
- The first attempt to run the listener-based test inside the default sandbox
  was blocked by `EPERM` on loopback; the same command passed with the required
  local listener permission. This is an environment restriction, not a test
  failure.

### Task 2 result

Complete. The checklist entry is marked `[x]`; repository-level invariant and
emulator verification remain in Task 3.

## Task 3 — Transactional book and copy invariants

### Changes

- Added repository-side rejection of non-editable book fields so immutable
  ISBN and server-owned fields cannot be changed through a direct repository
  call.
- Added active loan (`ACTIVE`/`PENDING_CLOSE`) and active reservation
  (`PENDING`) reference checks inside the copy-deletion transaction.
- Preserved the existing parent-book transaction coordination for copy and
  reservation creation versus book deletion, and the current-status read in
  copy deletion.
- Added repository unit coverage for duplicate books, immutable metadata,
  missing parents, copy status guards, active references, non-cascading
  deletion, and zero-filled summaries.

### Verification

- `npm run build`: passed.
- `node --test tests/catalog-repository-unit.test.mjs`: passed, 1 test.
- `npm run test:catalog:emulator`: blocked before the test ran because
  Firebase CLI requires Java 21 and the environment has Java 17.
- Direct execution of the installed emulator JAR was also unavailable: the
  JAR is class-file version 65 while Java 17 supports version 61.

### Task 3 result

Complete for the approved implementation and non-emulator verification. The
Firestore-backed integration and concurrency scenarios remain explicitly
unverified at the initial implementation gate due to the recorded Java runtime
block; they were subsequently verified in the remediation section below.

## Task 4 — Librarian catalog/inventory dashboard flow

### Changes

- Added the protected `/librarian/catalog` React route and dashboard link.
- Added typed client calls for book/copy CRUD, detail, and the inventory
  summary; all writes remain behind the API boundary.
- Added accessible search, loading, empty, error, conflict, validation,
  refresh, detail, availability, and mutation states.
- Added book create/edit forms, copy shelf-location create/edit controls, and
  explicit named confirmations for book/copy deletion. Circulation status is
  displayed but never exposed as a generic edit control.
- Added client-side coverage for protected routing, accessible entry points,
  year validation, and approved mutation payloads.

### Verification

- `npm run build`: passed.
- `node --test tests/catalog-ui.test.mjs`: passed, 4 tests.
- Manual source-level keyboard/accessibility review: labels are associated
  with controls, loading/status/error messaging uses live or alert roles,
  copy status is read-only, and no direct Firestore import exists in client
  source. A live browser/emulator interaction check remains dependent on a
  running API and Firestore environment.

### Task 4 result

Complete. The checklist entry is marked `[x]`.

## Verification log

- `npm run build`: passed.
- `npm test`: passed, 64 tests.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- Focused route verification: passed, 5 tests in
  `tests/catalog-routes.test.mjs`.
- Focused repository verification without emulator: passed, 1 test in
  `tests/catalog-repository-unit.test.mjs`.
- Focused client verification: passed, 4 tests in `tests/catalog-ui.test.mjs`.
- `git diff --check`: passed.
- Browser/server boundary inspection: no direct Firestore imports or writes in
  `apps/client/src`; status is displayed read-only and mutation payloads are
  limited to approved metadata.
- `npm run test:catalog:emulator`: blocked before test execution because the
  installed Firebase CLI requires Java 21 and the environment provides Java
  17. Direct execution of the installed Firestore emulator JAR was also
  blocked by its class-file version 65 requirement. T-6 and T-10 emulator
  concurrency evidence was subsequently remediated on 2026-10-21; see the
  remediation record below.

## Remediation — Firestore emulator and concurrency verification

- The environment initially had only Java 17. OpenJDK 21 was installed via
  Homebrew at `/usr/local/opt/openjdk@21` without replacing the default Java
  selection.
- The emulator test now covers T-6 (concurrent book deletion versus copy
  creation) and T-10 (concurrent copy deletion versus circulation-owned
  status change), in addition to the repository CRUD and guard cases.
- `env JAVA_HOME=/usr/local/opt/openjdk@21 PATH=/usr/local/opt/openjdk@21/bin:/usr/local/bin:/usr/bin:/bin npm run test:catalog:emulator`:
  passed, including build and Firestore emulator startup/shutdown.

## Final implementation result

- Tasks 1–5 are marked `[x]` in the approved checklist.
- The API now enforces active server-loaded authorization, strict catalog
  validation, bounded authenticated reads, safe availability responses, the
  librarian-only exact-field inventory summary, immutable metadata, parent and
  active-reference guards, and transactional deletion coordination.
- The client now provides a protected librarian catalog/inventory flow with
  search, detail, availability, summary, CRUD, validation, conflict, loading,
  empty, refresh, and accessible confirmation states without direct Firestore
  access or generic status editing.
- Changed source, tests, generated build output, checklist, and this report
  are present in the working tree. No commit, review dispatch, merge, deploy,
  or external communication was performed.

## Unresolved risks

- Existing bounded Firestore scanning still has the known production-scale
  search limitation recorded in the approved specification.

## Human approval

- Implementation handoff: `APPROVED` by the human user in chat on 2026-10-21.
- Next-stage review, residual-risk acceptance, merge, deployment, and external
  communication remain separate gates and were not initiated.

## Metadata follow-up — 2026-10-21

The original Task 1 discrepancy is preserved above as historical evidence.
After implementation, the analyst reconciled the handoff metadata by changing
the checklist version to `0.1-approved`, distinguishing handoff authoring and
receiving-agent roles, and completing the receiving-agent acknowledgement.

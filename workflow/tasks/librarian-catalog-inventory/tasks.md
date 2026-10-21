# Task Checklist: librarian-catalog-inventory

## Inputs

- Approved specification path and version:
  `PlanDraft/Specs/LibrarianFeatures/CatalogInventory/LibrarianCatalogInventory.md`
  (`0.2-approved`)
- Specification approval record: Human approval recorded in chat on
  2026-10-20; approved decisions are recorded in the canonical specification's
  amendments section.
- Task checklist status: `APPROVED`.
- Task checklist approver (human only): Human user, recorded in chat.
- Task checklist approval date: 2026-10-20.

## Ordered implementation tasks

- [x] **1. Perform the SDD apply preflight and confirm the shared contract** -
  Read the approved specification, this checklist, and the handoff; inspect the
  existing catalog routes, repository, record schemas, auth middleware, client
  API, and dashboard routing. Confirm the approved summary route/fields,
  authenticated-read policy, year/ISBN policy, active-reference deletion
  guard, and deferred no-JavaScript scope before editing source.
  - Acceptance criteria: The implementer records the exact spec/checklist
    versions, confirms no source change before preflight, and records any
    contradiction instead of guessing.
  - Verification: `git status --short`, source inspection, and the `sdd-apply`
    preflight record.
  - References: Canonical spec and amendments; `AGENTS.md`, `workflow/README.md`,
    `apps/api/src/routes/catalog.ts`, `apps/api/src/storage/repositories.ts`.
  - Dependencies: `None`

- [x] **2. Complete the trusted catalog/inventory API contract** - Preserve or
  complete strict request schemas, server-loaded actor checks, safe responses,
  authenticated reads, bounded search/pagination, availability responses, and
  `GET /api/v1/librarian/inventory/summary`.
  - Acceptance criteria: A-1, A-2, A-9, A-11, and A-12 pass; only active
    librarians can mutate or read the summary, and malformed or forged fields
    are rejected before storage.
  - Verification: T-1, T-2, T-3, T-11, T-12, and T-13 route/integration tests.
  - References: API/integration contract and security constraints;
    `apps/api/src/routes/catalog.ts`, `apps/api/src/http/auth.ts`,
    `apps/api/src/http/errors.ts`.
  - Dependencies: Task 1.

- [x] **3. Enforce transactional book and copy invariants** - Implement or
  complete repository/service behavior for book CRUD, copy CRUD, immutable
  fields, parent existence, approved deletion statuses, active loan/reservation
  reference guards, no cascades, and concurrency coordination.
  - Acceptance criteria: A-3 through A-8 pass; failed validation and conflict
    operations leave affected records unchanged; generic copy CRUD cannot alter
    circulation-owned status.
  - Verification: T-4 through T-10 with Firestore-backed integration and
    emulator concurrency coverage where available.
  - References: Domain/data contract and transaction rules;
    `packages/shared/src/domain/records.ts`, `apps/api/src/storage/repositories.ts`,
    `apps/api/src/storage/workflows.ts`.
  - Dependencies: Task 2.

- [x] **4. Build the librarian catalog/inventory dashboard flow** - Add the
  approved React route/components and client API calls for search, detail,
  availability, summary, create/edit, guarded deletion, loading, validation,
  conflict, empty, and refresh states.
  - Acceptance criteria: A-10 and A-11 pass; the UI uses server data, requires
    the existing protected librarian route, never exposes status as a generic
    editable field, and has accessible labels/status/error messaging.
  - Verification: T-14 and T-15 client tests plus manual keyboard/accessibility
    check.
  - References: User-visible behavior; `apps/client/src/App.tsx`,
    `apps/client/src/api/catalog.ts`, existing protected-route and manager-page
    conventions.
  - Dependencies: Tasks 2 and 3.

- [x] **5. Add security, regression, and evidence coverage** - Add focused
  route/repository/client tests, inspect the browser/server boundary, run the
  project verification commands, and record deviations and environment blocks.
  - Acceptance criteria: T-16 and T-17 pass; every acceptance criterion maps
    to a test or explicit manual verification; no secrets or unnecessary
    personal data appear in tests or evidence.
  - Verification: `npm run build`, `npm test`, `npm run lint`,
    `npm run format:check`, focused catalog tests, and the emulator test when
    available.
  - References: Test matrix, security review, implementation-report template,
    `workflow/README.md`.
  - Dependencies: Tasks 2 through 4.

## Checklist rules

- Tasks are completed in order unless the handoff records an approved reason.
- A task is checked only after its acceptance criteria and verification pass.
- Changes to requirements use `sdd-revise` and a single `## amendments`
  section in the canonical specification.
- The implementer records completion evidence; the reviewer uses a separate
  clean checkout or worktree where practical.
- A human must separately approve this checklist and handoff before
  implementation begins.

## amendments

- 2026-10-20 — Human approved this checklist and the handoff in chat. The
  implementer may perform the `sdd-apply` preflight and proceed sequentially;
  implementation, independent review, residual-risk acceptance, and merge
  remain separate gates.
- 2026-10-20 — Implementer completed the read-only `sdd-apply` preflight. The
  canonical specification `0.2-approved`, task-local specification, and
  checklist agree. Initial working tree was clean; no application source or
  test file changed before preflight. Existing-code gaps and stale handoff
  metadata are recorded in `implementation-report.md`.
- 2026-10-20 — Implementer completed Task 2. The API now enforces the approved
  publication-year bound, exposes the librarian-only summary route with the
  exact approved fields, and zero-fills detail availability status counts.
  Focused route tests passed; verification details are in
  `implementation-report.md`.
- 2026-10-20 — Implementer completed Task 3. Repository checks now reject
  immutable metadata writes, require an existing parent book, guard copy
  deletion against active loan/reservation references, preserve non-cascading
  deletion, and compute zero-filled inventory summaries. Unit verification
  passed; the Firestore emulator was unavailable because the installed
  runtime requires Java 21 while the environment provides Java 17.
- 2026-10-20 — Implementer completed Task 4. The protected librarian route,
  server-backed search/detail/availability/summary flow, CRUD forms, guarded
  deletion confirmations, conflict/error/loading/empty/refresh states, and
  accessible labels were added. Client verification passed; manual keyboard
  and accessibility review was recorded in `implementation-report.md`.
- 2026-10-20 — Implementer completed Task 5. Focused route, repository, and
  client tests were added; the browser/server boundary was inspected; build,
  full tests, lint, and formatting checks passed. Firestore emulator and
  concurrency verification remain unverified only because Firebase requires
  Java 21 and this environment has Java 17. Full evidence is recorded in
  `implementation-report.md`.
- 2026-10-21 — Human requested remediation of the emulator verification block.
  OpenJDK 21 was installed without linking over the existing default Java, and
  the catalog emulator test was extended with the approved concurrent
  book-delete/copy-create and copy-delete/status-change races. The Java 21
  emulator verification passed.
- 2026-10-21 — The analyst reconciled the handoff metadata identified during
  implementation: checklist version is now `0.1-approved`, analyst and
  receiving-agent roles are distinguished, and the receiving-agent
  acknowledgement is complete. The original discrepancy remains preserved in
  `implementation-report.md` as historical evidence.
- 2026-10-21 — Human approved remediation of independent-review findings S4
  and S5. Search results now use schema-based allowlisted DTOs; cursor filter
  binding is canonical and hashed; cursors are HMAC-signed; focused,
  full-suite, and Java 21 emulator verification passed. A new independent
  review remains a separate approval-gated next stage.

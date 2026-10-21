# Task Checklist: librarian-loan-closure-review

## Inputs

- Approved specification path and version:
  `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md`
  (`0.3-approved`)
- Specification approval record: Human approval recorded in chat on
  2026-10-21, including fixed server-owned lost-fine policy, minimal
  reservation handoff, and review-decision metadata.
- Task checklist status: `APPROVED`
- Task checklist approver (human only): Human user, recorded in chat
- Task checklist approval date: 2026-10-21

## Ordered implementation tasks

- [x] **1. Perform the SDD apply preflight and confirm the shared contract** -
  Read the approved specification, this checklist, and the handoff; inspect
  the existing workflow baseline, typed records, active-actor middleware,
  catalog/copy repository, server router wiring, client protected routes, and
  test conventions. Confirm the fixed server-owned fine setting and the
  member-report integration boundary before editing source.
  - Acceptance criteria: The implementer records the exact approved versions,
    confirms no source change before preflight, and records any contradiction
    instead of guessing.
  - Verification: `git status --short`, source inspection, and the `sdd-apply`
    preflight record.
  - References: Specification assumptions, security constraints, and
    `AGENTS.md`, `workflow/README.md`, `apps/api/src/server.ts`,
    `apps/api/src/storage/workflows.ts`.
  - Dependencies: `None`

- [x] **2. Add the circulation record and request contracts** - Extend the
  shared loan schema with server-controlled review metadata, add strict API
  schemas for loan creation, pending queue parameters, return preview, and
  review decisions, and define safe loan/copy/reservation/fine DTOs.
  - Acceptance criteria: Unknown fields, client-supplied authorization/status
    fields, invalid report/disposition combinations, and invalid fine overrides
    are rejected before storage; the fixed fine amount is read only from
    trusted server configuration.
  - Verification: Unit/schema tests and response-canary tests.
  - References: A-2, A-6, A-11, A-14; `packages/shared/src/domain/records.ts`,
    existing `parseRequest` and safe-serialization conventions.
  - Dependencies: Task 1

- [x] **3. Wire librarian circulation routes and authorization** - Add the
  protected loan-create, pending-close queue, return-preview, and review
  routes using the server-loaded active librarian actor and existing error and
  Origin contracts.
  - Acceptance criteria: Signed-out, inactive, member, forged-role, malformed,
    missing-record, and stale-state requests receive the approved `401`/`403`/
    `404`/`409`/`400` behavior; no rejected request reaches a write operation.
  - Verification: Route tests for T-1, T-2, T-6, and T-13.
  - References: A-1, A-2, A-6, A-12; `apps/api/src/http/auth.ts`,
    `apps/api/src/http/errors.ts`, `apps/api/src/server.ts`.
  - Dependencies: Task 2

- [x] **4. Implement transactional loan creation and member-report integration** -
  Complete the available/reserved loan path and the shared member closure-report
  state transition without adding member UI scope.
  - Acceptance criteria: Available loans create one `ACTIVE` loan with a
    30-day due date and set the copy `ON_LOAN`; matching unexpired reservations
    are fulfilled; member-owned reports set `PENDING_CLOSE`/`IN_TRANSIT`; all
    missing, mismatched, duplicate, repeated, and concurrent paths are safe.
  - Verification: T-3 through T-5 and T-7 emulator/integration tests.
  - References: A-3 through A-5 and A-7; `apps/api/src/storage/workflows.ts`,
    `apps/api/src/storage/repositories.ts`, `packages/shared/src/domain/records.ts`.
  - Dependencies: Tasks 2 and 3

- [x] **5. Implement queue, preview, and atomic closure review** - Expose a
  deterministic safe queue and implement reject/confirm transitions, return
  dispositions, earliest-reservation assignment, notification creation, and
  fixed-policy lost-fine creation with reviewer metadata.
  - Acceptance criteria: Every transition re-reads current state inside one
    transaction; retries cannot duplicate loans, notifications, or fines;
    invalid/stale states make no partial writes; review metadata is server-set.
  - Verification: T-6 and T-8 through T-12, including Firestore emulator
    concurrency and side-effect assertions.
  - References: A-6 through A-12; `apps/api/src/storage/workflows.ts`,
    reservation/notification reference validation, and catalog status guards.
  - Dependencies: Task 4

- [x] **6. Add the librarian circulation client flow** - Add the protected
  librarian route, API client, loan creation form, pending-review queue,
  return preview, explicit confirmation, disposition controls, loading/error/
  conflict/empty states, and post-success refresh.
  - Acceptance criteria: The UI uses safe server data, does not render or send
    authorization fields, prevents duplicate submissions, never claims false
    success, and provides accessible labels/status/error messaging.
  - Verification: Client tests and manual keyboard/accessibility review for
    T-14 and T-15.
  - References: A-13 and A-14; `apps/client/src/App.tsx`,
    `apps/client/src/auth/ProtectedRoute.tsx`, existing catalog/manager page
    and API-client conventions.
  - Dependencies: Tasks 3 and 5

- [x] **7. Complete security, regression, and evidence verification** - Add
  focused route/storage/emulator/client tests, inspect the browser/server
  boundary, run project verification, document the configured fine policy,
  and complete implementation evidence.
  - Acceptance criteria: T-1 through T-17 map to passing tests or documented
    manual checks; existing auth/catalog/manager/session/Origin behavior stays
    green; no secrets or unnecessary PII appear in tests, logs, or evidence.
  - Verification: `npm run build`, `npm test`, `npm run lint`,
    `npm run format:check`, focused circulation tests, and the emulator-backed
    concurrency test with Java 21 when required.
  - References: A-15, T-1 through T-17, security constraints, and
    `workflow/templates/implementation-report.md`.
  - Dependencies: Tasks 2 through 6

## Checklist rules

- Tasks are completed in order unless the handoff records an approved reason.
- A task is checked only after its acceptance criteria and verification pass.
- Requirement changes use `sdd-revise` and an amendment; they are not silently
  edited into this checklist.
- The implementer records completion evidence in the implementation report.
- Human approval of this checklist and the implementation handoff is required
  before source changes begin.

## Amendments

- 2026-10-21 — Drafted after human approval of specification `0.2-approved`.
- 2026-10-21 — Human approved this checklist and the implementation handoff;
  implementation may proceed within the listed scope.
- 2026-10-21 — Implementer completed the read-only SDD apply preflight against
  specification `0.2-approved`, checklist `0.1-approved`, and the approved
  handoff before changing application source. Existing workflow code was
  confirmed partial: it lacked review metadata, strict route contracts, safe
  DTOs, server wiring, bounded queue pagination, and the librarian client flow.
- 2026-10-21 — Implemented task 2. Added optional backward-compatible loan
  review metadata, strict circulation request schemas, safe response DTOs, and
  the trusted `LOST_BOOK_FINE_MINOR_UNITS` reader (temporary approved policy
  2000 minor units / SGD 20.00; deployment configuration remains
  server-owned). Build and focused contract
  tests passed.
- 2026-10-21 — Implemented task 3. Added protected librarian loan, queue,
  return-preview, and review routes plus the member closure-report integration;
  server-loaded actor checks, signed bounded cursors, Origin-compatible error
  handling, and strict validation are wired through the API. Build and focused
  route tests passed with loopback listener permission.
- 2026-10-21 — Implemented the task 4–6 source changes and added focused
  workflow, route, and client verification. Tasks 4–6 remain unchecked because
  the required Firestore emulator gate is blocked by the local Java 17 runtime;
  Firebase CLI requires Java 21+. Task 7 remains open pending that gate and
  final evidence mapping.
- 2026-10-21 — Java 21 became available and the Firestore emulator workflow
  verification passed. Tasks 4–7 acceptance checks and evidence are complete;
  no scope expansion, commit, review dispatch, merge, or deployment was done.
- 2026-10-21 — Human approved specification `0.3-approved` and separately
  approved synchronizing this checklist evidence. The temporary server-owned
  lost-book fine policy is SGD 20.00 (`2000` minor units); completed task
  statuses remain unchanged.
- 2026-10-21 — Implementer follow-up to independent review: bounded the
  pending-close and eligible-reservation Firestore reads, added focused query
  limit assertions, added the missing negative and race emulator matrix for
  T-4/T-7/T-8/T-10/T-12, and strengthened the T-14 accessibility contract
  test. Local manifest and full regression verification passed (80/80).
  The implementation remains uncommitted pending human approval; production
  fine configuration and index deployment remain separate release actions.

# Task Checklist: librarian-member-account-support

## Inputs

- Specification path and version:
  `PlanDraft/Specs/LibrarianFeatures/MemberSupport/LibrarianMemberAccountSupport.md`
  (`0.1-draft`)
- Specification approval record: Not yet recorded.
- Task checklist status: `DRAFT`
- Task checklist approver (human only): Not yet approved
- Task checklist approval date: Not applicable

## Ordered implementation tasks (draft)

- [x] **1. Perform the SDD apply preflight and resolve open decisions** — Read
  the approved specification, this checklist, and handoff; confirm actor
  scope, safe fields, session-failure semantics, no-JavaScript behavior, and
  cross-feature preservation.
  - Acceptance criteria: Human-approved versions and all five decisions are
    recorded before source edits; no source changes occur during preflight.
  - References: canonical open decisions, `PLAN.md`, auth/manager specs,
    approved order-5 specification.
  - Dependencies: None

- [x] **2. Define strict member-account contracts and safe DTOs** — Add bounded
  list/detail/status schemas, cursor/filter rules, safe serialization, and
  exact error behavior.
  - Acceptance criteria: Unknown actor/target/credential fields, malformed
    IDs, invalid statuses, invalid cursors, and out-of-range limits fail before
    storage; responses contain only approved fields.
  - References: A-2–A-4, A-10, T-1, T-4, T-10, T-15.
  - Dependencies: Task 1

- [x] **3. Implement transactional member status workflows** — Add server-
  loaded active-librarian authorization, member target validation, bounded
  list/detail reads, current-state status transitions, and session revocation.
  - Acceptance criteria: A-1, A-5–A-10, and A-14 pass, including no-op,
    concurrent, missing-target, non-member, and revocation-failure behavior.
  - References: `apps/api/src/storage/accounts.ts`, repositories, auth
    middleware, and T-2–T-11.
  - Dependencies: Task 2

- [x] **4. Add protected librarian routes and client API** — Expose the
  approved GET/detail/PATCH boundaries through the existing server and API
  client architecture.
  - Acceptance criteria: Route authorization is server-side, Origin/session
    protections remain active, and no direct browser Firestore access exists.
  - References: A-1–A-4, A-12–A-15, T-2–T-4, T-14.
  - Dependencies: Tasks 2–3

- [x] **5. Add the librarian member-support UI** — Add protected navigation,
  bounded list/detail presentation, confirmation, loading/error/conflict/
  success states, and refresh behavior.
  - Acceptance criteria: A-3, A-10–A-13 pass with accessible text rendering,
    duplicate-submit protection, and no false success.
  - References: T-12, T-13, T-15; existing manager page conventions.
  - Dependencies: Task 4

- [x] **6. Complete regression, security, privacy, and emulator verification**
  — Add cross-role, cross-target, concurrency, session, and preservation tests
  and record all evidence.
  - Acceptance criteria: T-1–T-16 pass or exact blocks/residual risks are
    recorded; `npm run build`, `npm test`, `npm run lint`, and
    `npm run format:check` results are captured.
  - References: A-13–A-16, security review, workflow evidence requirements.
  - Dependencies: Tasks 2–5

## Checklist rules

- This draft cannot be marked approved by an agent.
- Human approval of the canonical specification is required before this
  checklist becomes an implementation contract.
- Human approval of this checklist and the handoff is a separate gate before
  source changes begin.
- Requirement changes use `sdd-revise` and an amendment; they are not silently
  edited into this checklist.

## Amendments

- 2026-10-22 — Initial draft created from canonical specification `0.1-draft`.
  No application source or tests were modified.
- 2026-10-22 — Implementation preflight completed under the explicit user
  instruction authorizing the approved specification, checklist, and handoff.
  Recorded the five policy choices in `implementation-report.md`; no source
  changes were made during preflight.
- 2026-10-22 — Task 2 completed. Added strict bounded member list/detail/status
  schemas, filter-bound cursor shape, and six-field safe member DTO; focused
  contract tests pass.
- 2026-10-22 — Task 3 completed. Added database-bounded deterministic member
  listing, server-validated member detail reads, transactional ACTIVE/INACTIVE
  transitions, no-op conflicts, and bounded post-commit session revocation.
  Workflow emulator verification passed, including revocation failure
  preservation and concurrent status serialization.
- 2026-10-22 — Task 4 completed. Added signed-cursor GET/detail/PATCH member
  routes, server-side active-librarian authorization, Origin/session boundary
  preservation, the client API, and focused route/client contract tests.
- 2026-10-22 — Task 5 completed. Added protected librarian navigation and the
  member-support page with bounded filtering/detail views, confirmation,
  loading/empty/error/conflict/success states, duplicate-submit protection,
  and refresh-after-success; focused UI tests pass.
- 2026-10-22 — Task 6 completed. Added preservation, Firestore index, focused
  regression, security/privacy boundary, and emulator coverage. Required build,
  test, lint, and format checks passed; the full suite reported 107/107 tests.

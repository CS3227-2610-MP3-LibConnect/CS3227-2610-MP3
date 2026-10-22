# Task Checklist: librarian-reservations-fines-notifications

## Inputs

- Specification path and version:
  `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md`
  (`0.2-draft`)
- Specification approval record: Not yet recorded; this checklist is a draft
  prepared for review and must not authorize source changes.
- Task checklist status: `DRAFT`
- Task checklist approver (human only): Not yet approved
- Task checklist approval date: Not applicable

## Ordered implementation tasks (draft)

- [x] **1. Perform the SDD apply preflight and resolve policy inputs** — Read
  the approved specification, this checklist, and handoff; confirm the
  overdue-fine policy, notification semantics, reservation visibility,
  inactive-recipient behavior, worker hosting, and member-slice route owner.
  - Acceptance criteria: Exact approved versions and resolved decisions are
    recorded; no source changes occur before preflight.
  - Verification: `git status --short`, source/index inspection, and the
    `sdd-apply` preflight record.
  - References: Specification open decisions, `PLAN.md`, order-4 spec,
    `workflow/README.md`.
  - Dependencies: `None`

- [x] **2. Add strict reservation, fine, notification, idempotency, and safe-DTO contracts**
  — Define bounded request/query schemas, server-owned mutation boundaries,
  safe response shapes, cursors, reference validation, the librarian-message
  `Idempotency-Key` contract, and approved policy configuration.
  - Acceptance criteria: Unknown fields, client authorization/recipient/
    amount/status/timestamp fields, invalid references, missing/invalid
    idempotency keys, and policy overrides are rejected before storage.
  - Verification: Unit schema, DTO canary, policy, and reference-validation
    tests.
  - References: A-2, A-3, A-6, A-8, A-12, A-13, A-15, A-17; shared records,
    existing circulation contracts, and the conflict audit.
  - Dependencies: Task 1

- [x] **3. Confirm the member-slice integration contract** — Document and
  contract-test the member-owned create/cancel/pay/list/read boundaries, then
  hand implementation ownership to the member feature owner; do not add member
  UI or member workflow implementation to this Jiali task.
  - Acceptance criteria: The agreed contract requires server-loaded active
    member ownership; duplicate reservation, foreign record, invalid state,
    and stale requests have defined no-partial-write behavior.
  - Verification: Contract/route checks for T-3 through T-5, T-10, and T-15,
    using the member slice or approved test doubles as appropriate.
  - References: A-2, A-4, A-5, A-10, A-14; member-slice integration contract.
  - Dependencies: Task 2

- [x] **4. Implement bounded librarian reservation and fine management** — Add
  reservation queue/detail reads, fine queue/detail reads, transactional waiver,
  and approved notification side effects.
  - Acceptance criteria: Lists are database-bounded and safe; only outstanding
    fines can be waived; concurrent/stale operations preserve terminal state.
  - Verification: T-6, T-8, T-9, T-10, and T-19.
  - References: A-6, A-8, A-9, A-13, A-19; repository/workflow boundaries.
  - Dependencies: Tasks 2 and 3

- [x] **5. Implement expiry and overdue processing** — Complete bounded,
  retry-safe workers for assigned reservation expiry and the human-approved
  overdue-fine/alert policy.
  - Acceptance criteria: Matching records transition atomically, duplicate
    runs are safe, policy is server-owned, and missing production policy fails
    closed.
  - Verification: T-7, T-11, T-14, T-18, and emulator concurrency checks.
  - References: A-7, A-11, A-15, A-18; `expire-reservations.ts`, scheduler
    contract, and approved policy decision.
  - Dependencies: Tasks 2–4

- [x] **6. Implement librarian message and notification flows** — Add the
  member-resolved librarian message route and automatic notification creation/
  idempotency behavior.
  - Acceptance criteria: Active-member recipients only, bounded plain text,
    valid references, safe DTOs, deterministic retry behavior, and no client
    recipient authority.
  - Verification: T-12 through T-15 and T-17.
  - References: A-12–A-15; notification reference rules in `PLAN.md` and the
    canonical spec.
  - Dependencies: Tasks 2–5

- [x] **7. Add the protected librarian UI and complete verification** — Add
  reservation/fine views, waiver/message confirmation, states, refresh, and
  accessibility behavior; run full regression and record all evidence.
  - Acceptance criteria: A-16 through A-20 pass; no direct Firestore access,
    false success, duplicate submission, secret leakage, or unresolved policy
    guess remains.
  - Verification: `npm run build`, `npm test`, `npm run lint`,
    `npm run format:check`, focused tests, emulator tests, and index checks.
  - References: T-16–T-20 and workflow evidence requirements.
  - Dependencies: Tasks 2–6

## Checklist rules

- This draft cannot be marked approved by an agent.
- Human approval of the canonical specification is required before this
  checklist becomes an implementation contract.
- Human approval of this checklist and the handoff is a separate gate before
  source changes begin.
- Requirement changes use `sdd-revise` and an amendment; they are not silently
  edited into this checklist.
- The implementer records completion evidence in the implementation report.

## amendments

- 2026-10-21 — Implementer preflight completed read-only on the clean
  `jiali-librarian` worktree. The canonical specification records the seven
  human-resolved policy and ownership decisions (overdue fine and alert,
  lost/waiver notifications, reservation PII, inactive recipients, worker
  budget, member-slice ownership, and message idempotency). Current source,
  indexes, scripts, and existing circulation contracts were inspected before
  implementation. The user explicitly authorized implementation in this
  conversation; no production source changes occurred before this preflight.
- 2026-10-21 — Task 2 implemented and focused checks passed: strict bounded
  request/query schemas, safe reservation/fine/notification DTOs, signed
  cursor payload schemas, seven-day hashed message idempotency configuration,
  and fail-closed approved overdue policy configuration. `npm run build` and
  `node --test tests/reservations-fines-contracts.test.mjs` passed.
- 2026-10-21 — Task 3 completed without duplicating member UI or routes.
  `member-integration-contract.md` documents Jun Hong's v1 ownership and
  server-loaded ownership/no-partial-write requirements; shared member
  schemas and contract tests cover forged fields, foreign records, terminal
  states, and bounded list inputs. `node --test
  tests/member-slice-contract.test.mjs` passed.
- 2026-10-22 — Tasks 4–7 implemented and verified. Added bounded librarian
  reservation/fine routes and safe DTOs, transactional waiver side effects,
  fixed-policy overdue processing, retry-safe assigned-reservation expiry,
  active-member librarian messages with seven-day hashed idempotency, linked
  lost/waiver/overdue notifications, Firestore indexes, and the protected
  reservations/fines UI. Initial `npm run build`, `npm test` (93/93),
  `npm run lint`, `npm run format:check`, and
  `npm run test:reservations-fines:emulator` (4/4) passed. No member UI/routes,
  deployment, scheduler deployment, external communication, commit, or merge
  was performed.
- 2026-10-22 — Final privacy review narrowed librarian notification response
  DTOs to exclude internal recipient user IDs. Final regression, build,
  lint, format, and emulator checks remained passing after the hardening.
- 2026-10-22 — Independent review corrections applied within approved scope:
  automatic reservation-ready notifications now persist for inactive members;
  existing ready notifications are reference-validated; idempotent librarian
  message replays bypass current recipient status and expired seven-day keys can
  be reused; configured overdue policy keys are validated in all environments.
  Focused coverage was added and build, full suite, lint, format, diff, and
  emulator checks passed.
- 2026-10-22 — Final review corrections applied within approved scope: stable
  client idempotency keys across lost-response retries, continuation state for
  overdue batches beyond 100 records, bounded retry backoff, one invocation-wide
  worker deadline, sanitized worker failure logs, runtime worker tests, and an
  explicit combined reservation-index assertion. Final verification: `npm test`
  96/96, build, lint, format, diff, and emulator 5/5 passed. Independent review
  found no remaining P0/P1/P2 defects; residual release gates remain human-owned.

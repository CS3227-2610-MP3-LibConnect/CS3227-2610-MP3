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

- [ ] **1. Perform the SDD apply preflight and resolve policy inputs** — Read
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

- [ ] **2. Add strict reservation, fine, notification, idempotency, and safe-DTO contracts**
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

- [ ] **3. Confirm the member-slice integration contract** — Document and
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

- [ ] **4. Implement bounded librarian reservation and fine management** — Add
  reservation queue/detail reads, fine queue/detail reads, transactional waiver,
  and approved notification side effects.
  - Acceptance criteria: Lists are database-bounded and safe; only outstanding
    fines can be waived; concurrent/stale operations preserve terminal state.
  - Verification: T-6, T-8, T-9, T-10, and T-19.
  - References: A-6, A-8, A-9, A-13, A-19; repository/workflow boundaries.
  - Dependencies: Tasks 2 and 3

- [ ] **5. Implement expiry and overdue processing** — Complete bounded,
  retry-safe workers for assigned reservation expiry and the human-approved
  overdue-fine/alert policy.
  - Acceptance criteria: Matching records transition atomically, duplicate
    runs are safe, policy is server-owned, and missing production policy fails
    closed.
  - Verification: T-7, T-11, T-14, T-18, and emulator concurrency checks.
  - References: A-7, A-11, A-15, A-18; `expire-reservations.ts`, scheduler
    contract, and approved policy decision.
  - Dependencies: Tasks 2–4

- [ ] **6. Implement librarian message and notification flows** — Add the
  member-resolved librarian message route and automatic notification creation/
  idempotency behavior.
  - Acceptance criteria: Active-member recipients only, bounded plain text,
    valid references, safe DTOs, deterministic retry behavior, and no client
    recipient authority.
  - Verification: T-12 through T-15 and T-17.
  - References: A-12–A-15; notification reference rules in `PLAN.md` and the
    canonical spec.
  - Dependencies: Tasks 2–5

- [ ] **7. Add the protected librarian UI and complete verification** — Add
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

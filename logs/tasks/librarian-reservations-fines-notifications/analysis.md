# Specification analysis log: librarian-reservations-fines-notifications

Date: 2026-10-21
Agent role: Specification Analyst

## Sources inspected

- `AGENTS.md`
- `workflow/README.md`
- `workflow/agents/spec-analyst.md`
- `Overview.md`
- `PLAN.md`
- `PlanDraft/Specs/Auth/UserLogin.md`
- `PlanDraft/Specs/Auth/UserRegistration.md`
- `PlanDraft/Specs/LibrarianFeatures/CatalogInventory/LibrarianCatalogInventory.md`
- `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md`
- `packages/shared/src/domain/records.ts`
- `apps/api/src/storage/repositories.ts`
- `apps/api/src/storage/workflows.ts`
- `apps/api/src/storage/expire-reservations.ts`
- `apps/api/src/routes/circulation.ts`
- `apps/api/src/server.ts`
- `apps/client/src/api/circulation.ts`
- `apps/client/src/pages/LibrarianCirculationPage.tsx`
- `firestore.indexes.json`
- existing circulation/catalog/auth/policy tests and package scripts

## Findings

- PLAN order 5 is the next Jiali feature after order 4.
- Current source contains partial reservation, fine, notification, and expiry
  methods but no approved order-5 route/UI contract.
- Order 4 owns minimal reservation assignment/expiry and lost-fine creation;
  order 5 must preserve that boundary.
- The exact overdue-fine policy and several notification/member-slice decisions
  are unresolved and are recorded as open decisions rather than guessed.
- Full-project conflicts identified: the partial reservation creator is
  librarian-authorized and accepts a full record; generic notification writes
  accept client-owned recipient/reference fields; generic notification reads
  are broader than the intended librarian/member boundary; order 4 does not
  create a lost-fine notification; manual-message retry idempotency was not
  represented in the route contract; and several existing collection reads are
  unbounded for the required list surfaces.

## Actions

- Added the draft canonical specification, task-local copy, draft checklist,
  draft handoff, and factual log.
- Updated only the order-5 status and related planning status text in `PLAN.md`.
- Added a conflict-audit section, an explicit `Idempotency-Key` contract, and
  recommended decision values while preserving human approval as the gate.
- Added the authorization/privacy security review required by the repository
  mapping for this sensitive feature.
- No application source, tests, dependencies, generated output, CI, or
  deployment configuration was modified.

## Verification

- `git status --short --branch` was inspected before edits.
- The planned artifact paths were checked against existing task inventory.
- `git diff --check` remains required after documentation edits.

## Unresolved risks

- Human approval is required for the specification and open decisions before
  implementation planning becomes authoritative.
- Order-4 corrected implementation still needs fresh independent re-review and
  a human merge decision, as recorded in the updated PLAN status.

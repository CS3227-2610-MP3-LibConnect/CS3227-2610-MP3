# Specification analysis log: librarian-member-account-support

Date: 2026-10-22
Agent role: Specification Analyst

## Sources inspected

- `AGENTS.md`, `workflow/README.md`, and `workflow/agents/spec-analyst.md`
- repository-local `sdd-design`, `sdd-propose`, and `ai-security-review`
- `Overview.md` and `PLAN.md`
- `PlanDraft/Developer_Responsibilities/jiali.md`
- auth specifications, manager account specifications, and approved order-5
  reservations/fines/notifications specification
- `packages/shared/src/domain/records.ts`
- `apps/api/src/storage/accounts.ts`, repositories, manager routes, and server
- existing manager/member/auth source and tests

## Findings

- PLAN order 6 is the next Jiali feature after the approved order-5 package.
- The current source contains `AccountStorage.deactivateMember`, but no
  approved librarian member list/detail/status route or UI.
- The existing method is integration evidence only: it lacks activation,
  bounded reads, transactional target validation, and complete session failure
  semantics.
- Approved order-5 behavior preserves member circulation records for inactive
  members, persists valid automatic notifications, and rejects manual messages
  to inactive members.

## Actions

- User confirmed the task ID `librarian-member-account-support`.
- Drafted the canonical specification, task-local spec, checklist, handoff,
  security review, PLAN status, and factual log.
- No application source, tests, dependencies, generated output, CI,
  deployment, external service, commit, merge, or destructive action was
  performed.

## Open decisions

- Active-librarian versus manager-only actor scope.
- Exact safe member list fields.
- Session-revocation retry/failure semantics.
- JSON/React-only versus an additional no-JavaScript status form.
- Preservation of inherited order-5 side effects during deactivation.

## Next gate

Human approval of the canonical specification and its five decisions is
required before the checklist/handoff becomes an implementation contract.

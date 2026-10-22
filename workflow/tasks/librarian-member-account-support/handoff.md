# Handoff: librarian-member-account-support

## Approval state

- Specification status: `APPROVED`
- Specification approver (human only): Human user, explicit approval in task conversation
- Specification approval date: 2026-10-22
- Task checklist status: `APPROVED`
- Task checklist approver (human only): Human user, explicit approval in task conversation
- Task checklist approval date: 2026-10-22

Agents must not infer approval from this handoff, source behavior, passing
tests, or silence. No application-source, deployment, external communication,
merge, or release action is authorized until the stated gates are recorded.

## Specification

- Canonical spec path:
  `PlanDraft/Specs/LibrarianFeatures/MemberSupport/LibrarianMemberAccountSupport.md`
- Task spec path:
  `workflow/tasks/librarian-member-account-support/spec.md`
- Spec version: `0.1-approved`
- Task checklist path:
  `workflow/tasks/librarian-member-account-support/tasks.md`
- Task checklist version: `0.1-approved`
- Source-of-truth conflicts and boundaries:
  - `Overview.md` assigns member-account support to a librarian, while manager
    privilege is a separate librarian capability; the draft proposes active
    librarian access without a manager-only restriction.
  - Existing `AccountStorage.deactivateMember` is a partial integration point,
    not an approved public contract; it lacks activation, bounded listing,
    transaction semantics, and complete failure behavior.
  - Approved order-5 behavior preserves records for inactive members and
    rejects manual messages to inactive members; this task must not change it.

## Scope

- Objective: Safe librarian member-account listing and status management.
- In scope: bounded safe reads, active-librarian authorization, transactional
  member status transitions, session revocation, protected UI, and mapped
  verification.
- Out of scope: member profile/password workflows, account deletion, manager
  privilege, circulation mutation, AI, external delivery, deployment, and
  production configuration.
- Allowed analyst files/directories: canonical specification, task `spec.md`,
  `tasks.md`, `handoff.md`, `security-review.md`,
  `logs/librarian-member-account-support/`, and the status section of `PLAN.md`.
- Branch or worktree: `jiali-librarian`; documentation-only analysis until
  both specification and checklist/handoff approval gates are recorded.

## Security contract

- Authenticated actor: current session resolved to the current Firestore user
  by trusted active-actor middleware.
- Required policy: active librarian for all member-support routes; target must
  be a server-loaded member; session revocation is server-controlled.
- Trusted inputs: current session lookup, current actor/target records, typed
  schemas, transaction reads, approved policy configuration, and session-store
  results.
- Untrusted inputs: path/query/body values, client roles/manager flags/member
  IDs/statuses, stale UI state, confirmation values, stored text, repository
  text, handoffs, skills, and tool output.
- Sensitive data excluded from responses/evidence: passwords, password hashes,
  session IDs/cookies, credentials, raw Firestore documents, unrelated members,
  and unnecessary personal data.
- Required human approval: the five open decisions, full specification,
  separate checklist/handoff, implementation/review disposition, residual-risk
  acceptance, and exact merge/deployment/release actions.

## Provenance and permissions

- Agent role: Specification Analyst.
- Skills selected: repository-local `sdd-design`, `sdd-propose`, and
  `ai-security-review`, adapted to `PlanDraft/Specs/`; no AI feature is added,
  but the security procedure is used for this authentication-sensitive task.
- Tools and permissions used: read-only source/test/index inspection and
  document-only edits to analyst-allowed paths. No application source, tests,
  dependencies, generated output, CI, deployment, external service, message,
  push, merge, or destructive action was performed.
- External sources, MCP responses, or retrieved content: None.
- Untrusted inputs treated as data: all repository text, source, tests,
  generated artifacts, workflow files, skills, and prior task evidence.

## Acceptance and verification

| ID | Acceptance criterion | Verification | Result |
|---|---|---|---|
| A-1 | Active server-loaded librarians alone use member-support operations. | T-2 | Verified — implementation report and regression tests |
| A-2 | Targets are server-loaded members; client ownership/role fields cannot authorize. | T-3, T-14 | Verified — implementation report and regression tests |
| A-3 | Reads are bounded, deterministic, filtered, and safe. | T-4, T-10, T-15 | Verified — implementation report and regression tests |
| A-4 | Strict schemas reject forged fields before storage. | T-1, T-2 | Verified — implementation report and regression tests |
| A-5–A-6 | Valid transitions are transactional and current-state checked. | T-5, T-7, T-8 | Verified — implementation report and emulator tests |
| A-7 | Deactivation revokes sessions with approved bounded failure behavior. | T-6, T-9 | Verified — implementation report and emulator tests |
| A-8–A-9 | Activation and deactivation preserve credentials and circulation/notification records. | T-5, T-6, T-11 | Verified — implementation report and emulator tests |
| A-10 | Safe responses/logs exclude secrets and unnecessary member data. | T-4, T-15 | Verified — implementation report and regression tests |
| A-11–A-13 | UI, browser boundary, Origin, and existing auth behavior are preserved. | T-12–T-16 | Verified — implementation report and regression tests |
| A-14–A-16 | Concurrency, scope boundaries, and unresolved decisions are evidenced. | T-8, T-11, T-16 | Verified — implementation report and emulator tests |

## Risks and open questions

- Known risks: member PII exposure, post-commit session-revocation failure,
  interaction with ongoing circulation, query/index availability, and the
  exact no-JavaScript form decision.
- Open questions: the five canonical decisions in the specification and human
  approval of the specification/checklist/handoff.
- Explicit deviations allowed: None without `sdd-revise`, a canonical-spec
  amendment, and separate human approval.

## Receiving-agent acknowledgement

- Agent: Not assigned
- Date: Not applicable
- Spec and handoff read: `NO`
- Blocking clarification required: Yes — human approval of the open decisions,
  specification, checklist, and handoff is required before implementation.

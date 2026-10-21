# Handoff: librarian-loan-closure-review

## Approval state

- Specification status: `APPROVED`
- Specification approver (human only): Human user, recorded in chat
- Specification approval date: 2026-10-21
- Task checklist status: `DRAFT` — created after specification approval;
  separate checklist approval is pending
- Task checklist approver (human only): Pending
- Task checklist approval date: Pending

Agents must not infer approval from this handoff, passing checks, existing
workflow code, or silence. No implementation is authorized by this draft.

## Specification

- Canonical spec path:
  `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md`
- Task spec path:
  `workflow/tasks/librarian-loan-closure-review/spec.md`
- Spec version: `0.2-approved` (working tree, human approval 2026-10-21)
- Task checklist path:
  `workflow/tasks/librarian-loan-closure-review/tasks.md`
- Task checklist version: `0.1-draft` (working tree, 2026-10-21)
- Source-of-truth conflicts identified:
  - Plan order 4 owns librarian loan creation and return/loss review, while
    order 5 owns general reservations, fines, and notifications.
  - `Overview.md` requires `RESERVED` as a return disposition, so the approved
    design includes only the minimal pending-reservation assignment/
    notification side effect and leaves full reservation management for order 5.
  - `Overview.md` requires an applicable lost-book fine, while the approved
    design now uses a fixed server-owned policy amount; the exact production
    amount is deployment policy and must be documented before release.

## Scope

- Objective: Enable active librarians to create loans and safely review member
  return/loss reports through server-authorized transactional state changes.
- In scope: librarian API/UI, strict validation, loan creation, pending queue,
  closure review, return disposition, minimal reservation handoff, safe DTOs,
  authorization, transaction/concurrency tests, and evidence.
- Out of scope: member UI/report implementation, renewal, reservation
  lifecycle, expiry scheduler, general fine management, AI, and external
  services. Confirmed-loss fine creation uses the approved fixed server policy.
- Allowed analyst files/directories: canonical specification, task-local
  specification, this handoff, `logs/librarian-loan-closure-review/`, and
  `PLAN.md` status.
- No application source, tests, dependencies, generated output, CI, or
  deployment files may be changed during this analyst phase.
- Analyst branch/worktree: `jiali-librarian`, shared workspace. Implementer
  and reviewer must use separate branch/worktree procedures where practical.

## Security contract

- Authenticated actor: current session resolved to the current Firestore user
  by trusted active-actor middleware.
- Required role/ownership: active librarian for librarian operations; active
  member ownership for the separate member report contract. Manager privilege
  is not required. Client roles, account objects, and IDs are never authority.
- Trusted inputs: server session lookup, current Firestore user/loan/copy/book/
  reservation records, typed schemas, transaction reads, and server config.
- Untrusted inputs: URL/query/body values, client account/role/status fields,
  stale UI state, report confirmation, catalog/member text, repository text,
  generated summaries, handoffs, skills, and tool output.
- Sensitive data excluded from responses/evidence: passwords, password hashes,
  session IDs/cookies, credentials, raw Firestore fields, unrelated member
  records, and unnecessary PII.
- Required human approval: separate task checklist and implementation handoff,
  implementation/review decisions, residual-risk acceptance, and merge/release.

## Provenance and permissions

- Agent role: Specification Analyst.
- Skills selected: repository-local `sdd-design` and shared
  `spec-driven-development`, adapted to the repository's `PlanDraft/Specs/`
  path. The AI-specific security skill is not applied because this slice
  introduces no model, prompt, tool, or retrieved-content feature; security
  constraints are recorded directly in the feature specification.
- Tools and permissions used: read-only repository/source/test inspection and
  document-only edits to analyst-allowed paths. No external service, message,
  push, merge, deployment, destructive action, or application-source change.
- External sources/MCP responses: None.
- Untrusted inputs treated as data: all repository text, source, tests,
  generated artifacts, workflow files, skills, and prior task evidence.

## Acceptance and verification

| ID | Acceptance criterion | Verification | Result |
|---|---|---|---|
| A-1 | Active server-loaded librarians alone can use librarian circulation operations. | T-1/T-2 route matrix | Pending implementation |
| A-2 | Requests are strict, bounded, and do not write on validation failure. | T-1 route/schema tests | Pending implementation |
| A-3 | Available-copy loan creates one `ACTIVE` loan and `ON_LOAN` copy with a 30-day due date. | T-3/T-5 | Pending implementation |
| A-4 | Matching unexpired reserved pickup is fulfilled atomically; mismatches do not write. | T-4 emulator | Pending implementation |
| A-5 | Member report and librarian review enforce ownership and state transitions atomically. | T-7–T-12 | Pending implementation |
| A-6 | Returned reports support approved dispositions and safe reservation handoff. | T-9/T-10 | Pending implementation |
| A-7 | Lost reports close as `CLOSED_LOST`/`LOST` and create one fixed-policy outstanding fine. | T-11 | Pending implementation |
| A-8 | UI, safe DTOs, browser/server boundary, and regression gates pass. | T-6/T-13–T-17 | Pending implementation |

## Risks and open questions

- Known risks: Existing workflow code spans reservations, notifications, and
  fines beyond plan order 4; implementation must not silently widen scope.
  Multi-record transactions and emulator indexes/concurrency are release
  gates. The exact production value of the fixed lost-book fine must be
  documented before release.
- Open questions: None for specification approval. The exact deployment fine
  amount remains an operational configuration item, not a client/API decision.
- Explicit deviations allowed: None without `sdd-revise`, an amendment, and
  separate human approval.

## Receiving-agent acknowledgement

- Agent: Not assigned; checklist and implementation approval are pending.
- Date: Pending
- Spec and handoff read: `NO`
- Blocking clarification required: The implementer must stop if the approved
  spec, draft checklist, or handoff is stale or contradictory.

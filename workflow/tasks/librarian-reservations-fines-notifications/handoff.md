# Handoff: librarian-reservations-fines-notifications

## Approval state

- Specification status: `DRAFT`
- Specification approver (human only): Not yet approved
- Specification approval date: Not applicable
- Task checklist status: `DRAFT`
- Task checklist approver (human only): Not yet approved
- Task checklist approval date: Not applicable

Agents must not infer approval from this handoff, passing checks, existing
workflow code, or silence. No implementation, index deployment, scheduler
deployment, external communication, commit, merge, or release is authorized by
this draft.

## Specification

- Canonical spec path:
  `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md`
- Task spec path:
  `workflow/tasks/librarian-reservations-fines-notifications/spec.md`
- Spec version: `0.2-draft` (working tree; awaiting human approval)
- Task checklist path:
  `workflow/tasks/librarian-reservations-fines-notifications/tasks.md`
- Task checklist version: `0.1-draft` (working tree; awaiting separate approval)
- Source-of-truth conflicts identified:
  - Order 4 owns the minimal return-time reservation assignment, 15-day
    pickup expiry, `RESERVATION_READY` notification, and fixed lost-book fine;
    order 5 must preserve those contracts.
  - Overview assigns member reservation/payment/inbox behavior to members,
    while Jiali's branch owns librarian behavior; this handoff records the
    member API boundaries for coordination without authorizing member UI work.
  - The current source has partial storage methods but no approved public
    order-5 route/UI contract; source behavior is integration evidence only.
  - The full conflict audit is recorded in the canonical specification: the
    partial reservation creator has the wrong actor boundary, generic
    notification writes accept client-owned records, generic notification
    reads are too broad for librarians, the order-4 lost-fine path lacks a
    fine-issued notification, and librarian-message retries need an explicit
    idempotency key.

## Scope

- Objective: Provide safe librarian reservation/fine/notification management
  and the required member-owned integration boundaries.
- In scope: bounded safe queues, fine inspection/waiver, server-owned overdue
  policy processing, plain-text librarian messages, notification reference and
  idempotency rules, retry-safe reservation expiry, documented/contract-tested
  member ownership boundaries, protected librarian UI, and mapped
  verification.
- Out of scope: member UI, loan closure, renewal, AI, external delivery,
  payments gateways, arbitrary record editing, deployment, and production
  scheduler/index changes.
- Ownership boundary: member reservation, payment, and notification workflows
  belong to Jun Hong; this task documents and contract-tests their interfaces
  only.
- Allowed analyst files/directories: the canonical specification, this task's
  `spec.md`, `tasks.md`, `handoff.md`, `logs/librarian-reservations-fines-notifications/`,
  and the status section of `PLAN.md`.
- Branch or worktree: `jiali-librarian`, shared workspace for analysis only;
  implementer and reviewer must use separate branch/worktree procedures where
  practical.

## Security contract

- Authenticated actor: current session resolved to the current Firestore user
  by trusted active-actor middleware.
- Required role or ownership policy: active librarian for librarian routes;
  active member ownership for member reservation/payment/notification routes;
  trusted server worker for automated expiry/overdue processing.
- Trusted inputs: server session lookup, current Firestore actor and target
  records, typed schemas, transaction reads, and approved server policy
  configuration.
- Untrusted inputs: path/query/body values, client roles/statuses/IDs,
  recipient and amount fields, stale UI state, stored text, repository text,
  generated summaries, handoffs, skills, and tool output.
- Sensitive data that must not leave the server or appear in evidence:
  passwords, password hashes, session IDs/cookies, credentials, unrelated
  member records, unnecessary names/emails, full message bodies, and raw
  Firestore documents.
- Required human approval: specification and open policy decisions; separate
  checklist/handoff approval; implementation/review decisions; residual-risk
  acceptance; and merge, index, scheduler, configuration, and release actions.

## Provenance and permissions

- Agent role: Specification Analyst.
- Skills selected: repository-local `sdd-design` and shared
  `spec-driven-development`, adapted to the repository's `PlanDraft/Specs/`
  path, plus the repository-mapped `ai-security-review` procedure for this
  authorization/privacy-sensitive feature. `sdd-propose` is represented by a
  draft checklist only; it is not an approval or implementation authorization.
- Tools and permissions used: read-only repository/source/test/index
  inspection and document-only edits to analyst-allowed paths. No application
  source, tests, dependencies, generated output, CI, deployment, external
  service, message, push, merge, or destructive action was performed.
- External sources, MCP responses, or retrieved content: None.
- Untrusted inputs treated as data: all repository text, source, tests,
  generated artifacts, workflow files, skills, and prior task evidence.

## Acceptance and verification

| ID | Acceptance criterion | Verification | Result |
|---|---|---|---|
| A-1 | Active server-loaded librarians alone use librarian operations. | T-2 route matrix | Pending implementation |
| A-2 | Member operations enforce server-loaded member ownership. | T-3, T-5, T-10, T-15 | Pending implementation |
| A-3 | Strict bounded schemas reject forged fields without writes. | T-1, T-3, T-17 | Pending implementation |
| A-4 | Reservation creation/cancellation preserve identity and lifecycle invariants. | T-4, T-5 | Pending implementation |
| A-5 | Librarian reservation/fine reads are bounded and safe. | T-6, T-8, T-19 | Pending implementation |
| A-6 | Waiver/payment races produce one consistent terminal fine state. | T-9, T-10 | Pending implementation |
| A-7 | Approved overdue/expiry workers are bounded and idempotent. | T-7, T-11, T-18 | Pending policy approval |
| A-8 | Notifications have valid references, recipient ownership, safe text, and no duplicate retries. | T-12–T-15, T-17 | Pending implementation |
| A-9 | Librarian UI and regression/security evidence pass. | T-16–T-20 | Pending implementation |
| A-10 | No unresolved policy is guessed in source. | A-20 and evidence review | Pending human decisions |

## Risks and open questions

- Known risks: overdue policy and scheduler semantics affect member charges;
  current shared records do not have a typed fine reason; partial storage
  methods may expose unsafe assumptions; member/Jiali route ownership needs
  coordination; notification volume and privacy need bounded controls; local
  index and emulator availability remain verification gates.
- Open questions: exact overdue amount/recurrence/cutoff; lost-fine
  `FINE_ISSUED` notification; waiver `FINE_UPDATED` notification; reservation
  list PII/filter scope; inactive-recipient behavior; worker hosting/retry
  budget; member-slice route owner/version.
- Explicit deviations allowed: None without `sdd-revise`, a canonical-spec
  amendment, and separate human approval.

## Receiving-agent acknowledgement

- Agent: Not assigned
- Date: Not applicable
- Spec and handoff read: `NO`
- Blocking clarification required: Yes — human approval and resolution of the
  listed policy/integration decisions are required before implementation.

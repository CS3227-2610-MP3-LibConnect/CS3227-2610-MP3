# Independent Review Report: librarian-reservations-fines-notifications

Date: 2026-10-22

## Review scope and provenance

- Reviewed implementation commit: `b54db01833df53a549f42076d1eb25dae4abcfcc`
  (`feat: implement librarian reservations fines and notifications`).
- Initial evidence follow-up: `87628909e6b52e38793bad0ba81b07a524c57a54`;
  re-review approval evidence: `f468ec5`.
- Worktree/branch: clean `jiali-librarian`; application source, tests, indexes,
  and generated artifacts are unchanged relative to `b54db01`.
- Read before review: canonical specification
  `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md`,
  task-local `spec.md`, `tasks.md`, `handoff.md`, `security-review.md`, and
  `implementation-report.md`.
- Review role: independent reviewer/tester. No production code, tests,
  dependencies, deployment configuration, external service, commit, merge, or
  release action was modified or performed.

## Initial review result

`NOT APPROVED FOR MERGE`.

The implementation is functionally well covered by the available checks, and
the reviewed routes/workflows enforce server-loaded roles, strict request
boundaries, ownership checks, transactional state transitions, notification
reference validation, bounded queries, and safe librarian response DTOs.
However, the task evidence records the specification, checklist, and handoff
as `DRAFT` with their human approval gates still pending. The repository rules
state that no application-source changes were authorized until those gates are
recorded. Passing tests cannot retroactively grant that approval.

## Re-review addendum — 2026-10-22

The approval blocker above is resolved by `f468ec5`:

- canonical specification: `0.4-approved`, human-approved on 2026-10-22;
- task checklist: `0.2-approved`, human-approved on 2026-10-22;
- handoff: approved, with the worker deadline and generic repository-method
  limitations explicitly accepted as documented residual risks.

The implementation tree remains unchanged from `b54db01`; `f468ec5` changes
only specification, plan, handoff, and task evidence. Re-review found no new
P0, P1, or P2 defects. R-2 and R-3 remain valid technical residual risks but
are now recorded as accepted for this stage. The implementation review result
is therefore `PASS WITH ACCEPTED RESIDUAL RISK`; this is not approval to merge.

## Regression audit and remediation addendum — 2026-10-22

The current branch was re-audited at the user's request after the prior
feature review. The audit found one production defect in the browser-to-API
boundary: the librarian message client sends the approved `Idempotency-Key`
header, but the CORS preflight response advertised only `Content-Type`. A
cross-origin browser therefore rejected the message request before it reached
the authenticated route, despite the server-side route and idempotency logic
being correct.

### R-4 — RESOLVED: librarian message preflight omitted Idempotency-Key

- Severity: `P1` availability/feature failure for the deployed cross-origin UI.
- Boundary: configured client origin → Express CORS preflight.
- Reproduction: send `OPTIONS /api/v1/librarian/notifications` with
  `Origin: <CLIENT_ORIGIN>`, `Access-Control-Request-Method: POST`, and
  `Access-Control-Request-Headers: content-type,idempotency-key`. Before the
  remediation, the response was `204` but `Access-Control-Allow-Headers` was
  only `Content-Type`; browsers then blocked the actual message POST.
- Fix: `apps/api/src/http/origin-protection.ts` now advertises
  `Content-Type, Idempotency-Key`, and `tests/origin-protection.test.mjs`
  covers the exact preflight shape.
- Verification: focused origin/notification tests pass 10/10; full regression
  passes 136/136; build, lint, format, catalog emulator, manager emulator,
  member-account emulator, and reservations/fines emulator all pass.
- Residual risk: CORS remains configuration-dependent; production must use the
  validated client/API origins and HTTPS settings already enforced at startup.

The remediation was made in the shared working tree because the user
explicitly requested that the tester/reviewer fix discovered defects. This is
recorded as a workflow exception: the change is limited to the identified
CORS defect and its regression test, and no merge or release action was taken.
The review verdict for the current working tree remains `PASS WITH ACCEPTED
RESIDUAL RISK`, subject to human decision on the exact implementation change.

## Cross-branch pre-merge audit addendum — 2026-10-22

The requested integration audit compared current `jiali-librarian` at
`70c1967` with `origin/junhong` at `2e18492`. The review used a temporary clone
for a non-persistent three-way merge simulation; the shared working tree was
not merged or reset. The simulation reports 25 conflicted paths, including
`AGENTS.md`, the SoCLaaS adapter, `apps/api/src/server.ts`, shared workflows,
the client app, styles, `firestore.indexes.json`, `package.json`, and tracked
generated output. Jun Hong's branch also deletes approved Jiali specifications,
workflow evidence, librarian routes/pages, and their tests; those files must
not be accepted as deletions during integration.

### M-1 — BLOCKER: shared-branch merge is not mechanically safe

- Boundary: branch integration and release evidence.
- Evidence: three-way merge simulation exits with conflicts in 25 paths;
  `origin/junhong` contains 241 additions, 191 deletions, and 88 modifications
  relative to this branch, including deletion of Jiali-owned routes, tests,
  specifications, and review evidence.
- Required control: resolve the merge manually by preserving both feature
  surfaces, unioning the package scripts and Firestore indexes, preserving the
  current security/workflow instructions and evidence, then rebuild the
  generated output from the resolved TypeScript sources. Do not merge or accept
  the remote branch's deletions as a conflict strategy.
- Verification required: clean merge, `npm install` from the merged lockfile,
  the unioned full test command, all Jiali emulator suites, Jun Hong's member
  emulator suites, and a review of the final diff.
- Residual risk: unresolved until a merged tree exists; neither branch's
  standalone passing tests prove combined behavior.

### M-2 — P1: member notification preview is unbounded

- Boundary: member request to Firestore notification query.
- Attack path: a member with more than two unread notifications calls the
  preview endpoint; `LibraryRepository.notificationPreview` queries unread
  records without a database `limit`, then returns every unread item.
- Impact: response size, Firestore reads, latency, and member-data exposure
  grow with notification history. This contradicts the bounded preview
  contract and can be abused for resource exhaustion.
- Required control: add a database `limit(2)` to the unread preview query and
  a regression test with more than two unread records asserting exactly the
  bounded newest result set.
- Residual risk: the fix must be applied in the merged source, not only in a
  temporary review clone.

### M-3 — P2: member availability and capacity checks read more than needed

- Boundary: member reservation/borrow workflows to Firestore.
- Evidence: Jun Hong's `createMemberReservation` reads all available copies
  and all matching pending reservations although each check only needs
  existence; `memberBorrowCapacity` reads every active loan to compute a
  count. The current Jiali security review already records unbounded helper
  reads as S6.
- Required control: use bounded existence queries for reservation checks and a
  bounded or aggregate count strategy for borrow capacity. Preserve the
  approved exact-count behavior for the assistant, including malformed
  above-limit data, and add query-bound assertions/emulator coverage.
- Residual risk: exact Firestore billing/read behavior must be rechecked after
  the merged storage implementation is selected.

### M-4 — P1 security integration requirement: password reset must invalidate
auth versions

- Boundary: manager password reset to Jun Hong's versioned session middleware.
- Attack path: if the Jiali `resetLibrarianPassword` implementation is merged
  without also incrementing the target user's `authVersion` in the same user
  transaction, then a failed or delayed `destroyForUser` session cleanup can
  leave an old target session accepted by Jun Hong's `requireActiveActor`.
- Impact: a target's pre-reset session may remain usable after the password
  reset, contrary to the approved password-reset session-revocation contract.
- Required control: atomically update the target password hash and increment
  `authVersion`; persist version-aware sessions; ensure the active-actor check
  rejects stale versions; retain the bounded revocation retry/queue as defense
  in depth. Add a regression test that simulates revocation failure and proves
  an old target session is denied.
- Residual risk: the exact combined account-storage transaction must be
  independently reviewed after conflict resolution.

### M-5 — P1: shared SoCLaaS and server contracts require manual composition

- Boundary: two role-specific assistants sharing one provider adapter and API
  server.
- Evidence: both branches add incompatible `SoCLlmRequest`/`SoCLlmResult`
  contracts and provider implementations; `apps/api/src/server.ts` also has
  conflicting route construction and middleware wiring.
- Required control: compose one adapter with a narrow feature allowlist,
  server-only credentials, per-feature validation/quotas, and no caller model
  selection; mount both member and librarian routers while preserving each
  role's authorization and safe-error behavior. Do not resolve by choosing one
  side wholesale.
- Residual risk: combined AI adversarial and cross-role tests are required
  after the merged adapter exists.

### Current cross-branch verdict

`FAIL — NOT READY FOR MERGE`. The current Jiali branch is green in isolation,
but the merge target has unresolved conflicts and the findings above require
source changes and combined verification. This is review evidence only; no
merge, commit, push, or release action was performed.

## Findings

### R-1 — BLOCKER: implementation crossed an explicitly pending approval gate

- Boundary: specification/task approval to implementation.
- Evidence: canonical spec status is `0.3-draft`; `tasks.md` is `DRAFT`; the
  handoff says full specification, checklist, and handoff approval are not
  recorded and that no application implementation is authorized. Nevertheless,
  `b54db01` changes application source, tests, indexes, package scripts, and
  tracked build output.
- Impact: the implementation may not be merged or released under the stated
  workflow, regardless of test results. The task artifacts also disagree on
  the checklist/spec versions (`0.2-draft` in the checklist inputs versus
  `0.3-draft` elsewhere).
- Required control: a human must decide the disposition, record the exact
  approved spec/checklist/handoff versions and approval state, and then decide
  separately whether to request changes, accept the implementation, or merge.
  Do not infer approval from this report or from passing tests.

### R-2 — P2: worker deadline does not cancel in-flight work

- Boundary: scheduler/worker execution deadline.
- Attack path: `runWorker` uses `Promise.race` in
  `apps/api/src/storage/expire-reservations.ts`; when the deadline wins, the
  underlying `expireReservations`/`processOverdue` promises continue running.
  A slow or stuck Firestore operation can therefore continue after the claimed
  60-second invocation deadline while a later scheduler retry may overlap it.
- Impact: the invocation is bounded only from the caller's perspective, not at
  the storage-operation boundary; it can consume resources beyond the budget
  and perform late writes. Transactional deterministic IDs reduce duplicate
  record risk but do not stop the excess work.
- Recommended control: make batch processing deadline-aware at each page and
  transaction boundary, stop starting work when the shared deadline is reached,
  and use an abort/cancellation mechanism where the runtime/storage client
  supports it. Add a test that a slow operation cannot start a subsequent page
  or retry after the deadline.
- Residual risk: production worker deployment and scheduler behavior remain
  release-gated and were not exercised here.

### R-3 — P2 residual before member-slice integration: generic notification methods remain broad

- Boundary: repository-to-future-route boundary.
- Evidence: `LibraryRepository.putNotification` still accepts a full
  client-shaped notification record and is librarian-authorized; `getNotification`
  permits a librarian to read an arbitrary notification by ID. No current
  public route in `b54db01` exposes these methods, and the new librarian routes
  use dedicated server-owned workflows, so this is not an observed current
  route bypass.
- Impact: future member notification routes could accidentally expose
  cross-member reads or recipient spoofing by reusing these methods, contrary
  to the task security contract.
- Recommended control: remove or make these methods non-public, or replace them
  with dedicated member-owned reads and server-owned notification commands
  before the member slice wires routes to the repository. Add denial tests for
  librarian reads and client-supplied recipient/reference fields.

## Authorization and state-transition review

- Active actor middleware reloads the current user record and rejects signed-out,
  inactive, wrong-role, or stale-session requests; librarian workflows repeat
  active-role checks.
- Client-supplied roles, manager flags, recipient user IDs, notification
  references, fine amounts, statuses, and timestamps are not accepted by the
  new mutation schemas.
- Fine waiver/payment races are transactionally serialized; only outstanding
  fines transition to `WAIVED` or `PAID`, and waiver notification creation is
  coupled to the fine update.
- Lost-fine, reservation-ready, overdue, waiver, and librarian-message
  notification references are checked against the referenced member and
  deterministic IDs/idempotency guards prevent duplicate side effects.
- Reservation expiry re-reads the reservation and copy and releases a copy
  only when the live link still matches; no automatic reassignment is added.
- The librarian client renders stored message text as text and does not write
  Firestore or expose internal recipient user IDs in its response DTOs.
- No AI, external delivery, deployment, scheduler deployment, or member UI/
  route implementation was added beyond the documented member integration
  contract.

## Verification

All verification was run against the clean implementation tree, with local
listener/emulator permission where required:

| Command | Result |
|---|---|
| `npm test` | Passed, 96/96. The canonical command required local listener access for route tests. |
| `npm run build` | Passed; also executed by `npm test` and emulator verification. |
| `npm run lint` | Passed. |
| `npm run format:check` | Passed. |
| `git diff --check` | Passed. |
| `npm run test:reservations-fines:emulator` | Passed, 5/5; local Firestore emulator shut down successfully. |
| Worktree cleanliness / exact-tree check | Passed; no changes relative to `b54db01` in application source, tests, indexes, package, or generated output. |

Re-review rerun date: 2026-10-22. The full regression and emulator results
above were reproduced after the approval-evidence commit `f468ec5`; `npm run
lint` and `npm run format:check` also passed.

The default sandboxed test attempt was cancelled because its temporary HTTP
listeners could not bind; the same canonical command was rerun successfully
with the required local-listener access. The emulator emitted a benign metadata
lookup warning while using the local demo project; no external service was
used.

## Human decision required

Before any merge or release action, a human must approve that exact action and
any remaining release gates. This report is review evidence, not merge approval.

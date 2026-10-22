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

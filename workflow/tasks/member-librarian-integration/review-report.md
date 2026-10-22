# Review Report: member-librarian-integration

## Review identity

- Specification path and version:
  `PlanDraft/Specs/Integration/MemberLibrarianBranchIntegration.md`
  (`0.1-approved`).
- Task checklist path and version:
  `workflow/tasks/member-librarian-integration/tasks.md`
  (`0.1-approved`, Task 11 reviewer-owned).
- Handoff path:
  `workflow/tasks/member-librarian-integration/handoff.md` (`APPROVED`).
- Implementation snapshot: staged diff against
  `b7270e76b29b0bbddf0f71bccec7aa5f62adb1a5`.
- Staged diff SHA-256:
  `ecb3f3c5820cd3a6411f3358d2d01c6d954778237f5474bb44e528d81ec06e32`.
- Staged diff summary: 322 files changed, 29,575 insertions, 5,039
  deletions.
- Review branch or worktree:
  `/private/tmp/libconnect-member-librarian-review-01a163a8`, detached at the
  stated base commit.
- Clean-checkout or separate-worktree exception: None. This is a separate
  review workspace. The only unstaged item before review evidence was written
  was the declared `node_modules` symlink to the primary workspace; it was
  treated as test infrastructure and excluded from the snapshot.
- Reviewer: Codex, acting only as independent Review and Test Agent.
- Skill selected: repository-local `ai-security-review`, read completely before
  review actions because this integration crosses AI, authentication,
  authorization, ownership, session, and agent-workflow boundaries.
- Tools and permissions used: read-only Git/filesystem inspection and local
  Node test execution. Writes were limited to this report,
  `security-review.md`, and
  `logs/member-librarian-integration/review-2026-10-22.md`. No source, test,
  generated-output, dependency, Git-index, branch, external-service, provider,
  emulator, deployment, scheduler, commit, push, or merge mutation was made.

## Snapshot verification

The snapshot identity matched the supplied values before source review:

| Check | Expected | Observed | Result |
|---|---|---|---|
| `git rev-parse HEAD` | `b7270e76b29b0bbddf0f71bccec7aa5f62adb1a5` | Exact match | PASS |
| SHA-256 of `git diff --cached --binary` | `ecb3f3c5820cd3a6411f3358d2d01c6d954778237f5474bb44e528d81ec06e32` | Exact match | PASS |
| `git diff --cached --shortstat` | 322 files, +29,575/-5,039 | Exact match | PASS |
| Initial unstaged state | Infrastructure symlink only | `?? node_modules`, verified as a symlink | PASS |
| `git diff --cached --check` | No whitespace errors | No output, exit 0 | PASS |

## Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Complete read of `AGENTS.md`, `Overview.md`, `PLAN.md`, canonical integration spec, task pointer/checklist/handoff, reviewer instructions, and `ai-security-review/SKILL.md` | PASS | Required sources were read before fingerprinting or implementation review. |
| Review template, workflow rules, implementation report, existing implementation security review, and `package.json` inspection | PASS | Established report format, claimed verification, scripts, and residual risks; implementer conclusions were treated as untrusted evidence. |
| Staged file inventory and size inspection | PASS | Identified 322 staged paths and prioritized authored identity, storage, workflow, API, AI, client, configuration, test, generated, and evidence surfaces. |
| Canonical member-borrow requirement trace to staged workflow, route, client, and tests | FAIL | Canonical `CreateLoan.md` requires one atomic all-or-none checkout and counts `ACTIVE` plus `PENDING_CLOSE`. Staged code performs one transaction per copy and queries only `ACTIVE`; route/client/tests expose and celebrate partial success. |
| `node --test --test-name-pattern='member confirmation reports per-copy failures|confirmation rejects a copy that became unavailable|confirmation submitted above remaining capacity' tests/member-storage/member-borrow-storage.test.mjs` | 3/3 PASS, but confirms the defect | The tests pass because they assert partial database mutation for mixed-invalid and over-capacity batches, contradicting the canonical specification. |
| Full build, lint, format, regression, coverage, emulator, browser, and remaining adversarial/security matrix | NOT RUN | Review stopped at the first blocking defect as explicitly required. Passing implementer results were not adopted as independent proof. |

## Acceptance checklist

`NOT VERIFIED` means the criterion was not independently completed because the
review stopped on the blocker; it is not a pass.

| Criterion | Evidence | Result |
|---|---|---|
| A-1 | Staged role-tree inventory began, but semantic completeness was not finished. | NOT VERIFIED |
| A-2 | Staged whitespace passed; complete capability/merge-marker review was not finished. | NOT VERIFIED |
| A-3 | Generated output was inspected as staged inventory but not independently rebuilt. | NOT VERIFIED |
| A-4 | Auth/session source was inspected; no independent route/emulator run completed. | NOT VERIFIED |
| A-5 | Version-zero source behavior was inspected; full independent verification stopped early. | NOT VERIFIED |
| A-6 | Password/reset/deactivation source was inspected; full independent verification stopped early. | NOT VERIFIED |
| A-7 | Active-actor and role source was inspected; complete denial matrix was not run. | NOT VERIFIED |
| A-8 | Ownership checks were partially inspected; complete cross-member matrix was not run. | NOT VERIFIED |
| A-9 | Member borrow behavior violates the canonical all-or-none and loan-limit requirements. | **FAIL** |
| A-10 | Librarian functional matrix not completed after blocker. | NOT VERIFIED |
| A-11 | Manager functional matrix not completed after blocker. | NOT VERIFIED |
| A-12 | Cross-role circulation matrix not completed after blocker. | NOT VERIFIED |
| A-13 | Fine/reservation/notification visibility matrix not completed after blocker. | NOT VERIFIED |
| A-14 | `confirmMemberBorrow` uses independent per-copy transactions and deliberately leaves partial writes; its limit query omits `PENDING_CLOSE`. | **FAIL** |
| A-15 | Index/query trace not completed after blocker. | NOT VERIFIED |
| A-16 | Unified seed parse/load not independently run. | NOT VERIFIED |
| A-17 | Worker retry/idempotency/sanitized-log matrix not completed after blocker. | NOT VERIFIED |
| A-18 | AI source/test matrix not completed after blocker. | NOT VERIFIED |
| A-19 | AI no-write boundary not independently completed after blocker. | NOT VERIFIED |
| A-20 | Sensitive-data scans were not completed after blocker. | NOT VERIFIED |
| A-21 | Direct-client-Firestore review was not completed after blocker. | NOT VERIFIED |
| A-22 | Independent build/lint/full regression not run after blocker. | NOT VERIFIED |
| A-23 | Independent emulator matrix not run after blocker. | NOT VERIFIED |
| A-24 | Independent browser verification not run after blocker. | NOT VERIFIED |
| A-25 | Implementation evidence claims preserved transaction behavior and no approved deviations, while source/tests implement the opposite of the canonical borrow contract. | **FAIL** |
| A-26 | The exact snapshot was independently fingerprinted and reviewed, but the review found a blocker. | **FAIL** |

## Findings

### Finding 1 — Multi-copy checkout is non-atomic and undercounts open loans

- Severity: `BLOCKER`
- Boundary: Member circulation state machine and Firestore transaction boundary.
- Affected requirements:
  `PlanDraft/Specs/Member/completed/CreateLoan.md:16-20` requires a single
  all-or-none checkout; lines 31-37 require `ACTIVE` and `PENDING_CLOSE` loans
  to count together and require an over-capacity batch to be rejected in full.
  Integration acceptance criteria A-9 and A-14 require that approved member
  behavior and transaction boundaries survive integration.
- Affected implementation:
  `apps/api/src/storage/workflows.ts:194-201` counts only `ACTIVE` loans;
  `apps/api/src/storage/workflows.ts:211-257` loops over copy IDs and commits a
  separate transaction for each copy, catches each storage failure, and returns
  mixed outcomes. `apps/api/src/routes/member-borrow.ts:67-70` returns HTTP 201
  for that mixed result. `apps/client/src/pages/MemberBorrow.tsx:78-82` removes
  successful copies while retaining failures, making partial mutation visible
  product behavior.
- Reproduction:
  1. Submit two staged copies where one became unavailable before confirmation.
  2. The first unavailable copy produces a failure outcome, while the eligible
     sibling is committed as `ON_LOAN` with a new loan.
  3. Alternatively, start with eight counted `ACTIVE` loans and submit three
     copies; two are committed and the third fails rather than rejecting the
     batch.
  4. The focused command above passed three tests that explicitly assert these
     partial writes (`tests/member-storage/member-borrow-storage.test.mjs:586-624`
     and `651-660`). API coverage likewise expects mixed success at
     `tests/member-api/member-borrow-api.test.mjs:115-132`.
  5. A member with `PENDING_CLOSE` loans can also be offered excessive
     capacity because both capacity and confirmation queries filter only
     `status == ACTIVE`.
- Impact: A user can receive only part of the checkout they confirmed, despite
  an error in the same request. Open-loan policy can be exceeded when pending
  closure loans exist. Retry behavior becomes ambiguous and the resulting
  loan/copy state violates the approved member contract and integration's
  transaction-preservation gate.
- Required fix: Reconcile production behavior to the canonical approved
  specification before changing code if the team instead intends partial
  success. Under the current contract, validate the authenticated current
  member, all requested copies/books, duplicate IDs, and the combined
  `ACTIVE` plus `PENDING_CLOSE` open-loan count in one transaction; reject the
  whole request before any write when any copy is unavailable or the complete
  batch exceeds capacity; then create every loan and update every copy in that
  same transaction. Align the route response, client behavior, generated
  output, tests, implementation report, and task evidence with that contract.
- Verification: Add deterministic unit/API/emulator cases proving (a) a mixed
  stale/unavailable batch leaves every requested eligible sibling unchanged,
  (b) an over-capacity batch leaves all copies and loans unchanged, (c)
  `PENDING_CLOSE` counts toward the limit/capacity, (d) concurrent batches
  cannot exceed ten open loans, and (e) successful batches commit all copies
  and loans together. Re-run the complete Task 11 matrix on a new exact
  fingerprint.
- Residual risk: Even after a local fix, concurrent query/transaction behavior
  must be proven against the Firestore emulator; fake in-memory tests alone are
  insufficient.

### Finding 2 — Lower-priority tests and evidence enshrine an unapproved requirement change

- Severity: `MEDIUM`
- Boundary: Specification provenance and review evidence integrity.
- Reproduction: The canonical `PlanDraft/Specs/Member/completed/CreateLoan.md`
  requires all-or-none behavior, while historical
  `specdocs/completed/member-borrow/design.md` and staged tests require partial
  success. The implementation report states that transaction behavior was
  retained and that approved-specification deviations are none.
- Impact: The full suite can pass while proving behavior that contradicts the
  repository's higher-priority specification, so test counts and coverage are
  misleading evidence for A-9, A-14, A-22, and A-25.
- Required fix: Resolve the specification conflict through the repository's
  source-of-truth order. If all-or-none remains approved, update the lower-
  priority design copy, tests, docs, implementation/security evidence, and
  generated output. If partial success is desired, use `sdd-revise` and obtain
  separate human approval before implementation.
- Verification: Add a traceability check that maps each canonical acceptance
  statement to a test whose assertions match it; record the corrected exact
  snapshot and all failed-then-passing commands without deleting this review.
- Residual risk: Historical duplicated specifications remain a recurring
  drift risk unless clearly marked and mechanically checked against the
  canonical tree.

## Residual risks and review limitations

- The review intentionally stopped after the blocker. Authentication,
  librarian/manager workflows, remaining state transitions, AI isolation,
  configuration, generated output, full regression, coverage, browser, and
  emulator claims remain independently unverified.
- The implementation report records eight moderate dependency-audit findings;
  this review did not access the network or independently reproduce/triage
  them.
- No live provider, production Firebase, deployment, index creation,
  scheduler, external communication, commit, push, or merge action was run.

## Verdict

- Result: `FAIL`
- Human decision required: Request implementation changes; do not merge this
  snapshot. After remediation, provide a new immutable commit or staged-diff
  fingerprint for a fresh independent review. The reviewer cannot approve the
  merge.
- Follow-up task: Remediate Finding 1 and reconcile Finding 2 through the
  approved specification workflow, then repeat Task 11 in full.

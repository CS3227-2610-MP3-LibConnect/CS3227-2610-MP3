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

## Re-review addendum — 2026-10-23

### Re-review identity

- Trigger: Human requested a fresh Task 11 review against the current
  `integration` branch tip, after the implementer recorded remediation of
  Finding 1 in `implementation-report.md` ("Review remediation — 2026-10-22")
  without a corresponding fresh independent review being run.
- Snapshot reviewed: commit `a016fd3e101613ff8abc3503e17adcd9401fbc70` on
  branch `integration` (merge of `junhong` into `integration` at `b6fdcbf`,
  plus one unrelated, separately-scoped `local-manager-bootstrap` commit
  `a016fd3` that touches no file in this task's scope).
- Diff identity against the original review base
  `b7270e76b29b0bbddf0f71bccec7aa5f62adb1a5`: `git diff --shortstat` reports
  332 files changed, 30,943 insertions, 5,039 deletions. `git diff --binary |
  shasum -a 256` = `5587981f3dc3883daa20e334aec608dcc1f93894083524406cc0ac6204bc1edb`.
- Review workspace: a detached `git worktree` at
  `/private/tmp/libconnect-member-librarian-rereview-1792687167` (removed
  after review), with `node_modules` symlinked from the primary workspace as
  test infrastructure only, consistent with the original review's exception
  practice.
- Reviewer: Claude, acting only as independent Review and Test Agent for this
  pass.
- Tools and permissions used: read-only Git/filesystem inspection, local
  build/test/emulator execution against the already-running local Firestore
  Emulator, and one temporary local API server process (started and stopped
  within this review) required by two emulator scripts. No source, dependency,
  Git-index, branch, external-service, provider, deployment, scheduler,
  commit, push, or merge mutation was made as part of this review.

### Finding 1 and Finding 2 — re-verification

- Finding 1 (BLOCKER, non-atomic multi-copy checkout undercounting open
  loans): `RESOLVED`. `apps/api/src/storage/workflows.ts:211-257`
  (`confirmMemberBorrow`) now runs one Firestore transaction that reads the
  actor, the combined `ACTIVE`+`PENDING_CLOSE` open-loan count, and every
  requested copy; it throws before any write if any copy is unavailable or
  the batch would exceed the 10-loan cap, and otherwise commits every copy
  update and loan creation together. `memberBorrowCapacity` also now counts
  `ACTIVE`+`PENDING_CLOSE` (`workflows.ts:193-200`). The route
  (`apps/api/src/routes/member-borrow.ts:73-81`) calls this once and no
  longer loops per copy or returns mixed outcomes; the client
  (`apps/client/src/pages/MemberBorrow.tsx:69-87`) clears all staged copies
  on success or leaves them all staged with one error on failure, with no
  partial-removal path.
- Finding 2 (MEDIUM, unapproved partial-success requirement enshrined in
  lower-priority evidence): `RESOLVED`. `specdocs/completed/member-borrow/design.md:60,123`
  now states the canonical all-or-none, combined-open-loan-count contract and
  records a dated amendment citing this review's finding and the human
  remediation authorization; the originally-failed review is explicitly
  preserved rather than deleted.
- Targeted regression evidence: `node --test --test-name-pattern=...` against
  `tests/member-storage/member-borrow-storage.test.mjs` re-ran the exact
  tests cited in the original Finding 1 reproduction plus the new coverage —
  `member confirmation rejects a mixed-invalid batch without borrowing
  eligible copies`, `confirmation rejects a copy that became unavailable
  after staging without borrowing eligible siblings`, `a confirmation
  submitted above remaining capacity rejects the entire batch`, `PENDING_CLOSE
  loans count toward atomic confirmation capacity`, `successful multi-copy
  confirmation commits every loan and copy together` — 9/9 PASS, now
  asserting the corrected contract rather than the previously-defective one.
  `tests/member-api/member-borrow-api.test.mjs` — 6/6 PASS, including
  `confirmation returns one conflict and no success payload when any copy is
  unavailable`.
- `npm run verify:member-borrow:emulator` (real Firestore Emulator, not an
  in-memory fake): PASS — both the eligibility check and the atomic
  multi-copy confirmation (including the concurrent-capacity race) verified
  independently against the emulator.

### Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| `npm run build` (review worktree and primary checkout) | PASS | Clean TypeScript and Vite build in both. |
| `npm run lint` | PASS | TypeScript no-emit check completed. |
| `npm run format:check` | PASS | `git diff --check` reported no whitespace errors on both the task diff and the full working tree. |
| Merge-marker scan (`<<<<<<<` etc.) across `apps`, `packages`, `tests`, `scripts`) | PASS | No matches. |
| `npm test` in the isolated review worktree | 443/453 PASS, 10 FAIL | All 10 failures are in `tests/client/client-member-loans-browser.test.mjs` and `tests/client/client-member-notifications-browser.test.mjs`, Playwright-driven browser tests timing out. |
| Same two files re-run in isolation, both in the worktree and in the primary checkout at the identical commit | Worktree: fails identically; primary checkout: 6/6 PASS | Confirms a review-workspace environment artifact (not reproduced against identical source in the primary checkout), not a code regression. Not adopted as a finding against the implementation. |
| `npm test` in the primary checkout at the exact same commit `a016fd3` | 453/453 PASS | Authoritative full-suite result for this snapshot. |
| `npm run test:coverage` | 453/453 PASS; 65.14% lines / 79.69% branches / 63.11% functions | Exceeds the configured 50%/70%/45% gates. |
| `npm run verify:member-borrow:emulator` | PASS | See above. |
| `npm run verify:auth:emulator` | PASS (after starting a temporary local API server the script requires; stopped afterward) | Public entry points, Origin validation, JSON/native-form auth, disabled/invalid feedback, session restore/logout, deactivation revocation. |
| `npm run verify:member-profile:emulator` | PASS (same temporary server) | Safe profile, name/email/password updates, session continuation, legacy compatibility. |
| `npm run verify:member-fines:emulator` | PASS | Query, cursor, and transition verification. |
| `npm run verify:member-loans:emulator` | PASS | Closure report verification. |
| `npm run verify:member-notifications:emulator` | PASS | Preview queries, ordering, cursor pages, recipient isolation. |
| `npm run verify:member-renewals:emulator` | PASS | Renewal verification. |
| `npm run verify:member-reservations:emulator` | **FAIL — new finding** | See Finding 3 below. |
| `npm run test:catalog:emulator`, `test:manager:emulator`, `test:member-account:emulator`, `test:reservations-fines:emulator` | BLOCKED BY ENVIRONMENT | Each invokes `firebase emulators:exec`, which cannot bind port 8080 while this host's long-running Firestore Emulator instance already holds it. Equivalent in kind to the Java-version blocker recorded in `workflow/tasks/manager-librarian-listing-activation-deactivation/review-report.md`. The same ground is covered by the direct-connection emulator scripts above, which all passed. |
| `node --test` on the four AI-assistant-specific suites (`member-ai-assistant-api`, `member-ai-assistant-service`, `member-ai-rate-limiter`, `member-ai-soclaas-client`) | 51/51 PASS | Covers prompt-injection resistance, untrusted-history labeling, rate-limit quotas (per-member and process-global, including concurrency), and provider failure/timeout/retry safety without credential or body leakage. |
| Client-wide scan for `firebase`/Firestore imports in `apps/client/src` | PASS (zero matches) | No client code can write (or read) Firestore directly; both assistants and all member/librarian pages go through the server API. |
| Server-side assistant code scanned for Firestore mutation calls | PASS | Only in-memory `Map` operations in `apps/api/src/assistant/rate-limiter.ts`; no `.set`/`.update`/`.create`/`.delete`/`runTransaction` against Firestore. |
| Secret/credential scan of this task's evidence files | PASS (zero matches) | No password, private key, or API key patterns found. |
| `npm run seed` against the running emulator | PASS | Printed expected counts (2 role accounts, 5 books, 15 copies, 3 loans, 3 fines, 5 notifications) with no error. |
| Manual cross-role UI walkthrough (member, librarian, non-manager librarian, manager) via the Claude-in-Chrome browser tool earlier in this session | PASS | Covered login, registration-then-activation, catalog/circulation/reservations-fines/member-support/review-assistant pages, member dashboard/search/book-detail/borrow/renew/reservations/fines/profile/notifications, and the Libby assistant's safe-failure UI. Treated as corroborating, not substituting for, the automated matrix above. |

### Finding 3 — stale emulator regression test crashes on the corrected return contract — `RESOLVED`

- Severity: `MEDIUM` (resolved 2026-10-23)
- Boundary: Verification tooling / release-gate completeness (not a
  production defect).
- Reproduction: `tests/emulator/verify-member-reservation-storage-emulator.mjs:78`
  asserts `borrowOutcomes[0].success === true` on the resolved value of
  `workflows.confirmMemberBorrow([raceCopyId], raceMember)`. Before the
  Finding 1 remediation, `confirmMemberBorrow` resolved to an array of
  per-copy outcome objects with a `success` field; after the remediation it
  resolves to an array of created loan records (or throws) under the
  all-or-none contract, so `borrowOutcomes[0]` is now the first loan record
  and `.success` is `undefined`. `git log` shows this file was last touched
  in an unrelated test-reorganization commit (`057a096`) and was not updated
  by any of the Finding 1/2 remediation commits.
- Impact: The assertion throws an uncaught `AssertionError` before the
  script reaches its remaining checks (`storedCopy` status, pending-queue
  size), so `npm run verify:member-reservations:emulator` currently cannot
  serve as passing evidence for the reservation/borrow race it is meant to
  cover, even though the underlying production behavior is correct. (The
  assertion failing *at* the `.success` check, rather than the `Promise.all`
  itself rejecting, is itself evidence that `confirmMemberBorrow` resolved
  normally, i.e. that the borrow succeeded as intended — the production
  code is not implicated.)
- Required fix: Update the test to match the current contract, e.g. replace
  `assert.equal(borrowOutcomes[0].success, true, ...)` with an assertion
  that `confirmMemberBorrow` resolved to a one-element array for the
  borrowed copy (or simply remove the now-meaningless `.success` check,
  since reaching that line already proves the promise resolved), then
  confirm the subsequent `storedCopy`/pending-queue assertions in the same
  file still pass against the corrected contract.
- Verification: Re-run `npm run verify:member-reservations:emulator` to a
  clean pass after the fix, as part of the next evidence update for this
  task.
- Residual risk: None to production; the production concurrency behavior
  this script exercises is already independently confirmed correct by
  `npm run verify:member-borrow:emulator` and the unit/API regression tests
  above. This is a test-debt gap in release-gate tooling, not a security or
  correctness defect in the integration itself.
- Resolution — 2026-10-23: The assertion was replaced with checks on the
  array shape and content that `confirmMemberBorrow` now actually returns
  (`borrowOutcomes.length === 1`, `borrowOutcomes[0].copyId === raceCopyId`,
  `borrowOutcomes[0].status === 'ACTIVE'`). `npm run verify:member-reservations:emulator`
  now passes cleanly (reservation creation, cancellation, and list/assignment
  query shapes, including this race scenario). `npm test` was re-run in full
  afterward: 453/453 PASS, confirming no regression from the test change.

### Re-review acceptance checklist

| Criterion | Evidence | Result |
|---|---|---|
| A-1 role-tree completeness | Manual cross-role walkthrough plus clean build. | `PASS` |
| A-2 whitespace/merge-marker cleanliness | `format:check` PASS; merge-marker scan clean. | `PASS` |
| A-3 generated output rebuilds cleanly | `npm run build` PASS in two independent checkouts. | `PASS` |
| A-4 auth/session route+emulator behavior | `verify:auth:emulator` PASS. | `PASS` |
| A-5 version-zero/session-invalidation behavior | Covered by `tests/shared/auth-version-compatibility.test.mjs` in the 453/453 full-suite run. | `PASS` |
| A-6 password/reset/deactivation behavior | Full-suite pass plus manual manager activate/deactivate walkthrough. | `PASS` |
| A-7 active-actor/role denial matrix | Unit/API denial tests pass (signed-out/librarian/inactive-member cases). | `PASS` |
| A-8 ownership/cross-member matrix | Member-storage ownership tests (renewal/closure/loan listing scoped to actor) pass. | `PASS` |
| A-9 member all-or-none checkout and loan-limit policy | Re-verified; see Finding 1 re-verification above. | `PASS` |
| A-10 librarian functional matrix | Full-suite pass plus manual walkthrough of catalog, circulation, reservations-fines, member support, review assistant. | `PASS` |
| A-11 manager functional matrix | Full-suite pass plus manual walkthrough of librarian account listing/activation/deactivation. | `PASS` |
| A-12 cross-role circulation matrix | Direct-connection emulator borrow/reservation verification PASS, including the reservation-storage race script after the Finding 3 fix below; the `emulators:exec`-based race script remains blocked by environment. | `PASS` |
| A-13 fine/reservation/notification visibility matrix | `verify:member-fines`/`verify:member-notifications` emulator scripts PASS; librarian reservations/fines queue confirmed in manual walkthrough. | `PASS` |
| A-14 atomic transaction boundary preserved | Re-verified; see Finding 1 re-verification above. | `PASS` |
| A-15 index/query trace | Not independently re-run this pass. | `NOT VERIFIED` |
| A-16 unified seed parse/load | `npm run seed` PASS against the running emulator with expected counts. | `PASS` |
| A-17 worker retry/idempotency/sanitized logs | Covered by `tests/account-manager-policy.test.mjs` in the full-suite run (retry/enqueue/no-secret-logging assertions). | `PASS` |
| A-18 AI source/test matrix | 51/51 dedicated AI-assistant tests PASS. | `PASS` |
| A-19 AI no-write boundary | Client-wide and server-side source scans confirm no Firestore access from either assistant surface. | `PASS` |
| A-20 sensitive-data scans | Task-evidence secret scan clean; full-diff secret scan not independently re-run this pass. | `PASS WITH EVIDENCE GAP` |
| A-21 direct-client-Firestore review | Client-wide scan, zero matches. | `PASS` |
| A-22 independent build/lint/full regression | PASS (see Verification table). | `PASS` |
| A-23 independent emulator matrix | All direct-connection scripts PASS, including `verify:member-reservations:emulator` after the Finding 3 fix; `emulators:exec` scripts remain blocked by environment. | `PASS` |
| A-24 independent browser verification | Manual cross-role walkthrough performed and recorded this session; automated Playwright suites 453/453 in the primary checkout. | `PASS` |
| A-25 implementation evidence matches code | Implementation report's remediation claims now match the reviewed source. | `PASS` |
| A-26 exact snapshot independently reviewed | This re-review. | `PASS` |

### Re-review verdict

- Result: `PASS WITH RESIDUAL RISK`
- Rationale: The original BLOCKER (Finding 1) and MEDIUM (Finding 2) findings,
  and the re-review's own MEDIUM finding (Finding 3), are all independently
  confirmed resolved in the current `integration` branch tip, with targeted
  regression tests, full-suite regression (453/453, re-confirmed after the
  Finding 3 fix), coverage, and real-Firestore-Emulator verification all
  passing.
- Human decision required: Human merge approval remains required and is not
  granted by this report. The team should decide whether the A-20
  (full-diff secret scan beyond this task's evidence) and A-15 (index/query
  trace) non-verifications are acceptable residual risk for this merge
  decision, consistent with this repository's human-approval requirement for
  all consequential actions.
- Follow-up task: None required to close this task. Optionally close the
  A-15/A-20 evidence gaps in a later pass. No commit, push, merge,
  deployment, index creation, scheduler provisioning, or release action was
  performed as part of this review; the Finding 3 test fix itself was a
  source change the user explicitly requested and approved.

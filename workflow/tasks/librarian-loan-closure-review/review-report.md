# Review Report: librarian-loan-closure-review

## Review identity

- Specification path and version: `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md` (`0.3-approved`)
- Task checklist path and version: `workflow/tasks/librarian-loan-closure-review/tasks.md` (`0.1-approved`, marked `APPROVED`; all seven implementation tasks marked complete)
- Handoff path: `workflow/tasks/librarian-loan-closure-review/handoff.md` (`0.3-approved` specification and `0.1-approved` checklist)
- Implementation commit or diff: no implementation commit exists. Reviewed the exact dirty-worktree state at `HEAD 038761b` using `git diff HEAD` plus all untracked task files. The implementation-specific files were reconstructed into `/private/tmp/libconnect-loan-review-V0yR3D` from `git archive HEAD` and that exact diff for isolated execution.
- Review branch or worktree: isolated reconstructed review snapshot; source checkout branch is `jiali-librarian`.
- Clean-checkout or separate-worktree exception: `git worktree add` was unavailable because the repository `.git` administration area is not writable in this environment. The review snapshot was independently reconstructed from the committed base and captured diff. This compensates for shared-checkout contamination during execution, but it does not create the missing immutable implementation commit.
- Reviewer: Codex review and test agent
- Skills selected and versions or commits: repository-local `ai-security-review` procedure; repository `workflow/agents/reviewer-tester.md` procedure. No AI model, prompt, or external-content boundary is introduced by this feature.
- Tools and permissions used: read-only source and Git inspection, isolated local build/tests, loopback-enabled HTTP tests, and the local Firestore emulator with Temurin Java 21. Reviewer wrote only task evidence and execution-log files; no production source, commit, push, deployment, merge, or external message was performed.

## Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Read approved canonical spec, `tasks.md`, handoff, implementation report, security review, reviewer procedure, and source-of-truth workflow docs | PASS | Scope, authorization contract, state machine, test matrix, and approval gates were compared before review. |
| Git status, history, and diff inspection | FAIL / process blocker | `HEAD` is `038761b` (`docs(spec): approve librarian loan closure review workflow`); no implementation commit exists and the implementation remains uncommitted in the shared checkout. |
| Isolated snapshot reconstruction from `git archive HEAD` plus exact tracked/untracked diff | PASS WITH EXCEPTION | Snapshot used for all executable verification; no production source was changed by the reviewer. |
| `npm run build` | PASS | TypeScript and Vite builds completed. Vite emitted only existing missing-`VITE_API_ORIGIN` template warnings. |
| `npm run lint` | PASS | TypeScript no-emit check completed. |
| `git diff --check` and JSON parsing of `firestore.indexes.json`/`package.json` | PASS | No whitespace errors; manifests parse. |
| `npm test` with loopback listener permission | PASS | 77 tests passed, 0 failed, 0 cancelled. The initial sandbox-only run could not open the route-test listener and was cancelled; the required rerun with loopback access passed. |
| Focused HTTP/auth/Origin regression: `node --test tests/circulation-routes.test.mjs tests/active-actor.test.mjs tests/auth-routes.test.mjs tests/catalog-routes.test.mjs tests/manager-routes.test.mjs tests/origin-protection.test.mjs` | PASS | 36 tests passed, 0 failed. |
| Firestore emulator with Java 21 explicitly first on `PATH`: `firebase emulators:exec ... tests/circulation-workflow-emulator.mjs` | PASS | 2 tests passed, including concurrent loan/review operations and duplicate lost-fine assertions; emulator shut down cleanly. The first `JAVA_HOME`-only attempt failed because the shell still resolved Java 8; no application failure was inferred from that environment error. |
| Authorization/state/security source inspection | PASS WITH FINDINGS | Active actor and librarian checks are server-side; ownership and current-state checks are inside transactions; strict schemas and allowlisted DTOs are present; client has no Firestore import and sends no role/ownership/fine authorization fields. Unbounded Firestore reads and incomplete matrix evidence are recorded below. |
| Scope inspection | PASS WITH PROCESS FINDING | Circulation routes, UI, shared metadata, tests, indexes, and generated outputs are within the approved slice. The absence of an implementation commit prevents reproducible merge review. |

## Acceptance checklist

| Criterion | Evidence | Result |
|---|---|---|
| A-1 | `requireActiveActor` reloads the user; `requireLibrarian` and workflow guards reject inactive/member actors; route denial tests pass. | `PASS` |
| A-2 | Strict Zod request schemas, bounded IDs, forged-field route tests, and pre-workflow call assertions pass. | `PASS` |
| A-3 | Transactional available-copy loan path and 30-day due-date assertion pass in the emulator. | `PASS` |
| A-4 | Reserved-copy path is guarded in source, but no emulator scenario covers matching, wrong-member, expired, and missing-reservation outcomes as required by T-4. | `PASS WITH EVIDENCE GAP` |
| A-5 | Concurrent loan attempts produce one committed loan and an `ON_LOAN` copy in the emulator. | `PASS` |
| A-6 | Queue route is librarian-only, signed, deterministic, bounded at the response parameter, and allowlisted; however the storage query reads every `PENDING_CLOSE` loan before slicing the page. | `FAIL` |
| A-7 | Member ownership/current-state transaction guards exist and sequential/repeated report behavior is tested; foreign-loan and wrong-copy integration cases are not in the emulator matrix. | `PASS WITH EVIDENCE GAP` |
| A-8 | Reject restores `ACTIVE`/`ON_LOAN` and records reviewer metadata; the emulator covers a returned reject but not a lost reject. | `PASS WITH EVIDENCE GAP` |
| A-9 | Available and damaged dispositions are implemented; dedicated independent emulator assertions for both dispositions are absent, although the concurrent review test exercises one of them. | `PASS WITH EVIDENCE GAP` |
| A-10 | Earliest eligible reservation, 15-day expiry, linked notification, and retry-safe deterministic notification ID are implemented and the assigned-reservation path passes; the no-eligible-reservation rejection path is not exercised by the emulator test. | `PASS WITH EVIDENCE GAP` |
| A-11 | Lost review uses trusted server configuration, deterministic fine ID, transaction writes, and exactly-one-fine emulator assertion; no route-level lost-review extra-field test is present. | `PASS WITH EVIDENCE GAP` |
| A-12 | Current-state transaction guards and concurrent review one-winner behavior pass; required review-versus-catalog deletion/status races are not tested. | `PASS WITH EVIDENCE GAP` |
| A-13 | Protected React route, explicit confirmation, loading/empty/error/status states, disabled duplicate actions, and refresh behavior are present; no manual keyboard/accessibility check was recorded. | `PASS WITH EVIDENCE GAP` |
| A-14 | Client source contains no Firestore access and request-body tests show only approved fields with no fine override. | `PASS` |
| A-15 | Build, lint, format check, 77-test regression, route/auth/Origin tests, and Java-21 emulator verification pass. | `PASS WITH EVIDENCE GAP` |

## Findings

### Finding 1

- Severity: `BLOCKER`
- Boundary: Review reproducibility, Git/workflow approval gate
- Reproduction: `git status --short --branch` shows the implementation as a large uncommitted working-tree diff and untracked source/tests; `git log` contains no implementation commit after `038761b`. The implementation report itself says `Implementation commit: None`.
- Impact: There is no immutable artifact corresponding to the reviewed implementation. A later working-tree change could alter behavior without changing the reported review target, and a human cannot make a reproducible merge decision from an exact implementation commit.
- Required fix: Have the implementer preserve the reviewed scope in an exact implementation commit and update the handoff/implementation report with that commit identifier. Then repeat this independent review against that commit. The reviewer must not create or approve that commit.
- Verification: Confirm `git show <implementation-commit>` contains the reviewed source/tests/evidence and rerun the relevant verification from a clean checkout at that commit.
- Residual risk: Until an immutable commit exists, this review can establish evidence about the captured snapshot only, not approve a merge target.

### Finding 2

- Severity: `HIGH`
- Boundary: Browser/API to Firestore queue and reservation-selection reads
- Reproduction: `apps/api/src/storage/workflows.ts:210` executes `.where('status', '==', 'PENDING_CLOSE').get()` and only applies `slice(pageStart, pageStart + limit)` after the complete result set is loaded. The same unbounded pattern is used for pending reservations at lines 161 and 239 before in-memory filtering/sorting.
- Impact: A bounded API parameter does not produce a bounded database operation. A large pending queue or reservation set can cause excessive reads, memory use, transaction payload growth, or Firestore transaction failures. This violates the approved bounded queue contract and can prevent otherwise valid closure reviews under load.
- Required fix: Use a Firestore query ordered by the approved deterministic keys with a database `limit` (and a cursor/start-after representation that is integrity-protected), and use a bounded `limit(1)` reservation query where the eligibility predicate permits it. Preserve transaction reads for the selected reservation and revalidate its current state before writes.
- Verification: Add a test/evidence case with more than one page of pending records that proves the query itself is bounded, plus a transaction test for concurrent reservation insertion/assignment. Re-run T-6, T-10, and the emulator workflow.
- Residual risk: Current response limits reduce response size but do not reduce Firestore work or transaction contention.

### Finding 3

- Severity: `HIGH`
- Boundary: Release-gate evidence and task completion claims
- Reproduction: The implementation report and checklist mark tasks 4–7 complete, but `tests/circulation-workflow-emulator.mjs` has only two scenarios: one sequential end-to-end scenario and one concurrent loan/review scenario. It does not cover the required T-4 wrong-member/expired/missing reservation no-write paths, T-7 foreign/wrong-copy report paths, T-8 lost rejection, T-10 no eligible reservation, or T-12 review-versus-catalog deletion/status races. `tests/circulation-routes.test.mjs` uses mocked workflows and therefore does not establish storage behavior for those paths. No manual keyboard/accessibility evidence is recorded for T-14.
- Impact: Passing 77 tests does not establish all approved acceptance criteria. Missing negative and race coverage leaves authorization, no-partial-write, and state-machine regressions possible while the task evidence claims all gates are complete.
- Required fix: Add focused integration/emulator tests for each missing matrix scenario, or explicitly mark the affected checklist items incomplete and return them to implementation. Do not claim T-1–T-17 complete from source inspection alone.
- Verification: Map each new test to T-4, T-7, T-8, T-10, T-12, and T-14 in the implementation and review evidence; rerun the full suite and emulator suite.
- Residual risk: Core happy paths and two contention cases pass, but untested negative/race paths remain release uncertainty.

### Finding 4

- Severity: `MEDIUM`
- Boundary: Production configuration and release operations
- Reproduction: `getLostBookFineMinorUnits()` fails closed in production when `LOST_BOOK_FINE_MINOR_UNITS` is absent, while the emulator/test environment uses the approved 2000 minor-unit fallback. No production configuration or Firestore index deployment was performed or independently validated in this review.
- Impact: The code prevents an unset production policy from silently issuing a wrong fine, but release will fail or queries may fail if the approved policy and index manifest are not configured/deployed together.
- Required fix: Before release, configure the approved 2000 minor-unit policy in the production configuration store and deploy/validate `firestore.indexes.json` through a separately approved deployment action. Keep credentials and deployment values out of task evidence.
- Verification: Run a non-secret configuration presence check and the relevant production deployment/index validation under the human release gate.
- Residual risk: No production mutation was attempted; operational readiness remains a human-owned release decision.

## Verdict

- Result: `FAIL`
- Human decision required: Do not merge or deploy this implementation. The implementer must first create and identify the immutable implementation commit, address the unbounded queue/reservation reads, and close the missing verification matrix. A human must then decide whether the remaining operational configuration risk is accepted and whether to request a repeat review.
- Follow-up task: Return findings 1–3 to the implementer for a scoped correction and repeat independent verification from the resulting clean implementation commit. No merge, commit approval, deployment, or residual-risk acceptance was performed by this reviewer.

## Related security artifact

See `workflow/tasks/librarian-loan-closure-review/security-review.md`. This feature has no AI/model/tool boundary; the security procedure was applied to the server authorization, browser/API, Firestore transaction, evidence, and agent-workflow boundaries.

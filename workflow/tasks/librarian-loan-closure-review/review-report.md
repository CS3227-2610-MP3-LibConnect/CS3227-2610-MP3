# Review Report: librarian-loan-closure-review

## Review identity

- Specification path and version: `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md` (`0.3-approved`)
- Task checklist path and version: `workflow/tasks/librarian-loan-closure-review/tasks.md` (`0.1-approved`)
- Handoff path: `workflow/tasks/librarian-loan-closure-review/handoff.md`
- Implementation commit or diff: `ecb254e542f9211322b794c76fd6e722d3c4f09e` (`feat(circulation): implement librarian loan closure review workflow`)
- Review branch or worktree: clean reconstructed snapshot `/private/tmp/libconnect-loan-rereview-JTQ4z2` archived directly from `ecb254e`.
- Clean-checkout or separate-worktree exception: `git worktree add` remains unavailable because the repository `.git` administration area is not writable. The reviewed source was reconstructed from `git archive ecb254e`; the current checkout has only two post-commit evidence-file edits, which were excluded from the reviewed source snapshot. This is a reproducible clean-commit review with no production-source changes by the reviewer.
- Reviewer: Codex review and test agent
- Skills selected and versions or commits: repository-local `ai-security-review` procedure; repository `workflow/agents/reviewer-tester.md` procedure. No AI/model/tool boundary is introduced by this feature.
- Tools and permissions used: Git/source inspection, isolated build/tests, loopback-enabled HTTP tests, and local Firestore emulator with Temurin Java 21. Reviewer wrote only review evidence; no production mutation, commit, push, deployment, merge, or external message was performed.

## Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Read updated canonical spec, checklist, handoff, implementation report, prior review/security artifacts, and exact commit diff | PASS | The corrected commit and its claimed findings follow-up were compared with the approved contract. |
| `git show --check ecb254e` and `git diff --check ecb254e^ ecb254e` | PASS | The immutable implementation diff has no whitespace errors. |
| `npm run build` | PASS | TypeScript and Vite builds completed. Vite emitted only missing `VITE_API_ORIGIN` template warnings. |
| `npm run lint` | PASS | TypeScript no-emit check completed. |
| `npm test` with loopback listener access | PASS | 80 tests passed, 0 failed, 0 cancelled, including bounded-query, index-manifest, circulation route, UI, auth, catalog, manager, session, and Origin checks. |
| Firestore workflow emulator with Java 21: `tests/circulation-workflow-emulator.mjs` | PASS | 2 tests passed: atomic end-to-end transitions and concurrent loan/review one-winner behavior with no duplicate fine. |
| Firestore negative/race emulator with Java 21: `tests/circulation-negative-emulator.mjs` | FAIL | 2 of 3 tests passed. The reserved-loan test fails at line 60 because its supposed future expiry is `2026-02-01`, already before the review date `2026-10-21`; production correctly returns `CONFLICT` for the expired reservation. |
| Corrected queue/reservation source inspection | PASS | `listPendingClose` uses ordered `limit(limit + 1)` pagination and signed cursor start-after; eligible reservation lookup uses indexed `limit(1)` in preview and review transactions. |
| Authorization/state/security inspection | PASS WITH RELEASE RISK | Active server-loaded actors, role/ownership checks, strict schemas, safe DTOs, transaction re-reads, deterministic side-effect IDs, Origin protection, and client/server separation were confirmed. Production fine configuration and Firestore index deployment remain unperformed release actions. |
| Scope inspection | PASS | The commit’s source, tests, indexes, generated outputs, and task evidence remain within the approved circulation scope. |

## Acceptance checklist

| Criterion | Evidence | Result |
|---|---|---|
| A-1 | Active actor reload plus librarian/member denial tests pass. | `PASS` |
| A-2 | Strict bounded schemas, forged-field rejection, and no-workflow-call validation tests pass. | `PASS` |
| A-3 | Available-copy loan and 30-day due-date emulator assertions pass. | `PASS` |
| A-4 | Source guards and mismatch/expiry/missing-reservation cases are present, but the required emulator test does not reach its valid reserved-loan assertion because its fixed “future” date is stale. | `FAIL` |
| A-5 | Concurrent loan attempts have one winner and leave one `ON_LOAN` copy. | `PASS` |
| A-6 | Database-bounded deterministic queue, signed pagination cursor, safe DTO, and focused query-limit tests pass. | `PASS` |
| A-7 | Ownership, wrong-copy, repeated-report, and no-partial-write cases are covered by the negative emulator suite; the suite’s separate failing fixture prevents a fully green matrix. | `PASS WITH EVIDENCE GAP` |
| A-8 | Returned and lost rejection paths restore `ACTIVE`/`ON_LOAN` without a fine; negative emulator assertions pass. | `PASS` |
| A-9 | Available and damaged return paths are covered by the workflow/concurrency emulator checks. | `PASS` |
| A-10 | Reserved handoff, earliest eligible reservation, 15-day expiry, notification, no-eligible path, and insertion race are implemented/tested; the valid reserved-loan setup is blocked by the stale date fixture. | `PASS WITH EVIDENCE GAP` |
| A-11 | Trusted fixed fine, deterministic ID, duplicate-review protection, and exactly-one-fine assertions pass. | `PASS` |
| A-12 | Concurrent review, reservation insertion, catalog deletion, and catalog status races pass in the negative emulator suite. | `PASS` |
| A-13 | Protected route, explicit confirmation, state messaging, duplicate-action disabling, refresh, and static accessibility contracts pass. Live keyboard review was not performed. | `PASS WITH EVIDENCE GAP` |
| A-14 | Client source/request assertions show no direct Firestore access or client authorization/fine fields. | `PASS` |
| A-15 | Build, lint, format, 80-test regression, and main emulator pass; the required negative emulator gate is not fully green. | `FAIL` |

## Findings

### Finding 1

- Severity: `HIGH`
- Boundary: Verification fixture and emulator release gate
- Reproduction: `tests/circulation-negative-emulator.mjs:49` sets `future` to `2026-02-01T00:00:00.000Z`; at the review date `2026-10-21`, `createLoan` reaches `apps/api/src/storage/workflows.ts:66` and correctly rejects the reservation as expired. The test expects success at line 60, so the first negative-emulator test fails with `StorageError(CONFLICT)`.
- Impact: The required T-4 emulator test is not green and does not verify the valid reserved-copy fulfillment path in the corrected commit. This blocks a complete acceptance verdict even though the rejection behavior is correct.
- Required fix: Make the valid-pickup fixture time-relative (for example, derive expiry from the test’s current clock) or use a controlled test clock consistently, then rerun the entire negative emulator suite and record the result against T-4.
- Verification: `tests/circulation-negative-emulator.mjs` must report 3/3 passing; confirm the reservation becomes `FULFILLED`, the loan is created, and no mismatch/expiry/missing-reservation case regresses.
- Residual risk: Until fixed, reserved-loan success remains unverified against the current clock; no production-code defect was established by this failure.

### Finding 2

- Severity: `MEDIUM`
- Boundary: Production release configuration
- Reproduction: Production fine configuration and Firestore index deployment were not performed in this review. `getLostBookFineMinorUnits()` fails closed when the production variable is absent, and the corrected manifest is validated locally only.
- Impact: A release without the approved `2000` minor-unit configuration will fail closed for lost-book review, and undeployed indexes can still cause production query failures.
- Required fix: Configure the approved fine policy and deploy/validate the index manifest through separate human-approved release actions. Do not place credentials or deployment values in task evidence.
- Verification: Run non-secret configuration presence validation and the approved Firebase index deployment/verification before release.
- Residual risk: No production mutation was attempted; this remains an operational release gate owned by the human approver.

## Resolved prior findings

- The missing immutable implementation target is resolved by commit `ecb254e`.
- The unbounded queue/reservation reads are resolved in source and focused unit tests.
- The previously missing negative/race scenarios and accessibility contracts are present; the remaining failure is the stale date fixture described in Finding 1.

## Verdict

- Result: `FAIL`
- Human decision required: Do not merge or deploy yet. The implementer must correct the time-dependent reserved-loan emulator fixture and rerun the negative emulator gate. Production fine configuration and index deployment remain separate human release decisions.
- Follow-up task: Re-run independent verification from the corrected immutable commit (or a human-approved follow-up commit) after `tests/circulation-negative-emulator.mjs` passes 3/3. No merge, deployment, or residual-risk acceptance was performed.

## Related security artifact

See `workflow/tasks/librarian-loan-closure-review/security-review.md`. This feature has no AI/model/prompt/tool boundary; the security procedure was applied to the server authorization, browser/API, Firestore transaction, evidence, and agent-workflow boundaries.

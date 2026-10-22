# Review Report: librarian-member-account-support

## Review identity

- Specification path and version: `PlanDraft/Specs/LibrarianFeatures/MemberSupport/LibrarianMemberAccountSupport.md`, `0.1-draft`; task-local `spec.md` points to the same draft.
- Task checklist path and version: `workflow/tasks/librarian-member-account-support/tasks.md`, `0.1-draft`.
- Handoff path: `workflow/tasks/librarian-member-account-support/handoff.md`.
- Security artifact reviewed: `workflow/tasks/librarian-member-account-support/security-review.md`; its threat boundaries and required checks were used as review evidence, with the approval-state discrepancy and UI defect recorded here.
- Implementation commit or diff: `f6fe62c8077730835e920b998adffbe0e6796e82` (`feat(librarian): add member account support`), parent `2e8756c`.
- Review branch or worktree: detached clean no-local clone at `/private/tmp/libconnect-member-review.1COGFr`.
- Clean-checkout or separate-worktree exception: `git worktree add` could not update the source repository's read-only `.git` metadata. A separate no-local clone was used. `node_modules` was symlinked into that clone only for dependency resolution; no tracked files were changed.
- Reviewer: Codex review/test agent.
- Skills selected and versions or commits: repository-selected `ai-security-review` procedure, adapted to this authentication-sensitive non-AI workflow.
- Tools and permissions used: read-only specification/source/diff inspection, clean-clone build/test/emulator execution, and review-evidence writes only. No production code, implementation tests, dependencies, deployment, merge, push, or external communication was performed.

## Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Exact commit/status inspection | PASS | Detached at `f6fe62c8077730835e920b998adffbe0e6796e82`; tracked checkout clean before verification. Commit contains the scoped member contracts, storage, routes, client/UI, indexes, tests, generated output, and task evidence. |
| `npm run build` | PASS | TypeScript and Vite build completed. Vite emitted only the existing `%VITE_API_ORIGIN%` substitution warnings. |
| `npm test` in default sandbox | ENVIRONMENT BLOCK | 64 tests passed; eight HTTP-listener suites stalled because sandbox loopback listeners were unavailable. The run was cancelled after the test runner timeout; no product failure was inferred. |
| `npm test` with local-listener access | PASS | 107 tests passed, 0 failed, 0 cancelled. |
| `npm run lint` | PASS | TypeScript no-emit check completed. |
| `npm run format:check` and `git diff --check HEAD^ HEAD` | PASS | No whitespace errors. |
| `npm run test:member-account:emulator` with default Java | ENVIRONMENT BLOCK | Firebase tools rejected the host Java 8 runtime; no test result was inferred. |
| `JAVA_HOME=/usr/local/opt/openjdk@21 ... npm run test:member-account:emulator` | PASS | Firestore emulator ran successfully. Bounded reads, filter-bound cursors, safe transitions, no-op conflicts, target validation, preservation checks, real session destruction, revocation-failure preservation, and concurrent status serialization passed. Firebase emitted only a metadata lookup warning and missing-`lsof` informational warnings. |
| Source/diff/security inspection | FINDINGS | Server-loaded active-librarian checks, strict schemas, transaction reads, safe DTO mapping, Origin/session middleware, no browser Firestore access, and no unrelated feature mutation were confirmed. See Findings 1–2. |

## Acceptance checklist

| Criterion | Evidence | Result |
|---|---|---|
| A-1 | Route and storage checks require the current active server-loaded librarian; signed-out, inactive, and member actors are denied. | `PASS` |
| A-2 | Target IDs are parsed server-side and targets are reloaded and type-checked. | `PASS` |
| A-3 | List queries use database-level `limit + 1`, stable registration-time/document-ID ordering, exact status filtering, and safe DTOs. | `PASS` |
| A-4 | Strict query/body/path schemas reject unknown fields, forged role fields, malformed IDs, invalid statuses, bad cursors, and out-of-range limits. | `PASS` |
| A-5 | Status writes are transactional and limited to `accountStatus` plus `updatedAt`. | `PASS` |
| A-6 | Missing, non-member, no-op, and concurrent transitions produce the intended errors without unintended writes. | `PASS` |
| A-7 | Deactivation performs bounded revocation/retry, preserves inactive state on failure, and the emulator verifies real session destruction. | `PASS` |
| A-8–A-10 | Credentials and circulation/notification documents are preserved; response DTOs omit password, session, role, and raw-record fields. | `PASS` |
| A-11 | Confirmation, loading/empty/error/conflict/success states, and refresh exist, but the client has a rapid duplicate-submit race. | `FAIL` |
| A-12–A-15 | API is server-authorized, Origin protection remains active, browser code uses the API only, and no manager/password/profile/deletion/circulation scope was added. | `PASS` |
| A-16 | Five policy choices are recorded in the implementation report, but the canonical specification, checklist, and handoff still record them as unapproved draft decisions. | `FAIL` |

## Findings

### Finding 1 — BLOCKER: implementation crossed pending human approval gates

- Severity: `BLOCKER`.
- Boundary: specification/checklist/handoff approval to implementation and merge.
- Reproduction: At the reviewed commit, the canonical specification is `0.1-draft` with human approval pending; `tasks.md` and `handoff.md` likewise state `DRAFT`, “Not yet approved,” and that no application-source changes are authorized until the gates are recorded. The same commit changes application source, tests, indexes, package scripts, generated output, and task evidence. The implementation report's statement that the user instruction authorized implementation does not replace the repository-required approval records.
- Impact: The implementation crossed an explicit workflow authorization boundary. Passing tests cannot retroactively approve the specification, task checklist, handoff, implementation disposition, or merge.
- Required fix: A human must record the exact approved specification/checklist/handoff versions and five policy decisions, then separately decide whether to request changes, accept residual risk, or approve the implementation for merge. Do not infer approval from this review or test results.
- Verification: Re-review the approval records and exact implementation snapshot after the human decision.
- Residual risk: Until the records are corrected by a human, the implementation is not eligible for merge under the repository workflow.

### Finding 2 — MEDIUM: rapid duplicate activation/deactivation submits are not synchronously guarded

- Severity: `MEDIUM`.
- Boundary: librarian UI event handling to the status mutation API.
- Reproduction: `changeStatus` at `apps/client/src/pages/LibrarianMemberSupportPage.tsx:79-94` checks `window.confirm`, then calls asynchronous `setPendingUserId` at line 82. It has no synchronous ref/operation guard at function entry. Two rapid clicks or keyboard activations can therefore enter the handler before React re-renders the button as disabled, both pass confirmation, and both call `memberAccountsApi.updateStatus`.
- Impact: The transaction prevents two committed state changes, but the second request can return a conflict and leave the librarian with a misleading mixed success/error state. This violates the explicit duplicate-submit protection requirement in A-11/T-13 and creates avoidable duplicate mutation traffic.
- Required fix: Add a synchronous in-flight guard (for example, a ref keyed by the target user ID, checked and set before confirmation/request) and clear it in `finally`; retain server-side current-state conflict handling as defense in depth. Add an interaction test that two rapid activations produce one network request and one terminal UI result.
- Verification: Exercise two same-target invocations before the first promise resolves and assert exactly one `updateStatus` call; rerun the client/UI and full suites.
- Residual risk: Server transaction/current-state checks prevent an unauthorized or duplicate committed status transition, so this is primarily a correctness and operator-experience issue.

## Verdict

- Result: `FAIL`.
- Human decision required: Human must resolve the pending approval-gate blocker and decide whether to request the duplicate-submit fix and a new review, or explicitly accept that residual risk under the repository process. This report is review evidence, not merge approval.
- Follow-up task: Record human approval artifacts, fix the synchronous duplicate-submit guard with an interaction regression test, rerun the full verification matrix, and submit the resulting exact commit for independent re-review.

## Re-review addendum — 2026-10-22

### Re-review identity

- Reviewed implementation commit: `c2f432aceac841aa8851196992378fd5d2028cc8` (`fix(librarian): guard member status submissions`), based on `f6fe62c`.
- Fresh review checkout: `/private/tmp/libconnect-member-rereview.f7yp9H`, detached no-local clone; tracked files were clean before verification. A dependency symlink was used only for local package resolution.
- Review role: independent reviewer/tester. No production source or implementation test was modified during verification.

### Re-review verification

| Command or inspection | Result | Evidence |
|---|---|---|
| `npm run build` | PASS | TypeScript and Vite build completed; only existing `%VITE_API_ORIGIN%` substitution warnings were emitted. |
| `npm test` with local-listener access | PASS | 108 tests passed, 0 failed, 0 cancelled, including the new submission-guard test. |
| `npm run lint` | PASS | TypeScript no-emit check completed. |
| `npm run format:check` and `git diff --check HEAD^ HEAD` | PASS | No whitespace errors. |
| `JAVA_HOME=/usr/local/opt/openjdk@21 ... npm run test:member-account:emulator` | PASS | Firestore emulator completed successfully; bounded reads, status transitions, preservation, revocation, failure handling, and concurrency checks passed. Only non-fatal metadata and missing-`lsof` warnings were emitted. |
| Guard source/test inspection | PASS | `createMemberStatusSubmissionGuard()` acquires synchronously before confirmation, rejects competing IDs, releases on cancellation, and releases in `finally`; focused test covers duplicate and competing acquisitions. |
| Approval/evidence inspection | FINDINGS | Canonical spec, checklist, and handoff still state `DRAFT`/“Not yet approved”; the implementation commit also adds the prior reviewer report as a tracked file. |

### Prior finding disposition

- Finding 1 (pending human approval gates): **UNRESOLVED**. The reviewed tree still contains the same explicit pending approval records, so implementation and merge authorization remain blocked.
- Finding 2 (duplicate status submissions): **RESOLVED** in code. The synchronous guard and focused regression test are present and passed.

### Finding 3 — BLOCKER: reviewer evidence was folded into the implementation commit

- Severity: `BLOCKER` for workflow/evidence integrity.
- Boundary: independent implementation/review separation.
- Reproduction: `c2f432a` adds `workflow/tasks/librarian-member-account-support/review-report.md` as part of the implementer’s fix commit. The file identifies the prior implementation commit `f6fe62c` and records the prior independent verdict, rather than being authored in a separate reviewer evidence change.
- Impact: The implementation snapshot contains reviewer-authored evidence and a stale verdict, weakening provenance and making it impossible to treat the commit as a clean implementation-only handoff. This conflicts with the workflow rule that review-only artifacts must not be silently folded into the implementation commit.
- Required fix: A human must decide the evidence disposition. The implementation branch should contain only implementation changes; reviewer evidence should be added or updated in a separate review-only commit or otherwise have its provenance explicitly corrected. Do not use the embedded stale report as approval.
- Verification: Inspect the corrected commit/diff boundary and perform another independent review from the resulting exact implementation snapshot.
- Residual risk: The production code is unaffected by this finding, but the task cannot be marked ready while the approval and evidence provenance gates remain unresolved.

## Re-review verdict

- Result: `FAIL`.
- Human decision required: The duplicate-submit defect is fixed and all rerun checks pass, but a human must record the specification/checklist/handoff approvals and resolve the embedded reviewer-evidence provenance issue before deciding whether to merge or request another review.
- Follow-up task: Correct the approval/evidence records, preserve the reviewer report as separate evidence, and submit the resulting exact snapshot for final review.

## Final re-review addendum — 2026-10-22

### Final re-review identity

- Reviewed final snapshot: `e8c02aa980818b30c25a683c08b11305737715ab`, including implementation fix `3a4b6cc`, separate review evidence commit `ea10ee1`, and approval-record commit `e8c02aa`.
- Fresh review checkout: `/private/tmp/libconnect-member-finalreview.Tqf4VT`, detached no-local clone; tracked files were clean before verification. The calling worktree had an unrelated user modification in `docs/DeveloperGuide.md`, which was not included in the review checkout or changed.
- Review role: independent reviewer/tester. No production source or implementation test was modified during verification.

### Final verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Exact snapshot and commit-boundary inspection | PASS | Implementation, review evidence, and approval records are in separate commits; the implementation commit no longer contains `review-report.md`. |
| `npm test` with local-listener access | PASS | 108 tests passed, 0 failed, 0 cancelled. |
| `npm run lint` | PASS | TypeScript no-emit check completed. |
| `npm run format:check` and `git diff --check HEAD^ HEAD` | PASS | No whitespace errors. |
| `JAVA_HOME=/usr/local/opt/openjdk@21 ... npm run test:member-account:emulator` | PASS | Firestore emulator completed successfully; member reads, authorization, status transitions, preservation, revocation, failure handling, and concurrency checks passed. Only non-fatal metadata and missing-`lsof` warnings were emitted. |
| Final authorization/evidence inspection | FINDING | Approval headers are updated to `APPROVED`, but stale contradictory approval language remains in the canonical spec and handoff. |

### Prior finding disposition

- Duplicate-submit guard: **RESOLVED** and verified by focused test and full suite.
- Reviewer-evidence provenance: **RESOLVED**; `review-report.md` is now in separate commit `ea10ee1` rather than the implementation commit.
- Pending approval gate: **SUBSTANTIALLY RESOLVED**, but the artifacts are internally inconsistent as described below.

### Finding 4 — MEDIUM: approval artifacts retain contradictory stale gate text

- Severity: `MEDIUM` for workflow/evidence integrity; release-blocking under the repository rule that reviewers stop on stale or contradictory handoffs.
- Boundary: approved specification/checklist/handoff to implementation and merge decision.
- Reproduction: The canonical specification header is `0.1-approved`/`APPROVED`, but its “Open decisions requiring human approval,” “No application source ... is authorized by this draft,” and amendment line “Human approval is pending” remain unchanged. The handoff header is `APPROVED`, but its receiving-agent acknowledgement still says `Agent: Not assigned`, `Spec and handoff read: NO`, and `Blocking clarification required: Yes — human approval ... is required`. The task-local spec similarly retains “No application-source changes are authorized by this draft.”
- Impact: A reviewer cannot determine from the artifacts alone whether the five policy decisions and receiving-agent gate are closed. This conflicts with the workflow rule requiring the reviewer to stop when the handoff is stale, contradictory, or ambiguous, even though the approval commit records human approval at the top of the files.
- Required fix: Add a dated approval amendment that records the five decisions and closes the open-decision section; update stale draft wording and the handoff receiving-agent acknowledgement to the actual reviewer/date with `Spec and handoff read: YES` and no blocking clarification. Keep merge/release approval as a separate human gate.
- Verification: Inspect the corrected canonical spec, task-local spec, checklist, and handoff, then perform a final evidence-only review. No production code change is required for this finding.
- Residual risk: The implementation and tests are technically sound; the remaining risk is that contradictory evidence could cause an unauthorized or unreproducible workflow decision.

## Final re-review verdict

- Result: `FAIL`.
- Human decision required: The implementation defect is fixed, approval and review commits are separated, and all verification passes. A human must still correct the contradictory approval artifacts before the task can be considered merge-ready; this report is not merge approval.
- Follow-up task: Normalize the approved specification/handoff evidence and request a final evidence-only review or human merge decision according to the repository workflow.

## Latest re-review addendum — 2026-10-22

### Review identity

- Reviewed snapshot: `5f5d895af5f0ed332a0892acb33981181601cc2c` (`docs(workflow): reconcile approval artifact language`).
- Fresh review checkout: `/private/tmp/libconnect-member-rereview.jAfIrJ`, no-local clone with tracked files clean before verification. The dependency symlink was untracked review infrastructure only.
- Commit boundary: implementation `3a4b6cc113329c062357df01e92442fe9443f882`, independent review evidence `ea10ee12a9c6e118c3b32958c444e6d68a87bd3e`, approval-language update `5f5d895af5f0ed332a0892acb33981181601cc2c`. The implementation commit does not contain `review-report.md`.
- Review role: independent reviewer/tester. No production source or implementation test was modified during verification.

### Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Exact snapshot, clean checkout, and commit-boundary inspection | PASS | The latest documentation commit is separate from implementation and review evidence; no tracked changes were present in the clean checkout. |
| `npm test` with local-listener access | PASS | 108 tests passed, 0 failed, 0 cancelled. |
| `npm run lint` | PASS | TypeScript no-emit check completed. |
| `npm run format:check` and `git diff --check HEAD^ HEAD` | PASS | No whitespace errors. |
| `JAVA_HOME=/usr/local/opt/openjdk@21 ... npm run test:member-account:emulator` | PASS | Firestore emulator completed successfully; bounded reads, authorization, transitions, preservation, revocation, failure handling, and concurrency checks passed. Only non-fatal metadata and missing-`lsof` warnings were emitted. |
| Manual authorization/state/scope inspection | PASS | Active server-loaded librarian checks, strict schemas, transaction re-reads, safe DTOs, Origin/session protection, no browser Firestore access, and no out-of-scope production behavior were confirmed. |
| Approval and security-evidence inspection | FINDING | The approval headers and handoff acknowledgement are now consistent, but `security-review.md` still records resolved decisions as open and the canonical no-JavaScript decision retains an unchosen alternative. |

### Prior finding disposition

- Duplicate-submit guard: **RESOLVED**.
- Reviewer-evidence provenance: **RESOLVED**; review evidence remains separate from the implementation commit.
- Stale approval headers and handoff acknowledgement: **RESOLVED** by `5f5d895`.

### Finding 5 — MEDIUM: security evidence and one approved decision remain stale/ambiguous

- Severity: `MEDIUM` for workflow/evidence integrity; blocking for final evidence acceptance until normalized.
- Boundary: approved policy record and security-review evidence.
- Reproduction: `workflow/tasks/librarian-member-account-support/security-review.md` still says the actor scope, safe fields, session-failure policy, no-JavaScript choice, and inherited side effects “remain open,” and its residual-risk entries still say those decisions require human approval. The canonical specification labels the five decisions approved but item 4 still says JSON/React-only delivery is approved “or” a standard form may be required, leaving the selected alternative unclear.
- Impact: The code and tests implement the JSON/React-only choice and the other resolved policies, but the retained security artifact and canonical decision text do not provide one unambiguous policy record. A later reviewer could incorrectly treat the feature as unauthorized or infer an alternative delivery contract.
- Required fix: Add a dated amendment to `security-review.md` marking the five decisions resolved and retaining only the actual residual risks; revise canonical decision 4 to explicitly select JSON/React-only delivery (or record a separately approved standard-form choice). Re-run an evidence-only review after the documentation is normalized.
- Verification: Inspect the canonical specification, task spec, checklist, handoff, security review, and implementation report together; confirm that all approval and residual-risk statements agree and that no production files changed.
- Residual risk: No application security defect was found in this snapshot. The remaining risk is inaccurate or ambiguous evidence leading to an unreproducible authorization or merge decision.

## Latest re-review verdict

- Result: `FAIL`.
- Human decision required: The implementation and all required tests pass, and the prior approval/provenance findings are fixed. A human must still normalize the stale security review and explicitly close the no-JavaScript policy choice before final merge consideration. This report is not merge approval.
- Follow-up task: Correct the two evidence artifacts and request a final evidence-only review or human merge decision according to the repository workflow.

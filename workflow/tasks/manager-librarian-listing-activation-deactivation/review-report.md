# Review Report: manager-librarian-listing-activation-deactivation

## Review identity

- Specification path and version: `PlanDraft/Specs/LibrarianFeatures/ManagerFeatures/LibrarianAccountManagement.md`; the pre-implementation baseline is the eight-criterion version at parent commit `283c10c35ee47b9b2c70b69cfb3e151b2a51b776`. Commit `b717dd65cd1b3c0c340b764cb378bae8a372a6cf` rewrites this canonical specification in the implementation commit, so the current file cannot be treated as independently approved.
- Task checklist path and version: missing; no manager task checklist exists under `workflow/tasks/`.
- Handoff path: missing; no manager handoff exists under `workflow/tasks/`.
- Implementation commit or diff: `b717dd65cd1b3c0c340b764cb378bae8a372a6cf` (`feat(manager): add librarian account management`), parent `283c10c35ee47b9b2c70b69cfb3e151b2a51b776`.
- Review branch or worktree: `/Users/camelliaaa/Desktop/NUS/Courses/Y4S1/CS3227/CS3227-2610-MP3`, branch `jiali-librarian`; the checkout was clean at review start.
- Clean-checkout or separate-worktree exception: no exception at review start. An unrelated Reset Librarian Password specification edit and untracked password-reset task artifacts appeared during the review; they were preserved and are not part of the reviewed commit.
- Reviewer: Codex review/test agent.
- Skills selected and versions or commits: repository `reviewer-tester` procedure; local `ai-security-review` skill from `.agents/skills/ai-security-review/SKILL.md`.
- Tools and permissions used: read-only Git/source inspection, local build/test commands, and the repository’s local HTTP integration tests. The full test suite was rerun with narrowly scoped local-network permission because sandboxed execution cannot bind temporary servers to `127.0.0.1`. The follow-up fix updated only the manager source, generated output, tests, package script, and developer documentation; unrelated password-reset changes were preserved.
- Review update: per the user’s explicit direction, missing manager task artifacts are not part of this fix. Requirements for the implementation changes below were taken from `Overview.md` and `PLAN.md`; form and registration-time findings that exist only in the implementation-time spec rewrite are not treated as requirements.

## Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Initial `git status --short --branch` | PASS | Clean `jiali-librarian` checkout at review start. |
| `git show --stat --summary b717dd6` and exact parent diff | PASS | Reviewed the exact implementation commit and all 41 changed paths. |
| `npm run build` | PASS | TypeScript and Vite build completed successfully. |
| `npm test` in the sandbox | BLOCKED | Route tests could not bind temporary HTTP servers; the process hung until interrupted because local listen returned `EPERM`. |
| `npm test` with local-network permission | PASS | 34 tests passed, 0 failed, 0 cancelled. |
| `npm run test:coverage` with local-network permission | PASS | 34 tests passed; Node enforced 50% lines, 70% branches, and 45% functions and emitted the coverage report. |
| `npm run lint` | PASS | TypeScript project check completed. |
| `npm run format:check` | PASS | Working-tree whitespace check completed. |
| `CI=1 npm run test:manager:emulator` | BLOCKED BY ENVIRONMENT | Firebase CLI reached emulator startup but the host only provides Java 17; the current Firebase CLI requires Java 21+. |
| `git diff b717dd6^ b717dd6 --check` | PASS | No whitespace errors. |
| Client/server boundary inspection | PASS | No direct Firestore import or protected write path was found in `apps/client`; manager writes go through the Express route. Pure client transition tests cover confirmation text, success text, status toggling, and self-deactivation routing decision. |
| Workflow artifact inspection | OUT OF SCOPE | The user explicitly directed this review to ignore missing manager task artifacts. The implementation-time spec rewrite remains recorded but is not used as the requirement baseline. |

## Acceptance checklist

| Criterion | Evidence | Result |
|---|---|---|
| Manager can list librarian accounts and statuses | `apps/api/src/routes/manager.ts:36-39`, `tests/manager-routes.test.mjs` | `PASS` |
| Manager can activate/deactivate librarian accounts | `apps/api/src/storage/accounts.ts:70-98`, policy and route tests | `PASS` |
| Confirmation names target and resulting status | `apps/client/src/pages/ManagerLibrarianAccountsPage.tsx:35-39` | `PASS` (client test coverage is incomplete) |
| List requires an active server-loaded manager | `apps/api/src/http/auth.ts:4-20`, `apps/api/src/routes/manager.ts:34-38`, route tests | `PASS` |
| Status route accepts only the desired status | strict Zod schema at `apps/api/src/routes/manager.ts:7-8`, route test | `PASS` |
| Client actor/target fields cannot grant access | server actor lookup plus strict request schema; forged-field test | `PASS` |
| Registration cannot grant manager privilege | `apps/api/src/routes/auth.ts` strict schema, `apps/api/src/storage/accounts.ts:41-45`, and concrete bootstrap/recovery procedure in `docs/DeveloperGuide.md` | `PASS` |
| Last active manager is protected in one transaction | `apps/api/src/storage/accounts.ts:74-95`, serialized concurrent policy test | `PASS` |
| Missing and non-librarian targets do not change state | explicit service branches at `apps/api/src/storage/accounts.ts:83-87`, policy and route tests | `PASS` |
| No-op status is rejected before update | `apps/api/src/storage/accounts.ts:88-94`; policy test covers the no-op status | `PASS` |
| Deactivation revokes target sessions | `apps/api/src/storage/accounts.ts:96-112`, retry/follow-up protected-request policy test | `PASS` |
| Error contract is preserved | `apiErrorHandler` mapping plus route tests for `400`, `401`, `403`, `404`, and `409` | `PASS` |
| Responses omit password hashes and sessions | `safeLibrarianAccount` at `apps/api/src/routes/manager.ts:19-30`; policy test checks hash omission | `PASS` |
| Origin protection and server-only Firestore access remain intact | global origin middleware in `apps/api/src/server.ts:42-47`, origin tests, client boundary scan | `PASS` |

## Findings

### Finding 1 — disposition

- Severity: `OUT OF SCOPE BY USER DIRECTION`
- Boundary: Specification approval, task handoff, and independent-review workflow.
- Reproduction: `workflow/tasks/` contains no task directory for this feature. The implementation commit changes the canonical manager specification by 231 lines, including new API, transaction, form, and testing requirements, without a separate approved spec revision, task checklist, handoff, or implementation report.
- Impact: The workflow evidence remains incomplete, but it is explicitly excluded from this requested fix.
- Required fix: None for this user-directed implementation pass.
- Verification: Requirements and scope for the fixes were checked against `Overview.md` and `PLAN.md`.
- Residual risk: The repository workflow still requires human-owned task evidence before a normal merge decision.

### Finding 2 — resolved

- Severity: `RESOLVED`
- Boundary: Authorization/state-transition verification.
- Reproduction: The implementation tests cover a member, a manager, forged fields, activation through a test double, deactivation session-destroy invocation, no-op handling, and one last-manager conflict. They do not cover inactive managers, active non-manager librarians, missing targets, non-librarian targets, malformed status input, a destroyed session making a subsequent protected request, concurrent last-manager deactivations, or the client confirmation/success/failure/self-deactivation flows required by the specification.
- Impact: The previously unverified manager denial, target-validation, serialized race, session-denial, and session-store failure paths are now covered by focused tests.
- Required fix: Completed in `tests/account-manager-policy.test.mjs` and `tests/manager-routes.test.mjs`.
- Verification: `npm test` and `npm run test:coverage` both pass 34/34 tests with the configured coverage gates.
- Residual risk: The emulator-backed concurrency check is implemented but could not run on this host until Java 21+ is installed; the transaction-serializing unit test still passes.

### Finding 3 — resolved

- Severity: `RESOLVED`
- Boundary: Manager bootstrap and recovery operations.
- Reproduction: `docs/DeveloperGuide.md` says the bootstrap and emergency recovery procedure “must be documented before production deployment,” but does not document the concrete procedure. The only normal route prevents deactivation of the last active manager.
- Impact: The developer guide now provides an out-of-band bootstrap and recovery procedure that does not weaken the public manager invariant.
- Required fix: Completed in `docs/DeveloperGuide.md`.
- Verification: The procedure requires separate production credentials, excludes secrets from evidence, requires identity/incident approval, and forbids client-controlled privilege changes.
- Residual risk: Recovery remains an operational responsibility and still requires human approval and protected operator access.

### Finding 4 — disposition

- Severity: `OUT OF SCOPE BY REQUIREMENT BASELINE`
- Boundary: Progressive-enhancement HTTP contract.
- Reproduction: `express.urlencoded` accepts form bodies, and the manager PATCH route parses them, but `apps/api/src/routes/manager.ts:41-45` always returns JSON. The current committed specification says an accepted form submission must return a server-rendered success or error response; no HTML form route or test exists.
- Impact: None against the requested baseline; neither `Overview.md` nor `PLAN.md` requires a manager status form response.
- Required fix: None for this task.
- Verification: The implementation continues to use the existing JSON API and Origin/server authorization boundaries.
- Residual risk: Any future no-JavaScript manager form is a separate requirement and must be specified before implementation.

### Finding 5 — disposition

- Severity: `OUT OF SCOPE BY REQUIREMENT BASELINE`
- Boundary: Manager list user experience and specification traceability.
- Reproduction: The current committed specification requires the list to display registration time, but the manager table renders only librarian, employee ID, status, and action columns at `apps/client/src/pages/ManagerLibrarianAccountsPage.tsx:77-89`. The API returns `registrationDateTime`, but the UI does not display it.
- Impact: None against the requested baseline; `Overview.md` and `PLAN.md` require listing/status administration, not a particular registration-time table column.
- Required fix: None for this task.
- Verification: The manager API still returns safe account data and the UI displays the account identity, employee ID, manager marker, and current status.
- Residual risk: Registration-time presentation can be added only through a separately approved requirement.

### Finding 6 — mitigated residual risk

- Severity: `RESIDUAL-RISK`
- Boundary: Transaction commit to session-store revocation.
- Reproduction: `apps/api/src/storage/accounts.ts` commits the Firestore status transaction and then awaits `destroyForUser`. If session deletion fails, the request returns a generic error after the account has already become inactive and session documents may remain.
- Impact: The operation remains non-atomic across Firestore and the session store, but protected requests reload the now-inactive account and are denied. Transient session-store failures are retried three times; persistent failure returns a generic error after the safe inactive state is committed.
- Required fix: Completed mitigation in `apps/api/src/storage/accounts.ts` and `apps/api/src/storage/firestore-session-store.ts`; tests cover transient retry, persistent failure, and durable-job enqueue behavior.
- Verification: `tests/account-manager-policy.test.mjs` verifies retries, inactive-account denial, no rollback of the authorization change, and enqueueing after persistent failure. The server starts a bounded-backoff worker that deletes the job only after cleanup succeeds.
- Residual risk: Firestore account updates and session-store deletion remain separate systems; a failed enqueue or unavailable worker still requires operational monitoring.

## Verdict

- Result: `PASS WITH RESIDUAL RISK`
- Human decision required: Human merge approval remains required. The residual session-store failure behavior and the user-directed exclusion of workflow artifacts should be acknowledged.
- Follow-up task: Consider emulator-backed concurrency and session-store fault tests, plus any separately approved manager form or registration-time UI requirements.

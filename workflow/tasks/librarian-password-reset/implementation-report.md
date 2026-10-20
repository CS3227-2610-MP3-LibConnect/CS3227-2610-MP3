# Implementation Report: librarian-password-reset

## Inputs

- Specification path and version: `PlanDraft/Specs/LibrarianFeatures/ManagerFeatures/ResetLibrarianPassword.md` (`0.2-approved`)
- Task checklist path and version: `workflow/tasks/librarian-password-reset/tasks.md` (`0.1-approved`)
- Handoff path: `workflow/tasks/librarian-password-reset/handoff.md`
- Implementation commits: `8f85d40` (`feat(manager): add librarian password reset flow`), `aec9645` (`fix(manager): allow same-origin native password forms`), and `aac65d8` (`fix(manager): configure explicit API origin for forms`).
- Branch or worktree: `jiali-librarian` working tree.
- Skills selected and versions or commits: `sdd-apply`; repository-required `ai-security-review` procedure for the authentication/manager boundary.
- Tools and permissions used: local file inspection/editing, repository build/test commands, and approved ephemeral localhost binding for HTTP integration tests. All implementation commits were created with human approval; no external service, push, deploy, or merge was performed.

## Changes

| File or directory | Purpose |
|---|---|
| `apps/api/src/routes/manager.ts` | Strict reset API contract, manager/self-target checks, native form GET/POST rendering, and safe error handling. |
| `apps/api/src/http/origin-protection.ts` | Accepts the explicitly configured API origin for browser forms while retaining configured client-origin protection. |
| `apps/api/src/server.ts` | Validates the externally visible `API_ORIGIN` and requires it in production before enabling Origin protection. |
| `apps/api/src/storage/accounts.ts` | Argon2id reset operation, transactional target validation, limited field update, and post-commit session revocation. |
| `apps/client/src/api/manager.ts` | JSON reset API call and native-form URL helper. |
| `apps/client/src/pages/ManagerLibrarianAccountsPage.tsx` | Manager reset action, explicit confirmation, pending/error/success states, password clearing, and list refresh. |
| `apps/client/src/pages/manager-account-actions.ts`, `apps/client/src/styles.css` | Reset-flow copy/helpers and accessible form/action styling. |
| `tests/auth-routes.test.mjs` | Existing native authentication forms now exercise the configured API origin under the same Origin boundary. |
| `tests/manager-routes.test.mjs` | Route, authorization, Origin, safe-response, and browser-faithful HTTPS-termination native-form coverage. |
| `tests/account-manager-policy.test.mjs` | Hashing, field preservation, target policy, session revocation, retry, and session-store coverage. |
| `tests/manager-ui.test.mjs` | Client guard, self-target, confirmation, and request-body coverage. |
| `dist/` | Build-generated JavaScript, declarations, and source maps for verification. |
| `docs/authentication-and-sessions.md` | Documents the `API_ORIGIN` deployment setting used by server-side Origin protection. |
| `workflow/tasks/librarian-password-reset/tasks.md` | Ordered task completion and dated evidence amendments. |
| `workflow/tasks/librarian-password-reset/security-review.md` | Verified security controls and residual risk. |
| `logs/librarian-password-reset/02.md` | Factual implementation execution log. |

## Verification

| Command | Result | Notes |
|---|---|---|
| `npm run build` | PASS | TypeScript compilation and client production build completed, including the Origin middleware fix. |
| `node --test tests/manager-routes.test.mjs tests/origin-protection.test.mjs` | PASS | 17/17 focused tests passed, including API-origin native-form success, validation, authorization, and service-failure cases. Local HTTP tests used approved ephemeral localhost binding. |
| `node --test tests/active-actor.test.mjs tests/account-manager-policy.test.mjs tests/auth-routes.test.mjs tests/client-auth.test.mjs tests/manager-routes.test.mjs tests/manager-ui.test.mjs tests/no-javascript-auth.test.mjs tests/origin-protection.test.mjs` | PASS | 50/50 tests passed; local HTTP tests used approved ephemeral localhost binding. |
| `npm test` | PASS | Build plus the repository test matrix passed 50/50. |
| HTTPS-termination simulation | PASS | Configured `https://api.example.test` API origin accepted form success, validation, authorization, and service-failure requests with forwarded-proxy headers; attacker and missing origins remained rejected. |
| `git diff --check` | PASS | No whitespace errors in the working-tree diff. |
| `git diff --cached --check` | PASS | No whitespace errors in the staged check. |
| Credential-pattern/evidence scan | PASS | No credential patterns or plaintext test-password values found in task evidence or the diff. |

## Review fixes

- Finding 1: The second review fix removes Host/protocol inference from Origin authorization. The server validates an explicit `API_ORIGIN` and requires it in production; browser-faithful tests simulate HTTPS termination with `Origin`, `Host`, and `X-Forwarded-Proto` while retaining attacker and missing-Origin rejection.
- Finding 2: This report records the original implementation commit `8f85d40`, first review-fix commit `aec9645`, and second review-fix commit `aac65d8` accurately.

## Security and behavior checks

- Authorization enforced by: server-loaded session actor, active status, librarian role, manager privilege, strict request schema, server-loaded target, and self-target denial.
- Ownership or manager checks: only an active librarian manager may reset a different librarian; client role, actor, target-object, status, and confirmation fields are ignored as authorization inputs or rejected as unknown fields.
- State transitions and transaction boundaries: password is Argon2id-hashed before the Firestore transaction; the transaction re-reads the target and updates only password storage plus `updatedAt`; session revocation occurs after commit with bounded retries and the existing retry-job fallback.
- Sensitive fields excluded from responses and logs: safe account serialization excludes password hashes; native JSON/HTML responses and error handling do not expose passwords, hashes, cookies, or session identifiers; evidence scans were clean.
- Negative/adversarial cases covered: signed-out, inactive, member, non-manager, forged-role/target/confirmation, self-target, malformed/unknown fields, missing/non-librarian target, Origin failure, password policy mismatch, stale sessions, transient/persistent session-store failure, and no-JavaScript form errors.

## Deviations and unresolved risks

- Deviations from the approved specification: None.
- Unresolved risks: Password update and session revocation are sequential storage operations. If bounded deletion retries and the queued job both remain unavailable, stale sessions may persist temporarily after the password changes; this is the approved residual risk.
- Follow-up task required: Independent review/tester verification and human merge/residual-risk decision remain required. No merge, deploy, or reviewer approval is claimed.

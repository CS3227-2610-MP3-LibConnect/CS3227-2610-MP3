# Review Report: librarian-password-reset

> Re-review update: the latest `Re-review 4 — 2026-10-20` section below supersedes the earlier verdicts and records verification through fix commit `ca06f8e`.

## Review identity

- Specification path and version: `PlanDraft/Specs/LibrarianFeatures/ManagerFeatures/ResetLibrarianPassword.md` (`0.2-approved`)
- Task checklist path and version: `workflow/tasks/librarian-password-reset/tasks.md` (`0.1-approved`)
- Handoff path: `workflow/tasks/librarian-password-reset/handoff.md`
- Implementation commit or diff: `8f85d40d4672050f0a900e2f955788bbf76e907f` (`feat(manager): add librarian password reset flow`), parent `4674484ae49e0962c1d5e62b1793ab6ce83268db`
- Review branch or worktree: clean source snapshot at `/private/tmp/librarian-password-reset-review`, exported from the exact implementation commit
- Clean-checkout or separate-worktree exception: Git worktree registration was unavailable because repository `.git` metadata is read-only. A clean `git archive` snapshot of `8f85d40` was used instead; the original checkout was used only for read-only commit and diff inspection. The snapshot had no source changes before verification.
- Reviewer: Codex review and test agent
- Skills selected and versions or commits: repository-required `ai-security-review` procedure; AI-specific runtime threats are not applicable because this feature adds no model, prompt, retrieval, tool, or external egress.
- Tools and permissions used: repository read-only inspection, clean-snapshot build/tests, approved ephemeral localhost integration testing, and writes limited to this review report and factual execution log. No production source, dependency, deployment, push, merge, or destructive action was performed.

## Verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Read `AGENTS.md`, `workflow/README.md`, reviewer procedure, approved spec, checklist, handoff, implementation report, and security review | PASS | Scope, approvals, security contract, and required verification were independently inspected. |
| `git show --stat 8f85d40` and changed-file scope inspection | PASS | The implementation commit contains the expected manager route/storage/client/test/generated-output files only; no unrelated production feature was found. |
| `git diff --check 8f85d40^ 8f85d40` | PASS | No whitespace errors. |
| `npm test` in the clean snapshot with approved ephemeral localhost binding | PASS | Build completed and all 48/48 required tests passed. A sandbox-only run could not bind the test servers and was cancelled; the escalated rerun completed successfully. |
| `node --test tests/manager-routes.test.mjs` in the clean snapshot | PASS | All 11 manager route tests passed. |
| Source inspection of authorization, transaction, hashing, session revocation, safe serialization, client API/UI, Origin protection, and changed tests | PASS with finding | Server authorization and secret boundaries are present; the native-form Origin boundary is incorrect (Finding 1). |
| Browser-faithful native-form probe: GET the form on the API origin, then POST with that API origin in `Origin` | FAIL | Form GET returned 200, but the form POST returned 403 `The request origin is not allowed.` before the manager route ran (Finding 1). |
| Evidence provenance inspection | FAIL with finding | `implementation-report.md` says the implementation is uncommitted, while `8f85d40` is the exact implementation commit and `aa18a33` records the evidence (Finding 2). |

## Acceptance checklist

| Criterion | Evidence | Result |
|---|---|---|
| 1. Active manager can reset a different listed librarian | Server route, storage tests, and client flow cover manager authorization and a different target. | `PASS` |
| 2. Required JSON/form endpoint and safe success contract | `POST /api/v1/manager/librarians/:userId/password`, strict body, safe JSON serializer, and HTML renderer are present. | `PASS` |
| 3. JSON accepts only password fields and bounded path target | Strict Zod schema, path validation, and forged-field tests pass. | `PASS` |
| 4. Password policy and exact confirmation | Route/storage validation and negative tests cover minimum, maximum, whitespace, and mismatch cases. | `PASS` |
| 5. Argon2id hashing and no plaintext/hash response | Hashing occurs before the transaction; safe serializer removes `passwordHash`; response tests pass. | `PASS` |
| 6. New/old authentication behavior and inactive-target behavior | Storage tests verify new-password success, old-password rejection, and preserved inactive status. | `PASS` |
| 7. Only password hash and approved metadata change | Transaction updates `passwordHash` and `updatedAt`; field-preservation tests pass. | `PASS` |
| 8. Post-commit session revocation and approved failure behavior | Multiple-session deletion, bounded retry, generic error, and revocation-job tests pass. | `PASS WITH RESIDUAL RISK` |
| 9. Origin protection and no direct browser Firestore access | Client calls the API and client-origin JSON requests are protected, but the standard form uses the wrong Origin boundary. | `FAIL` |
| 10. Stale manager page cannot bypass server authorization | Active actor is loaded by server middleware and target is re-read in the storage transaction. | `PASS` |
| 11. Required manager/member/inactive/signed-out/target denials | Route and storage denial tests pass for the listed cases. | `PASS` |
| 12. Safe errors and no false success | JSON and masked form-error tests pass; browser-faithful native form requests are rejected before the form error renderer. | `FAIL` |
| 13. Accessible explicit confirmation and duplicate-submit protection | Client UI includes target-specific confirmation, pending state, clearing, and list refresh logic. | `PASS` |
| 14. Standard no-JavaScript form completes the same operation | The implementation renders a form, but a browser-origin POST is rejected by Origin protection. | `FAIL` |
| 15. No password values in UI responses after submission/failure | Rendered response tests and client clearing logic pass; no submitted values are repopulated. | `PASS` |
| 16. Existing regression/build/session/Origin tests remain passing | Clean-snapshot `npm test` passed 48/48 with the approved localhost test execution. | `PASS` |

## Findings

The implementation security review at `workflow/tasks/librarian-password-reset/security-review.md` was inspected. Its S1-S4 controls are supported by the code and passing tests where exercised; Finding 1 below is a separate Origin/progressive-enhancement failure not covered by that artifact.

### Finding 1

- Severity: `HIGH`
- Boundary: API-origin native form submission to the server-wide Origin protection middleware.
- Reproduction: `resetLibrarianPasswordFormUrl` points the manager browser to the API origin (`apps/client/src/api/manager.ts:30-32`). The server-rendered form posts back to that API-origin URL (`apps/api/src/routes/manager.ts:67-74`). A browser submitting that form sends the API origin in `Origin`; `originProtection` accepts only the configured client origin (`apps/api/src/http/origin-protection.ts:26-28`). The independent probe observed GET `200`, then POST `403` with `The request origin is not allowed.` before the HTML-form error handler could run.
- Impact: The explicitly approved no-JavaScript password-reset path cannot complete, and the browser does not receive the intended server-rendered success or validation/service response. This is a required acceptance criterion and a release-gate failure, although it does not create an authorization bypass.
- Required fix: Preserve CSRF/Origin protection while making the actual form origin an explicitly trusted origin, or serve the form from the configured client origin. Add an integration test that obtains the form at its real origin and submits with the browser-faithful Origin value; cover success, validation failure, authorization failure, and service failure without forcing the client Origin on an API-origin form POST.
- Verification: Re-run the full required matrix and the browser-faithful probe; the probe must reach the form route and return the expected HTML result rather than a pre-route 403.
- Residual risk: None should be accepted for this criterion; the native form must either work under the approved Origin policy or the approved specification must be amended by a human.

### Finding 2

- Severity: `LOW`
- Boundary: Workflow evidence and commit provenance.
- Reproduction: `workflow/tasks/librarian-password-reset/implementation-report.md` records `Implementation commit: None` and says the changes remain uncommitted, but the exact implementation is committed as `8f85d40` and the following evidence commit is `aa18a33`.
- Impact: Review provenance is inaccurate and makes the implementation report non-reproducible as written. It does not affect runtime authorization or password handling.
- Required fix: Have the implementer correct the implementation report to identify `8f85d40` and the actual branch/worktree state, then preserve the corrected report as workflow evidence. Do not rewrite history or claim reviewer approval.
- Verification: Compare the corrected report with `git show --stat 8f85d40` and `git status` at the handoff point.
- Residual risk: Documentation-only; merge should not proceed with contradictory evidence.

## Verdict

- Result: `FAIL`
- Human decision required: Request the implementation fix for Finding 1, require the evidence correction in Finding 2, and then decide whether to merge after a fresh independent verification. This report does not approve the merge or accept the failed no-JavaScript criterion.
- Follow-up task: Correct the native-form Origin flow and add the browser-faithful regression coverage; update implementation evidence and rerun the required 48-test matrix.

## Re-review — 2026-10-20

### Updated review identity

- Reviewed implementation: original `8f85d40d4672050f0a900e2f955788bbf76e907f` plus fix `aec9645b4a43068c901a0416e22b91e67407275` (`fix(manager): allow same-origin native password forms`).
- Updated evidence commit: `53bc6b4` (`docs(workflow): record librarian password reset review`).
- Fresh clean snapshot: `/private/tmp/librarian-password-reset-review-fix`, exported from `aec9645`; no source changes were present before testing.
- Worktree exception remains: native Git worktree registration is unavailable because repository `.git` metadata is read-only.

### Updated verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Inspect `aec9645` diff and changed-file scope | PASS | Fix is limited to Origin handling, generated output, and focused route/Origin tests. |
| `npm test` in the fresh clean snapshot with approved ephemeral localhost binding | PASS | Build completed and all 50/50 required tests passed. |
| `git diff --check 8f85d40 aec9645` | PASS | No whitespace errors in the fix diff. |
| Browser-faithful direct HTTP API-origin native-form probe | PASS | The prior local form failure is fixed; the request reaches the HTML form route. |
| Configured client-origin, same-origin API form, mismatched-Origin, and missing-Origin tests | PASS | Updated Origin tests pass and continue to reject attacker and missing origins. |
| HTTPS-termination probe with external `Origin: https://api.example.test` and matching Host | FAIL | The response is 403 because Express sees `request.protocol` as `http`; the application has no trusted-proxy configuration. |
| Implementation evidence provenance | PASS | `implementation-report.md` now records both implementation commits accurately. |

### Updated acceptance status

The following remain passing: manager authorization, strict request validation, Argon2id hashing, target re-read and field preservation, session revocation/retry behavior, safe responses, client confirmation/loading/clearing, forged-field denial, and the 50/50 regression matrix.

The no-JavaScript form now passes the local HTTP test but still fails the approved HTTPS deployment requirement. Consequently, the Origin/HTTPS, safe HTML error, and standard no-JavaScript acceptance criteria remain `FAIL` for release.

### Remaining finding

#### Finding 1 — HTTPS same-origin form still rejected

- Severity: `HIGH`
- Boundary: Browser HTTPS Origin to Express Origin protection behind TLS termination.
- Reproduction: `isSameOrigin` compares the browser Origin with `request.protocol` plus `Host` (`apps/api/src/http/origin-protection.ts:7-17`). The server uses plain `app.listen` and does not configure Express trusted-proxy handling (`apps/api/src/server.ts:85-87`). An independent probe representing an HTTPS reverse proxy sent `Origin: https://api.example.test:<port>` and matching `Host` while Express saw `http`; the POST returned `403 The request origin is not allowed.`
- Impact: The approved no-JavaScript password-reset form remains unusable in the required HTTPS deployment model. The client-origin JSON flow remains protected and functional; this is not an authorization bypass.
- Required fix: Make external-origin resolution explicit and deployment-safe: configure a narrowly scoped trusted proxy and test `X-Forwarded-Proto`, or compare against a validated configured API origin. Do not rely on an arbitrary Host header or silently trust unvalidated forwarded headers. Add an HTTPS-termination integration test covering successful, invalid, unauthorized, and service-failure native-form submissions while retaining attacker and missing-Origin rejection.
- Verification: Re-run the full 50-test matrix and an HTTPS-termination probe using the actual deployment configuration; the form must return the expected HTML response rather than a pre-route 403.
- Residual risk: None should be accepted for the required no-JavaScript criterion without a human-approved specification amendment.

#### Finding 2 — Previous evidence discrepancy resolved

- Severity: `RESOLVED`
- Verification: `implementation-report.md` records `8f85d40` and `aec9645`; the current evidence commit is `53bc6b4`.

### Updated verdict

- Result: `FAIL`
- Human decision required: Request one more implementation correction for Finding 1, followed by fresh independent verification. This report does not approve the merge or accept the failed HTTPS/no-JavaScript criterion.
- Follow-up task: Make same-origin form Origin resolution work under the approved HTTPS deployment model without weakening CSRF protection, add proxy-boundary regression tests, and rerun the required matrix.

## Re-review 2 — 2026-10-20

### Updated review identity

- Reviewed implementation: original `8f85d40`, first fix `aec9645`, and latest fix `aac65d8ac7372a56be61aba90605f57275a6e595` (`fix(manager): configure explicit API origin for forms`).
- Updated evidence commit: `5ff1136` (`docs(workflow): record HTTPS origin review fix`).
- Fresh clean snapshot: `/private/tmp/librarian-password-reset-review-fix2`, exported from `aac65d8`; no source changes were present before testing.
- Worktree exception remains: native Git worktree registration is unavailable because repository `.git` metadata is read-only.

### Updated verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Inspect `aac65d8` diff and changed-file scope | PASS | The fix adds explicit API-origin configuration/validation, updates Origin callers/tests, and documents deployment configuration. |
| `npm test` in the fresh clean snapshot with approved ephemeral localhost binding | PASS | Build completed and all 50/50 required tests passed. |
| HTTPS-termination simulation using configured `https://api.example.test` API origin | PASS | Browser-faithful success, validation, authorization, and service-failure form requests pass; attacker and missing origins remain rejected. |
| Authorization, transaction, hashing, revocation, response, client, and scope inspection | PASS | No new runtime authorization or secret-handling defect found. |
| Production transport configuration inspection | FAIL | `validateOrigin` accepts `http:` for `API_ORIGIN`, and production only requires that the variable be present; no HTTPS-only guard exists. |

### Updated acceptance status

The prior HTTPS/native-form finding is resolved: the explicit API origin avoids Host/protocol inference and the proxy-boundary tests pass. Authorization, strict validation, Argon2id hashing, target state preservation, session revocation/retry behavior, safe responses, client confirmation/clearing, Origin rejection, and all 50 regression tests pass.

The HTTPS deployment requirement remains unmet for a misconfigured production environment because `API_ORIGIN=http://...` is accepted. This leaves the transport/security acceptance criterion `FAIL` until production configuration is enforced by code or the requirement is explicitly amended by a human.

### Remaining finding

#### Finding 3 — Production permits a non-HTTPS API origin

- Severity: `MEDIUM`
- Boundary: Production configuration validation to password transport and native form action.
- Reproduction: `apps/api/src/server.ts:14-23` allows both `http:` and `https:` in `validateOrigin`. The production guard at `apps/api/src/server.ts:32-34` checks only that `API_ORIGIN` is present, then accepts an `http://` value. The documented native-form action uses this externally visible API origin.
- Impact: A production deployment can start with `API_ORIGIN=http://...`; manager password-reset form submissions and API calls can then transmit password material over cleartext HTTP, violating the approved requirement that deployed password traffic use HTTPS. This is a configuration safety failure, not an authorization bypass.
- Required fix: Keep HTTP origins for local development, but require `https:` for `API_ORIGIN` and `CLIENT_ORIGIN` when `NODE_ENV=production` (or enforce the equivalent at the deployment boundary). Add startup-validation tests proving production rejects HTTP origins and accepts HTTPS origins; retain local HTTP coverage.
- Verification: Run the production configuration validation with HTTP and HTTPS origin values, then rerun `npm test` and the HTTPS-termination form tests.
- Residual risk: Do not accept this as an unrecorded deployment assumption; the current code permits the unsafe configuration.

### Updated verdict

- Result: `FAIL`
- Human decision required: Request the production HTTPS-only configuration guard and a fresh independent verification. This report does not approve the merge or accept the transport gap.
- Follow-up task: Add production HTTPS-origin validation and regression coverage, then rerun the required matrix.

## Re-review 3 — 2026-10-20

### Updated review identity

- Reviewed implementation: original `8f85d40`, first fix `aec9645`, and latest fix `aac65d8ac7372a56be61aba90605f57275a6e595`.
- Updated evidence commit: `5ff1136`.
- Fresh clean snapshot: `/private/tmp/librarian-password-reset-review-fix2`, exported from `aac65d8`; no source changes were present before testing.
- Worktree exception remains: native Git worktree registration is unavailable because repository `.git` metadata is read-only.

### Updated verification

| Command or inspection | Result | Evidence |
|---|---|---|
| `npm test` in the fresh clean snapshot with approved ephemeral localhost binding | PASS | Build completed and all 50/50 required tests passed. |
| HTTPS-termination simulation with explicit `https://api.example.test` API origin | PASS | Native-form success, validation, authorization, and service-failure cases pass; attacker and missing origins remain rejected. |
| Authorization, hashing, transaction, session revocation, response, client, and scope inspection | PASS | No new runtime authorization or secret-handling defect found. |
| Production transport configuration inspection | FAIL | `validateOrigin` permits `http:` and the production guard checks only that `API_ORIGIN` is present. |

The prior HTTPS reverse-proxy finding is resolved. The remaining transport finding below prevents a passing verdict.

### Remaining finding

#### Finding 3 — Production permits a non-HTTPS API origin

- Severity: `MEDIUM`
- Boundary: Production configuration validation to password transport and native form action.
- Reproduction: `apps/api/src/server.ts:14-23` allows both `http:` and `https:` in `validateOrigin`. The production guard at `apps/api/src/server.ts:32-34` checks only that `API_ORIGIN` exists, then accepts an `http://` value. The documented native-form action uses this externally visible API origin.
- Impact: A production deployment can start with `API_ORIGIN=http://...`; manager password-reset forms and API calls can then transmit password material over cleartext HTTP, violating the approved HTTPS deployment requirement. This is a configuration safety failure, not an authorization bypass.
- Required fix: Keep HTTP origins for local development, but require `https:` for `API_ORIGIN` and `CLIENT_ORIGIN` when `NODE_ENV=production` (or enforce the equivalent deployment invariant). Add startup-validation tests proving production rejects HTTP origins and accepts HTTPS origins; retain local HTTP coverage.
- Verification: Run production configuration validation with HTTP and HTTPS origin values, then rerun `npm test` and the HTTPS-termination form tests.
- Residual risk: Do not accept this as an undocumented deployment assumption; the current code permits the unsafe configuration.

### Updated verdict

- Result: `FAIL`
- Human decision required: Request the production HTTPS-only configuration guard and a fresh independent verification. This report does not approve the merge or accept the transport gap.
- Follow-up task: Add production HTTPS-origin validation and regression coverage, then rerun the required matrix.

## Re-review 4 — 2026-10-20

### Updated review identity

- Reviewed implementation: original `8f85d40d4672050f0a900e2f955788bbf76e907f`, first fix `aec9645b4a43068c901a0416e22b91e67407275f`, second fix `aac65d8ac7372a56be61aba90605f57275a6e595`, and latest fix `ca06f8e01815f16696b1af0c9f1620f35500bc35` (`fix(manager): enforce HTTPS API origin in production`).
- Updated evidence commit: `39cb1fcd5ba9e45b5b2cc7891cd82035d9eb8f2a` (`docs(workflow): record HTTPS startup validation review`).
- Fresh clean snapshot: `/private/tmp/librarian-password-reset-review-fix3.e1K7MH`, exported from `ca06f8e`; no source changes were present before testing.
- Worktree exception remains: native Git worktree registration is unavailable because repository `.git` metadata is read-only. The clean archive snapshot was used for execution; the original checkout was used for read-only inspection and review-artifact updates.

### Updated verification

| Command or inspection | Result | Evidence |
|---|---|---|
| Inspect the exact cumulative implementation diff and changed-file scope | PASS | The latest production change centralizes API-origin resolution, adds production HTTPS-only validation, and adds focused startup tests. No dependency, CI, deployment, AI, or unrelated feature scope was added. |
| `npm run build` in the fresh clean snapshot | PASS | TypeScript and client production builds completed. Vite emitted only the existing unset local `VITE_API_ORIGIN` warnings. |
| `npm test` in the fresh clean snapshot with approved ephemeral localhost binding | PASS | Build completed and all 54/54 required tests passed. |
| Focused manager, Origin, and startup configuration tests | PASS | 21/21 tests passed, including authorization, native-form behavior, HTTPS-termination Origin handling, cleartext production rejection, valid HTTPS acceptance, and local HTTP default behavior. |
| `git diff --check 8f85d40 ca06f8e` | PASS | No whitespace errors in the cumulative implementation diff. |
| Authorization, state-transition, secret-boundary, and client/scope inspection | PASS | Server-loaded actor and target checks, self-target denial, Argon2id hashing, transactional field preservation, post-commit bounded session revocation, safe serialization, and client-only API inputs remain enforced. |
| Evidence and secret-pattern scan | PASS | No real credentials, session identifiers, password hashes, or unnecessary private data were found in the task evidence or changed scope; password strings present in tests are synthetic fixtures. No AI or external-egress path was introduced. |

### Updated acceptance status

The previous native-form Origin failure and the HTTPS-termination failure are resolved by the explicitly configured API origin. The latest fix also rejects a cleartext `API_ORIGIN` in production while retaining the localhost HTTP default for local development. The manager authorization, strict input validation, target re-read, Argon2id hashing, account-field preservation, session revocation, safe response, client confirmation/clearing, no-JavaScript form, and regression criteria are passing in the clean snapshot.

The approved sequential-storage residual risk remains: if the password write commits and both bounded session deletion retries and the queued fallback remain unavailable, stale target sessions may persist temporarily. The implementation records the approved generic failure behavior and does not trigger a second password reset.

### Finding status

#### Finding 1 — Native-form Origin boundary — RESOLVED

The configured `API_ORIGIN` is now explicitly trusted by Origin protection, and the browser-faithful HTTPS-termination tests pass while mismatched and missing Origins remain rejected.

#### Finding 2 — Evidence provenance — RESOLVED

The implementation report records the implementation commits and the latest HTTPS validation fix accurately.

#### Finding 3 — Production permits a non-HTTPS API origin — RESOLVED

`resolveApiOrigin` now requires an explicit origin in production, rejects `http://` API origins, accepts validated HTTPS origins, and preserves the local HTTP default. Dedicated startup-configuration tests cover these cases.

### Updated verdict

- Result: `PASS WITH RESIDUAL RISK`
- Human decision required: A human must decide whether to accept the already-approved sequential password-write/session-revocation residual risk and whether to merge. This independent review does not approve the merge.
- Follow-up: If accepted, proceed through the separate human merge/release gate; otherwise request a separately approved mitigation for the residual session-revocation risk.

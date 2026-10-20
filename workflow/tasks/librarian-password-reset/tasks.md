# Task Checklist: librarian-password-reset

## Inputs

- Approved specification path and version:
  `PlanDraft/Specs/LibrarianFeatures/ManagerFeatures/ResetLibrarianPassword.md`
  (`0.2-approved`)
- Specification approval record: Human approval recorded in chat on
  2026-10-20; decisions are recorded in the canonical specification and
  handoff.
- Task checklist status: `DRAFT`; separate human checklist approval required.
- Task checklist approver (human only):
- Task checklist approval date:

## Ordered implementation tasks

- [ ] **1. Perform the SDD apply preflight and confirm the shared contract** -
  Read the approved specification, this checklist, and the handoff; verify
  that the current manager route, active-actor middleware, error contract,
  account storage, session store, and client manager page are the intended
  integration points. Stop if any approval, requirement, or dependency is
  stale or contradictory.
  - Acceptance criteria: The implementer records the exact spec/checklist
    versions, confirms no source change is made before this preflight, and
    records any required clarification instead of guessing.
  - Verification: `git status --short`, source inspection of the paths listed
    in the specification, and the `sdd-apply` preflight record.
  - References: Specification context and technical specification; `AGENTS.md`,
    `workflow/README.md`, `workflow/agents/implementer.md`.
  - Dependencies: `None`

- [ ] **2. Add the manager reset request contract and server authorization** -
  Add the strict password/confirmation schema, bounded target path validation,
  and the manager-only `POST /api/v1/manager/librarians/:userId/password`
  route. Support JSON and standard form requests while deriving actor and
  target identity only from trusted server state.
  - Acceptance criteria: Active server-loaded managers can reach the service;
    signed-out, inactive, member, non-manager, forged-role, forged-target,
    self-target, malformed, and unknown-field requests are rejected with the
    approved error contract before a password write.
  - Verification: Focused route tests covering `401`, `403`, `400`, target
    validation, strict unknown-field rejection, Origin protection, and no
    storage call on rejected input.
  - References: Acceptance criteria 1-5 and 14-16; `apps/api/src/routes/manager.ts`,
    `apps/api/src/http/auth.ts`, `apps/api/src/http/errors.ts`,
    `apps/api/src/http/origin-protection.ts`.
  - Dependencies: Task 1

- [ ] **3. Implement the server-side password reset operation** - Add the
  account-storage operation that hashes the password with the existing
  Argon2id library outside the Firestore transaction, re-reads the target,
  verifies the target is a different librarian, and updates only password
  storage and approved metadata.
  - Acceptance criteria: Password policy and exact confirmation are enforced;
    the new password works for an active target and the old password fails;
    inactive targets remain inactive; status, manager flag, identity fields,
    and registration time are preserved; plaintext passwords never enter
    storage, responses, logs, or evidence.
  - Verification: Unit/storage tests for hashing, distinct salts, old/new
    authentication, inactive targets, self-target rejection, field
    preservation, and no-write validation failures.
  - References: Acceptance criteria 6-11; `apps/api/src/storage/accounts.ts`,
    `apps/api/src/storage/repositories.ts`,
    `packages/shared/src/domain/records.ts`.
  - Dependencies: Task 2

- [ ] **4. Revoke target sessions with bounded failure handling** - After the
  password write commits, destroy all target sessions using the existing
  session-store capability, retry deletion within a bounded request-level
  policy, and surface a generic service failure if revocation still fails.
  Do not trigger a second password reset when revocation fails.
  - Acceptance criteria: Successful resets invalidate every target session;
    persistent session-store failure leaves the password changed, returns no
    secret, does not report full success, and is recorded as the approved
    residual risk.
  - Verification: Integration tests with multiple target sessions, a revoked
    protected request, transient deletion failure, persistent deletion failure,
    and assertions that no second hash/reset is initiated.
  - References: Acceptance criteria 12-14; `apps/api/src/storage/accounts.ts`,
    `apps/api/src/storage/firestore-session-store.ts`,
    `tests/account-manager-policy.test.mjs`.
  - Dependencies: Task 3

- [ ] **5. Implement progressive-enhancement form behavior** - Make the reset
  operation usable with `application/x-www-form-urlencoded` without JavaScript,
  including a clear target-specific confirmation submit action and
  server-rendered success/validation/error responses.
  - Acceptance criteria: A standard form completes the same server-validated
    reset; browser-side confirmation or hidden fields are never used as
    authorization; validation and service errors do not claim success; no
    password is repopulated after submission.
  - Verification: No-JavaScript form integration/manual test for success,
    validation failure, unauthorized request, and service failure.
  - References: User-visible behavior 4-8; progressive-enhancement section;
    `apps/api/src/routes/manager.ts`, existing form handling in
    `apps/api/src/routes/auth.ts`.
  - Dependencies: Tasks 2-4

- [ ] **6. Add the manager UI and client API flow** - Add a reset action for
  other librarians, a password/confirmation form, accessible explicit
  confirmation, pending/error/success states, password clearing, and list
  refresh. Do not render an actionable self-reset control.
  - Acceptance criteria: The target is named before confirmation; duplicate
    submissions are prevented; successful reset refreshes the server list;
    failures show no false success; password values are cleared; the UI does
    not send client role/account fields.
  - Verification: Client tests for manager/non-manager rendering, self-target
    exclusion, confirmation text, loading, success refresh, failure handling,
    and password-field clearing; manual accessibility check.
  - References: User-visible behavior; acceptance criterion 1 and 16;
    `apps/client/src/api/manager.ts`,
    `apps/client/src/pages/ManagerLibrarianAccountsPage.tsx`,
    `apps/client/src/auth/ProtectedRoute.tsx`, `apps/client/src/styles.css`.
  - Dependencies: Tasks 2-5

- [ ] **7. Complete focused security and integration coverage** - Add or update
  unit, route, storage, session, client, Origin, and no-JavaScript tests for
  the full matrix, including forged authorization fields and safe response
  serialization.
  - Acceptance criteria: Test coverage maps to T-1 through T-16; all
    unauthorized, malformed, cross-role, cross-target, stale-session,
    session-failure, and secret-handling cases are represented without real
    credentials or unnecessary personal data.
  - Verification: Focused test commands recorded by the implementer and a
    review of the mapping from tests to specification criteria.
  - References: Specification test matrix T-1 through T-16; `tests/` existing
    manager/auth/session/origin conventions.
  - Dependencies: Tasks 2-6

- [ ] **8. Run regression verification and record implementation evidence** -
  Run the project build and full test suite, inspect the diff for scope and
  secret leakage, and complete the implementation report and security evidence
  without changing the approved requirements.
  - Acceptance criteria: Existing manager list/status, authentication,
    registration, session, Origin, and no-JavaScript tests remain passing; the
    implementation report records changed files, commands, results, deviations,
    and residual risks; no push, deploy, merge, or reviewer approval is claimed.
  - Verification: `npm run build`, `npm test`, `git diff --check`, and the
    repository’s required secret/evidence review.
  - References: Acceptance criterion 12; verification commands; `workflow/templates/implementation-report.md`,
    `workflow/tasks/librarian-password-reset/security-review.md`.
  - Dependencies: Task 7

## Checklist rules

- Tasks are completed in order unless the handoff records an approved reason.
- A task is checked only after its acceptance criteria and verification pass.
- Changes to requirements use the `sdd-revise` procedure and an amendments
  entry; they are not silently edited into this checklist.
- The implementer records completion evidence in the implementation report.
- A human must separately approve this checklist before implementation begins.

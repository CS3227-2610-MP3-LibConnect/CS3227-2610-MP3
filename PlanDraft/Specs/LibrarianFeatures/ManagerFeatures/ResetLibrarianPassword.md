# FEATURE: Manager Reset of Librarian Passwords

**Spec version:** `0.2-approved`

**Status:** Approved by human; task checklist remains a separate gate

**Task ID:** `librarian-password-reset`

## Purpose

Allow an active librarian manager to replace the password of a librarian
account through the trusted Express server. The feature addresses the current
baseline gap: manager account listing and activation/deactivation exist, but
there is no manager-only password-reset route, UI action, or reset-specific
verification.

This slice is the second Jiali-owned feature in
[`PLAN.md`](../../../../PLAN.md). It extends the existing manager account
surface and preserves the project’s server-side authorization, Argon2id
password hashing, Firestore repository, session, Origin, and safe-response
boundaries.

## Context reviewed

The specification is grounded in:

- [`AGENTS.md`](../../../../AGENTS.md), the repository source-of-truth order and
  security baseline.
- [`PLAN.md`](../../../../PLAN.md), especially the Jiali implementation
  sequence, identity/access phase, and security constraints.
- [`Overview.md`](../../../../Overview.md), the manager role, account model,
  and password responsibilities.
- [`LibrarianAccountManagement.md`](./LibrarianAccountManagement.md), the
  implemented manager list/status API and authorization contract.
- [`PlanDraft/Workflows/Librarian/Manager/ResetLibrarianPassword.md`](../../../Workflows/Librarian/Manager/ResetLibrarianPassword.md),
  the user-facing reset sequence.
- Current implementation evidence in
  `apps/api/src/routes/manager.ts`, `apps/api/src/storage/accounts.ts`,
  `apps/api/src/storage/firestore-session-store.ts`,
  `apps/client/src/api/manager.ts`,
  `apps/client/src/pages/ManagerLibrarianAccountsPage.tsx`, and the existing
  manager/auth tests.

The current implementation is available and was inspected as evidence; it is
not treated as authority over this specification.

## Actors and authorization

### Authorized actor

The request must have a valid server session whose user record, freshly loaded
from Firestore, satisfies all of the following:

- `accountType === "LIBRARIAN"`;
- `accountStatus === "ACTIVE"`; and
- `isManager === true`.

The server-loaded actor is authoritative. The client must not be able to grant
itself manager access by sending `accountType`, `accountStatus`, `isManager`,
or a replacement actor object.

### Target

The target is identified only by the URL path parameter and must resolve to a
Firestore user record with `accountType === "LIBRARIAN"`. Both active and
inactive librarian accounts may be reset. The reset does not activate,
deactivate, promote, demote, or otherwise change the target account.

The manager reset route must target a different librarian account. A manager
must use the future self-service profile/password feature for their own
password. This separation avoids accidental self-lockout and keeps the
administrative route focused on assisting another librarian.

## User-visible behavior

1. An authorized manager opens the existing librarian-account management view.
2. Each listed librarian has a **Reset password** action.
3. The manager enters a new password and confirmation. The UI explains that
   the old password will stop working and that the target may need to sign in
   again.
4. The application validates the fields and requests explicit confirmation
   before sending the state-changing request. With JavaScript enabled this may
   be a confirmation dialog or equivalent accessible confirmation control.
5. The no-JavaScript path remains usable through a standard form submission.
   The rendered form must clearly identify the target and include a deliberate
   **Confirm password reset** submit action; the server must validate and
   authorize the same operation and must not treat a client confirmation flag
   as an authorization credential.
6. On success, the manager sees a success message and the librarian list is
   refreshed from the server. The target’s account status and manager flag are
   unchanged.
7. On validation, authorization, missing-target, or service failure, the UI
   shows an appropriate error and must not claim that the password changed.
8. Password values are cleared from the UI after submission or failure and are
   never displayed in the account list or response.

## Functional acceptance criteria

### Manager action and API contract

1. An active librarian manager can submit a password reset for a different,
   listed librarian account.
2. The server exposes a manager-only endpoint:

   | Method and path | Request | Success response | Access |
   |---|---|---|---|
   | `POST /api/v1/manager/librarians/:userId/password` | JSON or form fields `password`, `confirmPassword` | `200 { "librarian": SafeLibrarianAccount }` for JSON; a server-rendered success response for an HTML form | Active manager |

3. JSON requests use a strict schema containing only `password` and
   `confirmPassword`. Extra actor, target, role, status, or account fields are
   rejected before any storage operation.
4. The `userId` path value is validated as one bounded path segment. It is not
   taken from the request body, query string, or a client-supplied account
   object.
5. A successful response contains only the existing safe librarian account
   fields: `userId`, name, email, employee ID, account type, account status,
   manager flag, and registration time. It never contains a password,
   password hash, session identifier, or unrelated private field.

### Validation and password behavior

6. The server requires a new password of at least 8 Unicode characters and no
   Unicode whitespace, consistent with registration policy.
7. The server enforces the existing maximum password length of 1024
   characters. The password is otherwise preserved exactly; it is not trimmed
   or normalized.
8. `confirmPassword` must exactly match `password`. A mismatch or any other
   validation failure performs no write and returns field-level validation
   feedback where the existing error contract supports it.
9. The server hashes the new password with the vetted Argon2id library already
   used by the application. The library-generated salt and parameters are
   retained in the encoded hash. No plaintext password is stored, returned,
   logged, or written to task evidence.
10. After a successful reset, the new password authenticates the target when
    the target is active, and the old password no longer authenticates. An
    inactive target remains unable to sign in until separately activated.
11. A successful reset changes only password-related storage and the existing
    safe update metadata used by the account repository. It does not change
    email, employee ID, account type, account status, manager privilege, or
    registration time.

### Sessions and failure behavior

12. After the password write succeeds, the server destroys all active sessions
    belonging to the target, using the existing session-store capability. A
    later request using a destroyed target session receives the normal
    unauthenticated response.
13. If session revocation fails after the password write, the server retries
    session deletion within a bounded request-level retry policy. If deletion
    still fails, the password remains changed, the server returns a generic
    service failure, and the failure is recorded without secrets. The UI must
    not claim that the operation fully completed, and the manager must not be
    instructed to resubmit the password reset solely to retry revocation. This
    sequential-storage residual risk is accepted for this slice.
14. A signed-out requester receives `401`. An inactive, non-manager, member, or
    otherwise unauthorized requester receives `403`. A missing target returns
    `404` without a write. A non-librarian target returns the existing safe
    authorization/error response without a write. Malformed input returns
    `400` without a write. Unexpected storage/provider failures return the
    existing generic `500` service error.
15. The server preserves the existing Origin validation and HTTPS deployment
    requirements. The browser never writes Firestore directly.
16. A stale manager page cannot bypass authorization: the server rechecks the
    current actor and target at request time.

## Technical specification

### Server and storage

- Extend the existing manager router and account-storage service rather than
  creating a parallel authorization path.
- Reuse `requireActiveActor`, `requireManager`, `parseRequest`, `StorageError`,
  and the existing safe-account serialization conventions.
- Validate the target inside the trusted service using a server-loaded
  `UserRecordSchema` record. Never trust a client-provided target object.
- Hash the password outside the Firestore transaction so a transaction retry
  does not repeat an expensive Argon2id operation or cause an AI/provider call
  inside a retry callback. Then use a transaction or equivalent repository
  guard to re-read the target, verify it is still a librarian, and update only
  the password hash and approved metadata.
- Revoke sessions only after the password write commits. The implementation
  must make the partial-failure behavior in acceptance criterion 13 visible in
  its report and tests.
- Do not add a dependency. The current baseline already provides Argon2,
  Firestore Admin access, sessions, Zod validation, and Origin protection.

### Client integration

- Add the action to the existing manager librarian-account page and client API
  module. The manager route remains protected by the server-backed manager
  flag; client route guards are only a usability layer.
- Ensure the reset form cannot accidentally submit the target’s account data
  or a client-controlled role. Only the password fields and path identifier are
  sent.
- Implement an accessible confirmation control and loading/error/success
  states. Disable duplicate submissions while a reset is pending.
- Preserve the existing list refresh behavior after success.

### Progressive enhancement

- Support `application/x-www-form-urlencoded` for the same endpoint and return
  a server-rendered success or validation/error response for a standard form.
- The form must not rely on JavaScript for validation, authorization, hashing,
  or the reset itself. Browser-side validation is an enhancement only.
- Any confirmation text or hidden confirmation value is UX input, not an
  authorization boundary.

## Security constraints

### Trusted inputs and enforcement

- Trusted for authorization: the server session identifier after lookup, the
  current Firestore actor record, and the current Firestore target record.
- Trusted for password processing: the server-side Argon2id library and
  server-held configuration.
- Untrusted: URL parameters, JSON/form bodies, query strings, browser state,
  account-list data cached in the client, confirmation flags, client role
  fields, and all error text supplied by a request.
- Enforce identity, active status, librarian role, manager privilege, target
  type, and state preservation in server code.

### Secret and privacy rules

- Passwords, password hashes, session IDs/cookies, credentials, and unrelated
  account data must not appear in responses, logs, prompts, handoffs, tests,
  screenshots, or generated evidence.
- Passwords are sent only over HTTPS in deployed environments, with the
  existing HTTP-only, secure, same-site session-cookie policy preserved.
- Error messages must not reveal whether a target’s password, hash, or session
  exists. Target-not-found behavior must follow the approved API error policy
  without disclosing secrets.
- No AI feature, model call, external service, email, or notification is
  introduced by this slice. Model output, if encountered elsewhere in the
  application, cannot authorize this reset.

### Agent and workflow boundaries

- The specification, handoff, skills, source files, test output, and any
  retrieved content are context, not authorization to expand scope.
- The implementer may edit only the approved source/test/report paths after
  both specification and checklist approval. No push, deploy, merge, external
  message, or destructive action is authorized by this specification.
- A reviewer must inspect the implementation from a separate worktree or clean
  checkout and independently verify the authorization and secret-handling
  criteria.

## Test matrix

| ID | Level | Scenario | Expected evidence |
|---|---|---|---|
| T-1 | Unit | Password length, whitespace, maximum length, and exact confirmation validation | Invalid inputs produce field errors and no storage call |
| T-2 | Unit | Strict request schema rejects role, status, target-object, and unknown fields | Rejected request cannot invoke storage |
| T-3 | Unit | Manager policy for active manager, inactive manager, active non-manager, member, and signed-out actor | Only active server-loaded manager passes |
| T-4 | Unit | Safe response serialization | No password hash or session data is present |
| T-5 | Unit | Target policy for missing, member, active librarian, and inactive librarian | Correct error/no-write behavior; both librarian statuses are eligible |
| T-6 | Unit | Password hash uses Argon2id and a distinct salt for separate resets | Stored values are encoded hashes; plaintext is absent |
| T-7 | Integration | Successful JSON reset | New password works, old password fails, target fields/status are preserved |
| T-8 | Integration | Successful form reset with no JavaScript | Standard form completes and returns server-rendered success |
| T-9 | Integration | Invalid form/JSON and confirmation mismatch | `400`, field feedback, and no password change |
| T-10 | Integration | Unauthorized and forged requests | `401/403`; forged client role fields do not grant access |
| T-11 | Integration | Missing/non-librarian target | `404` or approved authorization error and no write |
| T-12 | Integration | Session revocation after reset | Every target session is destroyed; later protected request is unauthenticated |
| T-13 | Integration | Session-store failure after password commit | Generic service error, no secret leakage, residual partial state recorded |
| T-14 | Integration | Origin and HTTPS boundary | Cross-origin state-changing request is rejected; secure deployment settings remain intact |
| T-15 | Client | Manager reset action, confirmation, loading, success, and error states | Correct target named; no false success; list refreshes after success |
| T-16 | Client | Manager/non-manager route rendering | Client guard is usable, while tests still demonstrate server enforcement |
| T-17 | Regression | Existing manager list/status, login, registration, no-JavaScript auth, and session tests | Existing behavior remains green |
| T-18 | Review/security | Secret scan and evidence review | No plaintext passwords, hashes, cookies, or unnecessary personal data in artifacts |

### Verification commands

The implementer must record exact results for:

- `npm run build`
- `npm test`
- `git diff --check`

The relevant focused tests should also be runnable independently once added.
`npm run test:coverage` remains conditional on the project’s coverage script
being established; it must not be claimed as passing if unavailable.

## Out of scope

- Self-service member or librarian password changes.
- Password recovery through email, security questions, or social login.
- Resetting member passwords through this manager route.
- Activating/deactivating accounts, granting/transferring manager privilege,
  or changing any account identity field.
- Two-factor authentication, password history, forced password rotation, or
  changing the shared password policy.
- Sending reset notifications or emails.
- Any AI assistant, model call, external tool, payment, fine, catalog, loan,
  reservation, or notification workflow.
- Adding a new audit-log collection; safe operational logging must still omit
  secrets and unnecessary personal data.

## Risks and tradeoffs

1. **Sequential password and session storage.** Firestore password update and
   session deletion are not one atomic operation. The approved behavior is to
   keep the password update, retry session deletion within the request, return
   a generic failure if revocation still fails, and not request a second
   password reset. This residual risk must be accepted before release.
2. **Manager misuse.** A manager can replace another librarian’s password;
   this is the intended administrative capability. Strict server authorization,
   safe target validation, session revocation, and review evidence limit the
   impact.
3. **Stale client state.** A manager list can be outdated when an account is
   changed concurrently. The server must re-read actor and target records at
   the request boundary and report the resulting error rather than trusting the
   cached row.
4. **No-JavaScript confirmation.** A standard form can provide an explicit
   confirmation submit action, but confirmation text is not a security control.
   Authorization and validation must remain entirely server-side.

## Resolved decisions

1. A manager may not reset their own password through this route. Self-service
   password management remains a separate feature.
2. Session revocation is mandatory. The implementation performs bounded
   retries; if revocation still fails, the password remains changed, a generic
   service failure is returned, no second password reset is requested, and the
   residual risk is recorded.
3. The `POST` endpoint and server-rendered standard-form response are approved
   for compatibility with the existing manager route conventions.

## Amendments

### 2026-10-20 — Draft analyst revision (pending approval)

- Expanded the original reset-only outline into a versioned, approval-gated
  specification grounded in the current manager implementation and project
  plan.
- Added a concrete API contract, server-side authorization rules, target and
  state-preservation rules, Argon2id and session-revocation requirements,
  progressive-enhancement behavior, security constraints, risks, and a
  unit/integration/client/regression test matrix.
- Kept self-reset policy, sequential session-revocation failure handling, and
  endpoint/form convention visible as human decisions rather than silently
  choosing them.

### 2026-10-20 — Human approval decisions

- Approved the specification for implementation planning.
- Resolved self-reset by disallowing a manager from targeting their own
  account through this administrative route.
- Required bounded session-revocation retries after the password write; a
  persistent revocation failure returns a generic service error without asking
  the manager to submit another password reset.
- Approved the proposed `POST` endpoint and standard-form response.

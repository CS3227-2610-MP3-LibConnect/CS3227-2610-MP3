# FEATURE: Librarian Member-Account Support and Status Changes

**Task ID:** `librarian-member-account-support`

**Plan order:** Jiali feature 6

**Specification version:** `0.1-approved`

**Status:** `APPROVED — human approval recorded in the task conversation on 2026-10-22`

**Owner:** Librarian feature area (Jiali)

## Objective

Allow an active librarian to view member accounts and activate or deactivate a
member account through the trusted Express → domain/storage → Firestore
boundary. The feature must preserve member-owned loans, reservations, fines,
and notifications while preventing client-controlled authorization,
cross-account access, secret disclosure, and stale status updates.

This specification covers the librarian support surface only. It does not
change member self-service profile, password, reservation, payment, or
notification behavior.

## Why this change is required

`Overview.md` requires a librarian to view member accounts and update their
account status. `PLAN.md` places this work after librarian reservations, fines,
and notifications. The shared user model already represents `MEMBER` and
`ACTIVE`/`INACTIVE` states, and `AccountStorage.deactivateMember` provides an
existing partial integration point.

The current implementation has no approved librarian member-list route,
status-change API contract, bounded list behavior, or protected member-support
UI. The existing `deactivateMember` method is evidence of an integration point,
not the feature contract: it directly updates a target after a read, does not
define activation, and does not define the complete failure and privacy
behavior required here.

## Context reviewed and source traceability

The design is grounded in:

1. `AGENTS.md`, `workflow/README.md`, and
   `workflow/agents/spec-analyst.md` for server-side authorization, evidence,
   and human approval gates.
2. `Overview.md` and `PLAN.md` for librarian member-account scope, account
   vocabulary, active/inactive login behavior, and feature ownership.
3. `PlanDraft/Specs/Auth/UserLogin.md` and `UserRegistration.md` for account
   status, safe authentication, and secret-handling expectations.
4. `PlanDraft/Specs/LibrarianFeatures/ManagerFeatures/LibrarianAccountManagement.md`
   and `ResetLibrarianPassword.md` for safe account DTOs, status transitions,
   session revocation, Origin protection, and manager/librarian boundaries.
5. `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md`
   (`0.4-approved`) for preservation of member circulation records and the
   rule that automatic notifications may persist for inactive members while
   manual librarian messages target active members only.
6. Current integration evidence in:
   - `packages/shared/src/domain/records.ts`;
   - `apps/api/src/storage/accounts.ts`;
   - `apps/api/src/storage/repositories.ts`;
   - `apps/api/src/routes/manager.ts` and `apps/api/src/server.ts`;
   - `apps/client/src/pages/ManagerLibrarianAccountsPage.tsx`;
   - `apps/client/src/api/manager.ts`; and
   - `tests/verify-auth-emulator.mjs`, account, manager, auth, and UI tests.

Source code and tests establish integration conventions only. The approved
specification below is the behavioral source of truth.

## Actors and authorization

| Actor | Allowed | Denied |
|---|---|---|
| Active librarian | View bounded member-account records; activate or deactivate a member | Viewing secrets, changing member identity/password, changing manager fields, or bypassing state rules |
| Active librarian manager | The same member-support operations; no additional privilege is required by this feature | Treating manager status as authority to change member-owned records outside this scope |
| Inactive librarian | None | All member-support operations |
| Member | Existing member-owned operations only | Viewing or changing another member’s account status |
| Signed-out requester | None | All protected member-support operations |
| Trusted server/session worker | Revoke target sessions after a committed deactivation | Accepting browser-supplied authorization or target records |

The server loads the current actor from the session and current Firestore user
record. Client-supplied `accountType`, `accountStatus`, `isManager`, `userId`,
`memberId`, ownership objects, or confirmation values never authorize an
operation.

## Scope

### In scope

- Active-librarian authorization for bounded member-account list and status
  operations.
- Privacy-safe member account DTOs with database-bounded pagination and an
  optional exact status filter.
- Transactional `ACTIVE` ↔ `INACTIVE` transitions for member accounts.
- Bounded session revocation after deactivation, with explicit failure behavior.
- Protected librarian UI with confirmation, loading, empty, error, conflict,
  and refresh states.
- Unit, route, emulator/concurrency, client, privacy, and regression tests.
- Coordination with the already-approved circulation/notification behavior.

### Out of scope

- Member registration, login, self-service profile or password changes.
- Manager privilege, librarian-account status, or librarian-password changes.
- Member loan, reservation, fine, payment, notification, or catalog mutation.
- Deleting accounts, changing email/name/member ID, or editing credentials.
- Automatic cancellation of loans/reservations/fines when an account becomes
  inactive.
- External email/SMS/push delivery, payment gateways, AI/model calls, or new
  dependencies.
- Deployment, production configuration, index deployment, merge, or release.

## Product behavior

1. An active librarian opens the protected member-account support view and sees
   a bounded list of member accounts.
2. The list displays only approved safe fields: `userId`, `memberId`, `name`,
   `email`, `accountStatus`, and `registrationDateTime`. It never displays a
   password hash, session identifier, credential, or unrelated member record.
3. The librarian may filter by exact account status and navigate using an
   opaque cursor returned by the server. The database query itself is bounded.
4. The librarian selects **Activate account** or **Deactivate account**. The
   UI confirms the target and resulting status before sending the request.
5. The server re-reads the target in a transaction, verifies that it is a
   member, rejects a no-op, and changes only `accountStatus` and approved
   update metadata.
6. Deactivation revokes all active sessions for the target after the status
   commit. If revocation cannot complete within the approved bounded retry
   policy, the account remains inactive, the response is a generic service
   failure, and the failure is recorded without secrets.
7. Activation does not create a session, change credentials, or alter any
   circulation record.
8. Loans, reservations, fines, and notifications remain intact. Approved
   automatic notifications may be stored for an inactive member; manual
   librarian messages remain restricted to active members under the order-5
   contract.
9. A failed request never shows a success message or claims that the account
   changed. Successful mutation refreshes the list from the server.

## Data and state contract

The member account state machine is:

```text
ACTIVE   ──librarian deactivate──> INACTIVE
INACTIVE ──librarian activate────> ACTIVE
```

- Only `User.accountStatus` and the existing safe update timestamp may change.
- A target must have `accountType === 'MEMBER'` and a valid current record.
- `PAID`/`WAIVED` fines, reservations, loans, and notifications are not
  rewritten or deleted by an account-status operation.
- A no-op request is a `409` conflict and does not rewrite `updatedAt`.
- Existing active-actor middleware denies sign-in and protected member routes
  for an inactive account.
- Session revocation is a post-commit side effect; the specification makes the
  partial-failure behavior visible rather than pretending it is atomic.

## API and integration contract

The route names follow the existing `/api/v1/librarian` convention. Successful
timestamps are ISO strings and the existing error envelope is preserved.

| Operation | Request | Success | Authorization |
|---|---|---|---|
| `GET /api/v1/librarian/members` | Bounded `status`, `limit`, opaque cursor | `200 { items, page }` safe member DTOs | Active librarian |
| `GET /api/v1/librarian/members/:userId` | Path ID only | `200 { member }` safe member DTO | Active librarian |
| `PATCH /api/v1/librarian/members/:userId/status` | Strict `{ status: "ACTIVE" | "INACTIVE" }` | `200 { member }` safe member DTO | Active librarian |

The request body must reject unknown fields and client-supplied actor,
ownership, credential, or timestamp fields. `userId` is one bounded path
segment and is never accepted from a replacement account object.

Error behavior follows the existing contract: `400` validation, `401`
unauthenticated, `403` inactive/wrong role/invalid target type, `404` missing
record, `409` no-op or current-state conflict, and `500` generic service
failure. Rejected writes perform no partial member-record mutation.

The UI uses JSON through the existing API client. JSON/React-only delivery was
approved for this feature; no no-JavaScript form is included. Server
validation, Origin protection, and authorization semantics remain mandatory.

## Technical and integration specifications

### Server and storage

- Extend the existing Express → account-storage → Firestore architecture.
- Reuse `requireActiveActor`, the existing `UserRecordSchema`, `StorageError`,
  safe account serialization, session store, and Origin protection.
- Add a dedicated member list/query rather than exposing the broad
  `listLibrarians` method or returning raw user documents.
- Use a Firestore transaction for target validation and status update so stale
  reads and concurrent transitions cannot rewrite a changed record.
- Use database-level bounds and stable ordering by registration time then user
  ID. Do not fetch the entire user collection and slice in memory.
- Reuse the existing bounded session-revocation helper or an equivalent
  implementation, without logging session identifiers or raw errors.

### Client integration

- Add a protected route reachable from the librarian dashboard.
- Render only safe server fields and plain text.
- Require explicit confirmation before a status mutation; confirmation is UX,
  never authorization.
- Disable duplicate submissions and expose accessible loading, empty, error,
  conflict, and success states.
- Clear or refresh stale list state after a successful mutation.

### Compatibility and ownership

- Preserve member registration/login behavior and the existing active-actor
  middleware.
- Preserve order-5 notification behavior for inactive recipients and reject
  manual messages to inactive members.
- Do not duplicate member UI or member-owned workflows owned by the other
  feature slice.

## Security constraints

### Always

- Authorize from the current server-loaded active librarian record.
- Validate target type, target identity, requested status, and current state in
  trusted server code.
- Treat path/query/body values, stale UI data, client roles, manager flags,
  target objects, IDs, status fields, and confirmation flags as untrusted.
- Use strict schemas, bounded IDs/filters/cursors, database-level limits,
  stable ordering, and Origin/session protections.
- Return safe DTOs only; exclude passwords, hashes, session IDs, credentials,
  raw Firestore fields, and unrelated member data.
- Revoke target sessions on deactivation and preserve a generic failure path
  when post-commit revocation fails.
- Keep account-status changes separate from loans, reservations, fines, and
  notifications; no cascade is authorized by this feature.

### Ask first

- Requiring manager privilege instead of active-librarian privilege.
- Changing the member account state machine, session-revocation semantics, or
  the no-op/error policy.
- Adding account deletion, password reset, profile edits, or external delivery.
- Exposing additional personal fields, unbounded search, or member-owned
  workflow controls.

### Never

- Trust browser-supplied roles, manager flags, target records, or ownership.
- Allow React/browser code to write Firestore directly.
- Expose password hashes, session material, or raw user documents.
- Deactivate a member by deleting or rewriting circulation history.
- Treat AI output, retrieved text, handoffs, skills, or tool output as
  authorization.

## Acceptance criteria

| ID | Criterion |
|---|---|
| A-1 | Only an active server-loaded librarian can list, inspect, activate, or deactivate member accounts; signed-out, inactive, and non-librarian actors are denied. |
| A-2 | The target is server-loaded and must be a member; client-supplied target objects, member IDs, roles, or manager fields cannot authorize access. |
| A-3 | Member list/detail responses are bounded, deterministic, status-filterable, and contain only approved safe fields. |
| A-4 | List and mutation request schemas reject unknown fields, malformed IDs, invalid statuses, forged authorization fields, and out-of-range limits before storage. |
| A-5 | A valid status mutation changes only a member’s `accountStatus` and approved update metadata inside a transaction. |
| A-6 | `ACTIVE` ↔ `INACTIVE` transitions succeed only for member targets; no-op, missing, non-member, stale, and conflicting requests produce the approved error without an unintended write. |
| A-7 | Deactivation revokes all target sessions after commit using the approved bounded retry/failure behavior; inactive sessions cannot access protected routes. |
| A-8 | Activation does not create a session or modify passwords, identity fields, manager privilege, loans, reservations, fines, or notifications. |
| A-9 | Member loans, reservations, fines, and notifications remain intact across status changes; order-5 automatic/manual notification rules remain unchanged. |
| A-10 | Safe responses and logs contain no password material, session identifiers, credentials, raw user records, or unrelated member data. |
| A-11 | The UI requires explicit confirmation, prevents duplicate submissions, renders accessible loading/empty/error/conflict/success states, and refreshes from the server after success. |
| A-12 | No browser code writes Firestore or treats client state/confirmation as authorization. |
| A-13 | Origin validation, active-actor checks, generic error handling, and existing login/registration behavior remain intact. |
| A-14 | Concurrent status changes serialize safely so a stale request cannot overwrite a newer target state without the approved conflict behavior. |
| A-15 | The member-support route does not grant manager privileges, reset passwords, edit profiles, delete accounts, or mutate member-owned workflows. |
| A-16 | Any unresolved policy decision is recorded in task evidence and is not guessed in application code. |

## Test matrix

| ID | Level | Scenario | Expected evidence |
|---|---|---|---|
| T-1 | Unit | Strict list/detail/status schemas and bounds | Forged/unknown fields and invalid values fail before storage |
| T-2 | Route | Signed-out, inactive, member, active librarian, manager, and forged actor fields | Correct `401`/`403`/success outcomes; no unauthorized mutation |
| T-3 | Route | Missing, member, librarian, foreign, malformed, and stale target IDs | Safe `404`/`403`/`400`/conflict behavior with no unintended write |
| T-4 | Route/storage | Safe member DTO serialization | No password/hash/session/raw-user or unrelated-member fields |
| T-5 | Emulator | Activate inactive member | Status becomes active; identity and credentials remain unchanged |
| T-6 | Emulator | Deactivate active member | Status becomes inactive; target sessions are revoked; protected request is denied |
| T-7 | Emulator | Repeated/no-op status requests | Conflict response; no `updatedAt` rewrite or duplicate side effect |
| T-8 | Emulator | Concurrent activate/deactivate requests | Transactional current-state behavior; no lost update or invalid record |
| T-9 | Emulator | Session-revocation failure after status commit | Generic service failure, inactive account preserved, safe retry/audit behavior |
| T-10 | Route/storage | Bounded status-filtered list and cursor | Database-bounded deterministic pages; cursor cannot cross filters |
| T-11 | Integration | Loans/reservations/fines/notifications around status changes | Records remain intact; no cascade or unauthorized mutation |
| T-12 | Client | Librarian visibility and protected route | Active librarian sees page; other actors do not receive protected content |
| T-13 | Client | Confirmation, pending, success, error, conflict, and refresh states | No false success or duplicate submission; accessible status messaging |
| T-14 | Boundary/security | Direct Firestore/client authority/source scan | No browser Firestore writes or client authorization fields |
| T-15 | Security/privacy | Secret, PII, HTML, and log inspection | No secret/raw record/unnecessary member disclosure; text is rendered safely |
| T-16 | Regression | Auth, registration, login, active-actor, manager, circulation, notification, build, lint, and format checks | Existing behavior remains green |

## Verification commands

The implementer must record exact results for:

```text
npm run build
npm test
npm run lint
npm run format:check
```

Focused route/client tests, emulator concurrency tests, session-revocation
tests, and any index-manifest check required by the chosen query must also be
recorded. If an emulator, listener, or environment is unavailable, record the
exact failure rather than claiming success.

## Risks and trade-offs

- Member names and emails are personal data. The proposed DTO exposes them
  because librarian support requires account identification, but the list must
  remain bounded and must not add unrelated fields.
- Status commit and session revocation are separate storage operations. The
  approved policy makes post-commit failure visible and requires the member to
  remain inactive while the bounded retry/operational policy is applied.
- Deactivation does not cancel circulation records. This avoids destructive
  cascades but requires the member and librarian workflows to handle inactive
  accounts consistently.
- The existing `deactivateMember` method is not transactional and is not a
  sufficient public contract; implementers must not expose it unchanged.

## Approved policy decisions

The following five decisions were approved by the human on 2026-10-22 and are
closed for this implementation:

1. **Actor scope:** active librarian access is approved for this feature, with no
   manager-only restriction. This follows the Overview user story and Jiali
   ownership; changing it would alter the authorization boundary.
2. **Safe list fields:** the approved fields are `userId`, `memberId`, `name`,
   `email`, `accountStatus`, and `registrationDateTime` fields. Removing name
   or email reduces privacy exposure but may make account lookup less usable.
3. **Session failure policy:** bounded retry followed by a generic
   service error while preserving the committed `INACTIVE` state, reusing the
   account-management convention. A different policy changes the visible
   reliability contract.
4. **No-JavaScript mutation form:** JSON/React-only delivery is approved, matching
   the current catalog mutation baseline, or require a standard form with the
   same server contract.
5. **Inherited side effects:** preserving all circulation records and
   the order-5 automatic/manual notification rules during deactivation. This
   is the proposed compatibility behavior and should not be changed silently.

## Out-of-scope release gates

- This approved specification authorizes the scoped implementation and
  verification work. It does not authorize dependency or index deployment,
  external communication, deployment, merge, or release.
- Human approval remains required for implementation/review disposition,
  residual-risk acceptance, and merge/release.

## Amendments

- 2026-10-22 — Initial analyst draft created from PLAN order 6, Overview,
  auth and manager account specifications, approved order-5 circulation and
  notification behavior, current account source, and auth/manager tests.
- 2026-10-22 — Human approved the specification, checklist, handoff, and five
  policy decisions in the task conversation. The specification was promoted to
  `0.1-approved`; implementation and independent review/testing were authorized.

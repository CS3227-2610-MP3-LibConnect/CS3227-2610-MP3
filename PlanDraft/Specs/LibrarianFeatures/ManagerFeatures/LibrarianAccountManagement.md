# FEATURE: Manager Librarian-Account Management

## Scope

This slice implements the first Jiali-owned feature in `PLAN.md`: an active
librarian manager can list librarian accounts and activate or deactivate a
librarian account. The operation is server-authorized from the authenticated
Firestore user record and is committed as one Firestore transaction.

The existing MP2 librarian-account vocabulary and status behavior are reused as
domain references only. The MP3 implementation uses TypeScript, Express,
React, Firestore, server-side sessions, and the MP3 manager rules; no MP2
JavaFX or file-backed persistence is part of this feature.

## Objective

Allow a librarian manager to safely administer librarian access while keeping
the deployment usable and preventing client-controlled privilege escalation.

Success means that a manager can see every librarian’s current status, confirm
a requested activation or deactivation, and receive an updated list after a
successful transaction. Non-managers, members, inactive sessions, malformed
requests, missing targets, and attempts to deactivate the last active manager
must not change Firestore state.

## Assumptions and decisions for this slice

1. The first manager is provisioned by a documented deployment/bootstrap
   procedure outside the public API. No HTTP endpoint grants `isManager` or
   bypasses the last-manager rule.
2. `isManager` remains a server-controlled boolean on the librarian user
   record. Public registration always writes `false`.
3. Deactivation of any librarian, including the requesting manager, destroys
   that target user’s active sessions. Deactivating the current manager is
   allowed only when another active manager remains; the UI then treats the
   current session as signed out.
4. A status request must name the desired final status. The server does not
   accept a client-supplied actor role, manager flag, or target account object.
5. A request whose desired status already equals the target status is rejected
   as a no-op and does not rewrite the record.
6. The existing CSRF protection applies to JSON and standard form submissions
   through the request `Origin` check.

## User-visible behavior

### Manager list

1. An authenticated active librarian manager opens the librarian-account
   management view.
2. The client requests the current list from the server and displays each
   librarian’s safe account fields: `userId`, name, email, employee ID,
   account status, manager flag, and registration time.
3. Password hashes, session identifiers, and other secrets are never returned.
4. The list includes inactive librarians and the active manager accounts.

### Status change

1. The manager selects a target librarian and chooses **Activate account** or
   **Deactivate account**.
2. Before the state-changing request is sent, the UI presents a confirmation
   step that names the target and the exact resulting status.
3. After confirmation, the client submits the desired status. On success, the
   UI shows a success message and reloads the list from the server.
4. When the current manager deactivates their own account and another active
   manager exists, the server revokes the current session; the client clears
   local auth state and navigates to sign-in after showing the result when
   possible.
5. A failed request must show an error and must not claim that the status
   changed.

## Acceptance criteria

1. A manager can view all librarian accounts and their current statuses.
2. A manager can change a librarian from `INACTIVE` to `ACTIVE` or from
   `ACTIVE` to `INACTIVE`.
3. The UI requires explicit confirmation naming the target and the resulting
   status before sending a state-changing request.
4. `GET /api/v1/manager/librarians` requires an active authenticated librarian
   whose server-loaded `isManager` value is `true`.
5. `PATCH /api/v1/manager/librarians/:userId/status` applies the same manager
   authorization check and accepts only `{ "status": "ACTIVE" | "INACTIVE" }`.
6. The server ignores or rejects client-supplied actor fields such as
   `accountType`, `isManager`, `accountStatus`, or a replacement target object.
7. Public registration cannot create or promote a manager. The bootstrap and
   emergency recovery procedures are documented outside this route.
8. The status mutation reads the target and counts active managers inside one
   Firestore transaction. It rejects deactivation when the target is the last
   active manager, so concurrent manager actions cannot leave zero active
   managers.
9. The target must exist and be a librarian. Missing or non-librarian targets
   produce an error without changing any record.
10. A no-op status request is rejected without changing `updatedAt` or other
    account fields.
11. Successful deactivation destroys all active sessions belonging to the
    target. A later request using a destroyed target session receives the normal
    unauthenticated response.
12. API responses use the existing error contract: `401` for no valid session,
    `403` for an inactive or unauthorized actor, `404` for a missing target,
    `409` for last-manager and other state conflicts, and `400` for malformed
    status input.
13. A successful list or mutation response omits `passwordHash` and all session
    data.
14. The list and mutation preserve the existing Origin validation and do not
    introduce direct browser access to Firestore.

## API contract

| Method and path | Request | Response | Access |
|---|---|---|---|
| `GET /api/v1/manager/librarians` | No body | `{ "librarians": SafeLibrarianAccount[] }` | Active manager |
| `PATCH /api/v1/manager/librarians/:userId/status` | `{ "status": "ACTIVE" | "INACTIVE" }` | `{ "librarian": SafeLibrarianAccount }` | Active manager |

`userId` is the Firestore user document ID and must be a single path segment.
The mutation response contains the post-transaction record. The list is
returned in deterministic order by registration time, then user ID, so the
client can refresh predictably.

For progressive enhancement, the same state-changing operation may accept an
`application/x-www-form-urlencoded` submission with `status`. The server must
still validate the status and actor, and must return a server-rendered success
or error response rather than treating a browser form as trusted input. The
manager UI’s confirmation step remains a client concern; the server never
uses a confirmation flag as an authorization substitute.

## Domain and transaction rules

- A manager actor is the request’s `request.actor`, loaded by
  `requireActiveActor` from the current user document. `request.body` and
  query-string role fields are never used for authorization.
- Manager authorization requires `accountType === 'LIBRARIAN'`,
  `accountStatus === 'ACTIVE'`, and `isManager === true`.
- The target must have `accountType === 'LIBRARIAN'` and a valid account status.
- Activation changes only `accountStatus` and `updatedAt`.
- Deactivation changes only `accountStatus` and `updatedAt`, then revokes the
  target’s sessions after the transaction succeeds.
- When deactivating an active manager, the transaction must observe at least
  two active manager records before applying the update.
- If a transaction retries or loses a race, the final check is repeated by
  Firestore’s transaction semantics; a failed transaction leaves the target
  unchanged.
- No manager flag, employee ID, email, password, or registration timestamp is
  editable through this slice.

## Testing strategy

### Unit and policy tests

- Validate the status request schema and reject extra or actor-like fields.
- Verify manager authorization for active manager, active non-manager,
  inactive manager, active member, and signed-out actors.
- Verify the last-manager policy and no-op policy without changing the target.
- Verify safe account serialization excludes password hashes and sessions.

### Integration tests

- Exercise the list and mutation routes with Firestore-backed repositories or
  test doubles matching the repository interfaces.
- Cover activation, deactivation, missing target, non-librarian target,
  malformed status, stale/inactive session, and last-active-manager denial.
- Confirm successful deactivation invokes session revocation and that a
  revoked session cannot access a protected route.
- Confirm a member or non-manager cannot read the list or mutate a target even
  when the request includes forged `isManager` or `accountType` fields.
- Add a concurrency-oriented transaction test showing two attempted
  last-manager deactivations cannot both succeed.

### Client tests

- Render the manager view only for a librarian manager.
- Verify the confirmation text identifies the target and final status.
- Verify success refreshes the list and failure renders an error without a
  false success message.
- Verify a self-deactivation success clears auth state and routes to sign-in.

### Verification commands

- `npm run build`
- `npm test`
- `npm run test:coverage` once the project’s coverage script is established
  by the foundation work.

## Security and operational boundaries

- Always: authorize from the server-loaded actor, validate all inputs with the
  shared schema conventions, use Firestore transactions for the linked
  manager-count/status decision, revoke deactivated-user sessions, and avoid
  logging secrets or full account records.
- Ask first: changing the account model, manager bootstrap/recovery policy,
  session-revocation semantics, or the last-manager invariant.
- Never: trust client role or manager fields, expose password hashes or session
  data, write to Firestore from React, allow public registration to set
  `isManager`, or bypass the last-manager protection through a normal route.

## MP2 reuse and MP3 adaptation record

- Reused conceptually: the MP2 `Librarian`/`User` account vocabulary, active
  versus inactive account behavior, manager-facing account list/status wording,
  and manager edge cases.
- Rewritten for MP3: Java domain/service behavior becomes TypeScript domain
  validation and Express route/service logic; file-backed account storage is
  replaced with Firestore repositories and transactions; JavaFX confirmation
  UI becomes a React confirmation flow; authorization uses the authenticated
  server actor rather than client/session role claims.
- Newly designed for MP3: server-enforced `isManager`, concurrent last-manager
  protection, session revocation after deactivation, safe API serialization,
  Origin protection, and Firestore transaction semantics.

The corresponding file-level acknowledgement must be added to
`docs/DeveloperGuide.md` during implementation of this slice.

## Out of scope

- Resetting a librarian password; see `ResetLibrarianPassword.md`.
- Granting or transferring manager privilege.
- Public manager bootstrap or emergency recovery automation.
- Librarian/member account profile editing.
- Catalog, loan, reservation, fine, notification, and AI workflows.

## Open questions

None for this implementation slice. The deployment team still needs to record
the concrete bootstrap/recovery procedure before production deployment, but
that procedure is intentionally not implemented as a public manager route.

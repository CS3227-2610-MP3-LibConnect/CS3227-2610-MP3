# FEATURE: Librarian Reservations, Fines, and Notification Management

**Task ID:** `librarian-reservations-fines-notifications`

**Plan order:** Jiali feature 5

**Specification version:** `0.3-draft`

**Status:** `DRAFT — approved policy decisions recorded; full specification and checklist approval still required`

**Owner:** Librarian feature area (Jiali)

## Objective

Give an active librarian a bounded, server-authorized way to inspect
reservations and fines, waive eligible outstanding fines, and send a plain-text
message to a member. Provide the server-side contracts needed for member
reservation, fine-payment, and notification-reading flows, while keeping those
member-facing actions outside this Jiali implementation slice. Make automated
fine and notification side effects retry-safe and consistent with the
reservation handoff implemented by order 4.

Success means that librarians can manage the approved operational views and
mutations without trusting browser-supplied roles, member identities, fine
amounts, statuses, recipients, or record references; members can only access
their own reservation, fine, and notification records through their separate
ownership-checked contracts; and every linked reservation/fine/notification
write is atomic or explicitly reports an operational failure.

## Why this change is required

`Overview.md` requires librarian access to issued fines and librarian-issued
notifications, and describes reservation assignment, pickup expiry, and
notification reference semantics. `PLAN.md` assigns reservations, fines, and
notifications to Jiali feature order 5 after the order-4 loan closure workflow.

The approved order-4 specification already owns the minimal return-time
reservation assignment, 15-day pickup expiry, `RESERVATION_READY` notification,
and fixed lost-book fine creation. The current source contains additional
partial storage methods (`createReservation`, `payFine`, `waiveFine`,
`unreadNotifications`, `pendingReservations`, and `markNotificationRead`), but
there is no approved order-5 route/UI contract and no exposed librarian
reservation, fine, or notification management surface. Existing methods and
tests are integration evidence only; they do not silently define this scope.

## Context reviewed and source traceability

The design is grounded in:

1. `AGENTS.md`, including the server-side authorization and evidence rules.
2. `workflow/README.md` and `workflow/agents/spec-analyst.md`, including the
   staged approval gates and task-artifact requirements.
3. `Overview.md`, especially the Fine, Notification, Reservation, librarian,
   and member requirements.
4. `PLAN.md`, especially the circulation build phase, reservation/notification
   reference rules, Jiali feature order, and approved policy decisions.
5. `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md`
   version `0.4-approved`, which owns loan closure and the minimal reservation
   handoff.
6. `PlanDraft/Specs/LibrarianFeatures/CatalogInventory/LibrarianCatalogInventory.md`,
   which owns catalog/copy deletion guards and circulation status boundaries.
7. Current integration evidence in:
   - `packages/shared/src/domain/records.ts`;
   - `apps/api/src/storage/repositories.ts`;
   - `apps/api/src/storage/workflows.ts`;
   - `apps/api/src/storage/expire-reservations.ts`;
   - `apps/api/src/routes/circulation.ts` and `apps/api/src/server.ts`;
   - `apps/client/src/api/circulation.ts` and
     `apps/client/src/pages/LibrarianCirculationPage.tsx`;
   - `firestore.indexes.json`; and
   - the existing circulation, catalog, auth, and policy tests.

The current implementation is evidence of available integration points, not
authority to widen or reduce this specification.

## Conflict audit and required resolutions

The full-project audit found no product conflict that requires expanding this
Jiali slice, but it found several current-source behaviors that must not be
exposed as the order-5 contract:

| Evidence | Conflict | Resolution in this specification |
|---|---|---|
| `apps/api/src/storage/repositories.ts:createReservation` | The partial method accepts a complete reservation record and requires a librarian, while member reservation creation is owned by Jun Hong. | Treat the method as an internal partial baseline. The member owner must use a member-authorized server workflow that generates the reservation ID, status, and timestamps; Jiali must not add a librarian create route. |
| `apps/api/src/storage/repositories.ts:putNotification` | The partial method accepts `recipientUserId`, reference fields, and the full notification record from its caller. | Do not expose it as a public route. Add dedicated server-owned commands for librarian messages and automatic events; resolve recipients and validate references inside trusted code. |
| `apps/api/src/storage/repositories.ts:getNotification` | The generic read method currently allows an active librarian to read a notification for any member. | Do not use it for librarian notification browsing. Member inbox reads must require recipient ownership; librarians may create messages and inspect only their approved operational views. |
| `apps/api/src/storage/repositories.ts:pendingReservations`, `unreadNotifications`, and `memberActivity` | Existing collection reads are not all bounded for the new list contracts. | Add database-level limits, stable ordering, and opaque cursors before exposing any order-5 list; never fetch an unbounded collection and slice it in memory. |
| `apps/api/src/storage/workflows.ts:waiveFine` | The partial waiver changes fine status but has no notification side effect. | Add the approved `FINE_UPDATED` side effect in the same transaction. |
| `apps/api/src/storage/workflows.ts:reviewClosure` | The approved order-4 lost-fine path creates the fine but not a `FINE_ISSUED` notification. | Apply the approved order-4 amendment and its tests together; order 5 must consume the resulting notification contract and must not create a duplicate. |
| `POST /api/v1/librarian/notifications` draft contract | A server-generated notification ID alone cannot distinguish a retried librarian message from a second intentional message. | Require a bounded `Idempotency-Key` header for librarian message creation and persist/use it in a server-side idempotency guard. Fine waiver and automatic events use their deterministic source IDs. |
| `PLAN.md` hosting decision | The broader plan still leaves final production topology and credentials as a release concern. | Use the approved pattern of team-owned Cloud Scheduler invoking an authenticated backend worker with a dedicated service identity; keep production configuration, credentials, and deployment execution as separate release gates. |

These are implementation constraints and evidence-backed deviations from the
current partial source, not changes to application code during specification
analysis.

## Actors and ownership boundaries

| Actor | Allowed in this slice | Denied in this slice |
|---|---|---|
| Active librarian | Read bounded reservation/fine queues, inspect fine details, waive an outstanding fine, send a message to an eligible member | Changing fine amount/status arbitrarily, editing reservation history, reading another member's notifications, or using a client-supplied recipient/role as authority |
| Active member | Through the separate member contract, create/cancel own reservations, pay own outstanding fines, list/read/mark-read own notifications | Accessing another member's reservation, fine, notification, or activity |
| Inactive account | None | All protected reservation, fine, and notification operations |
| Signed-out requester | None | All protected operations |
| Manager | The same librarian permissions; no extra privilege is required | Bypassing ordinary active-librarian, state, recipient, or ownership checks |
| Trusted scheduler/worker | Run the approved idempotent expiry/overdue processing with server-held configuration | Accepting browser input, changing policy, or acting as a user |

The server resolves the authenticated actor from the session and reloads the
current Firestore user record. `accountType`, `accountStatus`, `isManager`,
`memberId`, `recipientUserId`, `reservationId`, `fineId`, `status`, and any
ownership object supplied by the client are untrusted input and never grant
authorization.

## Scope

### In scope

- Active-librarian authorization, strict request schemas, safe DTOs, and
  deterministic bounded pagination for librarian reservation and fine views.
- Librarian reservation queue/detail reads that expose only the fields needed
  to operate the queue and confirm status/expiry state.
- The reservation lifecycle invariants needed by member creation/cancellation,
  order-4 assignment, and retry-safe pickup expiry.
- Librarian fine listing/detail reads and transactional waiver of an
  `OUTSTANDING` fine.
- The server-owned overdue-fine processing contract, subject to the policy
  decisions recorded in **Resolved decisions approved by the human**.
- Librarian-issued plain-text member messages and server-generated
  `OVERDUE_ALERT`, `FINE_ISSUED`, `FINE_UPDATED`, and existing
  `RESERVATION_READY` notification contracts.
- Documentation and contract tests for the member-owned reservation,
  payment, and notification boundaries needed for integration; member UI and
  member workflow implementation remain outside this Jiali slice.
- Librarian UI for reservation/fine queues, fine waiver confirmation, and
  message composition, including loading, empty, validation, conflict, and
  refresh states.
- Unit, route, Firestore-emulator, concurrency, client-boundary, and
  regression verification mapped to the test matrix below.

### Out of scope

- Member registration, login, profile, or account administration.
- Member-facing reservation creation/cancellation UI, fine-payment UI,
  notification inbox UI, or member loan/activity UI. These are integration
  contracts for the member-owned slice, not Jiali implementation work.
- Loan creation, return/loss reporting, closure review, return disposition,
  or the order-4 minimal reservation handoff.
- Renewal policy or loan due-date changes.
- Arbitrary librarian editing/deletion of reservation records or historical
  fine records.
- External email, SMS, push delivery, payment gateways, bulk messaging, or
  public catalog changes.
- AI/model calls, prompts, tools, model-authorized writes, or notification
  drafting by an AI assistant. That is order 7.
- New dependencies, deployment topology, or production configuration changes
  without separate approval.

## Delivery ownership and acceptance interpretation

This specification records shared boundaries so the two developers do not
create incompatible contracts, but it does not transfer member feature
ownership to Jiali:

| Capability | Owner for implementation | Jiali task responsibility |
|---|---|---|
| Member reservation create/cancel | Jun Hong | Confirm the server contract and consume reservation records safely; do not add a duplicate member workflow. |
| Member fine payment | Jun Hong | Preserve the outstanding/terminal fine state machine and test librarian-waiver races against the approved member contract. |
| Member notification inbox/read state | Jun Hong | Produce notification records that satisfy the shared reference/recipient contract; do not add a librarian inbox for member messages. |
| Librarian reservation/fine views and waiver | Jiali | Implement the approved librarian surface and server authorization. |
| Librarian messages and trusted expiry/overdue workers | Jiali, subject to deployment approval | Implement server-owned commands and retry-safe processing only after policy approval. |

Acceptance criteria A-2, A-4, A-5, A-10, and A-14 are shared integration
contracts owned by the member slice. For this task, Jiali must document and
contract-test the boundary, must not weaken it, and must not mark absent
member-owned implementation as Jiali work complete. The remaining criteria
are the Jiali deliverables unless a human-approved amendment says otherwise.

## Product behavior

### Reservation operations

1. A member-owned reservation request identifies only an ISBN. The server
   resolves the authenticated member, verifies the book exists, verifies that
   the member does not already have an active reservation for that ISBN, and
   creates a server-generated pending reservation with null `copyId` and
   `expiryDate`.
2. A member may cancel only their own pending, unassigned reservation. A
   fulfilled, assigned, expired, or already-cancelled reservation is not
   silently rewritten.
3. The librarian reservation view is a bounded, deterministic queue filtered
   by ISBN and/or status. It shows stable member and book identifiers, status,
   reservation time, assigned copy, and pickup expiry; it does not expose
   account credentials, session data, or unrelated member records.
4. Order 4 remains the owner of assigning the earliest eligible pending
   reservation during confirmed return review. This task may expose the
   resulting queue/status and must preserve that transaction contract.
5. A trusted expiry worker processes assigned pending reservations whose
   `expiryDate` has passed. It re-reads the reservation and copy in a
   transaction, changes the reservation to `EXPIRED`, and releases the copy to
   `AVAILABLE` only when both records still match. Repeated execution is a
   no-op and never assigns the expired copy automatically to the next member.

### Fine operations

1. A librarian may list and inspect fines using bounded status/member/loan
   filters. Responses include only safe fine snapshots and stable references.
2. A librarian may waive an `OUTSTANDING` fine. The server re-reads the fine
   in a transaction, changes only the approved status/timestamp fields, and
   rejects `PAID`, `WAIVED`, missing, or concurrently changed fines without a
   partial write.
3. A member-owned payment operation may change only that member's
   `OUTSTANDING` fine to `PAID`; its contract is recorded here for integration
   but its member UI is outside this slice.
4. Fine amount, currency, reason code, issue time, and related loan/member
   fields are server-owned. No browser request may supply or override them.
5. Lost-book fine creation remains the order-4 transaction and uses the
   approved temporary policy of SGD 20.00 (`2000` minor units) through
   `LOST_BOOK_FINE_MINOR_UNITS`.
6. Overdue-fine issuance is a trusted, idempotent operation. For an active loan
   still unreturned 72 hours after `dueDate`, the server creates one fixed SGD
   5.00 (`500` minor units) fine and one `OVERDUE_ALERT`; there is no daily
   accrual or repeated fine. The deterministic IDs are `overdue-{loanId}` and
   `overdue-alert-{loanId}`.

### Notification operations

1. An active librarian may send a plain-text `LIBRARIAN_MESSAGE` to an active
   member by member ID. The server resolves the recipient user ID, generates
   the notification ID and timestamp, stores a bounded message snapshot, and
   never accepts a client-supplied `recipientUserId`, reference, or status.
2. A member-owned notification inbox lists only that member's notifications
   in deterministic newest-first order and supports marking only that member's
   notifications as read. This API boundary is in scope for integration; its
   member UI is not.
3. The server validates notification references and recipient ownership:

   | Notification type | Required reference |
   |---|---|
   | `OVERDUE_ALERT` | `LOAN` / loan ID belonging to the recipient member |
   | `RESERVATION_READY` | `RESERVATION` / reservation ID belonging to the recipient member |
   | `FINE_ISSUED` or `FINE_UPDATED` | `FINE` / fine ID belonging to the recipient member |
   | `LIBRARIAN_MESSAGE` | null unless a separately approved related context exists |

4. Automatic notifications use deterministic idempotency keys derived from the
   source event and notification type. A retry cannot create duplicates. The
   notification message is a snapshot and is not regenerated from mutable
   catalog/member data.
5. A confirmed lost-book fine from order 4 creates one linked `FINE_ISSUED`
   notification atomically. The notification ID is deterministic from the
   server-created fine ID; order 4 owns the transaction and order 5 must not
   duplicate the side effect.

## Data and state contract

### Reservation invariants

- `PENDING` and unassigned means `copyId = null` and `expiryDate = null`.
- An assigned pending reservation has a non-null copy and a 15-day pickup
  expiry, and its copy is `RESERVED` with the matching reservation ID.
- `FULFILLED` and `EXPIRED` preserve the assigned copy and expiry as historical
  snapshots. `EXPIRED` releases the current copy to `AVAILABLE` and clears the
  copy's live reservation link.
- `CANCELLED` is terminal. Cancellation is allowed only before assignment in
  this release unless a later approved policy says otherwise.
- Reservation assignment, fulfilment, cancellation, and expiry must not leave
  a copy/reservation link inconsistent. All linked writes use a transaction.

### Fine transitions

```text
OUTSTANDING ──member payment──> PAID
OUTSTANDING ──librarian waiver─> WAIVED
PAID and WAIVED are terminal in this slice.
```

Fine records preserve the server-created amount, currency, reason, issued
timestamp, and loan/member snapshot. A waiver records `waivedDateTime`; a
payment records `paidDateTime`. A client cannot set either timestamp.

### Notification state

Notifications start with `read = false`. Only the recipient member may mark a
notification read. Librarian message creation and automatic notification
creation are server-side writes; a browser cannot create a notification by
posting a full record.

## API and integration contract

The exact route names may follow existing project conventions, but the
following operations and payload boundaries are required. Successful
timestamps are ISO strings and the existing error envelope is preserved.

| Operation | Request | Success | Authorization |
|---|---|---|---|
| `GET /api/v1/librarian/reservations` | Bounded `isbn`, `status`, `limit`, opaque cursor | `200 { items, page }` safe reservation DTOs | Active librarian |
| `GET /api/v1/librarian/reservations/:reservationId` | Path ID only | `200 { reservation }` | Active librarian |
| `GET /api/v1/librarian/fines` | Bounded `status`, optional exact `memberId`/`loanId`, `limit`, cursor | `200 { items, page }` safe fine DTOs | Active librarian |
| `GET /api/v1/librarian/fines/:fineId` | Path ID only | `200 { fine }` | Active librarian |
| `POST /api/v1/librarian/fines/:fineId/waive` | Empty strict body | `200 { fine, notification? }` | Active librarian |
| `POST /api/v1/librarian/notifications` | Strict `{ memberId, message }` plus required bounded `Idempotency-Key` header | `201 { notification }`; identical replay returns the original result, key/payload mismatch returns `409` | Active librarian |
| `GET /api/v1/member/reservations` | Bounded status/limit/cursor | Own reservation DTOs | Active member |
| `POST /api/v1/member/reservations` | Strict `{ isbn }` | `201 { reservation }` | Active member; server-owned member ID |
| `POST /api/v1/member/reservations/:reservationId/cancel` | Empty strict body | `200 { reservation }` | Owning active member |
| `GET /api/v1/member/fines` | Bounded status/limit/cursor | Own fine DTOs | Active member |
| `POST /api/v1/member/fines/:fineId/pay` | Empty strict body | `200 { fine }` | Owning active member |
| `GET /api/v1/member/notifications` | Bounded unread/limit/cursor | Own notification DTOs | Active member |
| `POST /api/v1/member/notifications/:notificationId/read` | Empty strict body | `200 { notification }` | Recipient active member |

Automatic overdue processing is a trusted worker/service operation, not a
public route. Librarian messages, fine waivers, member reservation changes,
payments, and notification reads must use strict schemas that reject unknown
fields and client authorization/ownership fields.

Error behavior follows the existing contract: `400` validation, `401`
unauthenticated, `403` inactive/wrong role/foreign ownership, `404` missing
record, `409` current-state or duplicate conflict, and `500` generic service
failure. Rejected writes perform no partial mutation.

## Technical and integration specifications

### Server and storage

- Extend the existing Express → domain/storage architecture. Do not add direct
  browser access to Firestore or a parallel authorization path.
- Reuse active-actor middleware, typed record schemas, `StorageError`, safe
  DTO conventions, Origin protection, and the existing transaction helpers.
- Add bounded query limits and stable cursor ordering for all librarian/member
  lists. The database query itself must be bounded; do not fetch an unbounded
  collection and slice in memory.
- Serialize concurrent active-reservation creation for the same member and
  ISBN using a transaction-visible member/ISBN lock or an equivalent unique
  active-reservation record. A preflight query alone is not sufficient.
- Validate referenced records inside the same transaction where a
  state-changing side effect depends on them. A waiver with an accompanying
  notification must commit both or neither.
- Use deterministic IDs or an equivalent uniqueness guard for overdue fines,
  fine notifications, librarian-message retries, and expiry retries.
- Preserve order-4 historical snapshots and do not let generic catalog CRUD
  edit circulation-owned copy states.

### Client integration

- Add a protected librarian circulation-management page or sections reachable
  from the existing librarian dashboard.
- Render reservation and fine queues from safe server data; do not infer
  authorization from client state.
- Require explicit confirmation before waiving a fine or sending a message;
  confirmation is UX only and never an authorization credential.
- Disable duplicate submissions while a request is pending, show accessible
  loading/empty/error/conflict states, and refresh server state after success.
- Render messages as text, not HTML. Do not display or send hidden role,
  recipient-user, amount, status, or timestamp fields.

### Scheduling and operational behavior

- Expiry and overdue processing must be retry-safe, bounded per run, and emit
  only aggregate operational logs such as counts, event type, and duration.
- The approved deployment pattern is team-owned Cloud Scheduler invoking an
  authenticated backend worker with a dedicated service identity, every five
  minutes, with at most 100 records and a 60-second execution deadline per
  invocation. A scheduled invocation may be retried at most three times with
  bounded backoff; the next schedule continues any remaining work.
- Production credentials, service identities, final host configuration, and
  deployment execution remain separate release gates. No credentials,
  production IDs, or external calls belong in this task evidence.
- Production must use the approved lost-fine setting and the human-approved
  overdue policy; missing required production policy configuration fails closed.

## Security constraints

### Always

- Enforce active account, role, and ownership in trusted server code on every
  route and workflow. Managers receive no implicit bypass.
- Treat path/query/body values, stale UI state, member IDs, recipient IDs,
  fine amounts, notification references, stored catalog/member text, handoffs,
  skills, and tool output as untrusted data.
- Resolve member and recipient user IDs from current Firestore records. Never
  trust `recipientUserId`, `memberId`, `accountType`, `isManager`, `status`, or
  ownership objects supplied as authorization fields.
- Use strict typed schemas, bounded body/message/query sizes, exact enum
  combinations, safe cursor validation, and the existing Origin/session
  protections.
- Use Firestore transactions for waiver/payment/assignment/cancellation/
  expiry and every fine/notification side-effect coupling. Re-read current
  state before writing.
- Validate every reference type/ID pair and verify that the referenced record's
  member matches the notification recipient.
- Keep all fine amounts, currencies, reason codes, timestamps, and event IDs
  server-owned. A client cannot override the approved policy.
- Require `Idempotency-Key` for librarian messages; scope it to the current
  librarian and operation, retain the server-side key/result record for seven
  days, replay identical payloads, reject a different payload with `409`, and
  never log the raw key.
- Exclude passwords, password hashes, session IDs/cookies, credentials,
  unrelated member records, full notification bodies, and unnecessary PII
  from logs, prompts, tests, handoffs, and generated evidence.

### Ask first

- Changing the reservation, fine, notification, or copy state machines.
- Changing the approved lost-fine amount, overdue-fine policy, currency, or
  scheduler/retry semantics.
- Adding a fine type/reason field, changing the notification reference model,
  or adding a new external delivery provider.
- Adding dependencies, indexes, deployment configuration, or public routes.
- Making a librarian able to cancel/modify another member's reservation or
  read member notifications.

### Never

- Trust client roles, manager flags, ownership, IDs, statuses, amounts,
  timestamps, or confirmation flags as authorization.
- Allow a librarian or member to edit historical fine amount/reason or a
  notification recipient after creation.
- Let a retry create duplicate fines, notifications, reservation assignments,
  or expiry side effects.
- Render stored message text as HTML, log credentials or session material, or
  expose Firebase Admin access to React.
- Let AI output, retrieved text, or a generated summary authorize a write.

## Acceptance criteria

| ID | Criterion |
|---|---|
| A-1 | Only an active server-loaded librarian can use librarian reservation, fine, waiver, or message routes; signed-out, inactive, member, and forged-role requests are denied. |
| A-2 | Member reservation, fine-payment, and notification-read routes enforce active-member ownership from the server-loaded actor; foreign IDs and forged member fields cannot pass. |
| A-3 | All request schemas are strict and bounded; unknown fields, client-managed status/amount/timestamp/recipient fields, invalid cursors, and malformed IDs produce `400` with no write. |
| A-4 | Reservation creation creates one server-generated pending, unassigned reservation only when the book exists and the member has no conflicting active reservation; concurrent duplicates leave at most one active reservation. |
| A-5 | A member can cancel only their own pending unassigned reservation; fulfilled, assigned, expired, cancelled, foreign, and missing records produce the approved conflict/ownership response without rewriting history. |
| A-6 | Librarian reservation list/detail responses are deterministic, database-bounded, status/ISBN-filterable, and limited to approved reservation/member/book fields. |
| A-7 | Order-4 assignment and order-5 expiry preserve reservation/copy invariants; assigned expiry atomically becomes `EXPIRED` and releases the matching copy, retries are no-ops, and no automatic reassignment occurs. |
| A-8 | Librarian fine list/detail responses are deterministic, bounded, safe, and expose no credentials, sessions, unrelated user records, or raw Firestore fields. |
| A-9 | A librarian can waive an outstanding fine exactly once; the transaction preserves amount/currency/reason/loan/member snapshots, sets server review metadata, and rejects paid/waived/stale/missing fines without partial writes. |
| A-10 | A member can pay only their own outstanding fine; payment and waiver race so that at most one terminal transition wins and the final record is consistent. |
| A-11 | Overdue fine processing creates one fixed SGD 5.00 fine for an active unreturned loan after 72 hours past `dueDate`, plus one `OVERDUE_ALERT`, with no daily accrual or duplicate on retry. |
| A-12 | A librarian can send a bounded plain-text message to an active member by member ID; the server resolves the recipient, rejects unknown/foreign/inactive targets, requires the approved `Idempotency-Key`, and does not accept a client recipient user ID or reference. |
| A-13 | Automatic and librarian-created notifications satisfy the approved type/reference/recipient contract; lost-fine and waiver side effects are atomic, reference records exist and belong to the recipient, and invalid pairs are rejected without writes. |
| A-14 | Members can list only their own notifications and mark only their own notifications read; concurrent mark-read requests are safe and idempotent. |
| A-15 | Notification and fine side effects use deterministic idempotency guards; retries cannot duplicate `FINE_ISSUED`, `FINE_UPDATED`, `OVERDUE_ALERT`, `RESERVATION_READY`, or librarian-message records, and librarian-message key reuse with a different payload returns `409`. |
| A-16 | The librarian UI provides reservation/fine views, explicit waiver/message confirmation, loading/empty/error/conflict states, accessible status messaging, duplicate-submit protection, and server refresh after success. |
| A-17 | No browser code writes Firestore, sends client authorization fields, renders message HTML, or treats confirmation/client state as authority. |
| A-18 | Expiry/overdue worker runs use the approved five-minute, 100-record, 60-second, three-attempt budget, remain bounded and retry-safe, fail closed when required policy configuration is missing, and log no secrets or unnecessary PII. |
| A-19 | Existing order-4 loan/return/reservation-handoff, catalog, authentication, manager, session, Origin, build, lint, format, and regression checks remain passing. |
| A-20 | Any unresolved policy or cross-spec decision is recorded in the task evidence and is not guessed in application code. |

## Test matrix

| ID | Level | Scenario | Expected evidence |
|---|---|---|---|
| T-1 | Unit | Reservation/fine/notification request schemas, strict fields, bounded IDs/message/cursors | Invalid input returns field errors and does not call storage |
| T-2 | Route | Signed-out, inactive, member, active librarian, manager, and forged actor fields | Correct `401`/`403`/success outcomes; no unauthorized write |
| T-3 | Route | Member foreign reservation/fine/notification IDs and forged member/recipient fields | Ownership denial and no state change |
| T-4 | Emulator | Reservation create for existing/missing book, duplicate member/ISBN, and concurrent duplicates | One valid pending reservation at most; no dangling records |
| T-5 | Emulator | Reservation cancellation across pending, assigned, fulfilled, expired, cancelled, and foreign states | Only own pending/unassigned cancellation succeeds; history preserved |
| T-6 | Route/storage | Librarian reservation filters, deterministic ordering, pagination bounds, safe DTOs | Database-bounded pages; no raw fields or unnecessary PII |
| T-7 | Emulator | Order-4 assignment followed by pickup expiry and repeated worker runs | Matching copy released once; reservation expires; no reassignment/duplicate notification |
| T-8 | Route/storage | Librarian fine list/detail filters, safe serialization, missing/stale IDs | Bounded safe responses and approved errors |
| T-9 | Emulator | Waive outstanding fine, repeat waiver, paid/waived/missing/stale fine | One atomic terminal transition; no amount/reason mutation |
| T-10 | Emulator | Member payment versus librarian waiver race | One terminal winner; no inconsistent timestamps/status |
| T-11 | Emulator | Overdue processing before/after 72-hour cutoff, repeated/concurrent run, missing policy | One fixed SGD 5.00 fine and alert after cutoff; no accrual/duplicates; fail-closed behavior |
| T-12 | Route/storage | Librarian message to active, inactive, missing, foreign, and duplicate member IDs with repeated and mismatched idempotency keys | Server-resolved recipient, bounded text, replayed identical result, `409` mismatch, no client recipient authority |
| T-13 | Emulator | Notification reference type/ID mismatch, missing record, wrong recipient, null librarian message reference | Invalid pair makes no write; valid pair commits |
| T-14 | Emulator | Lost-fine, waiver, overdue, ready, and librarian-message retries | Atomic side effects and deterministic IDs prevent duplicate notifications; key mismatch is rejected |
| T-15 | Route | Member notification list and mark-read ownership/idempotency | Only recipient sees/updates records; repeat read is safe |
| T-16 | Client | Librarian reservation/fine views, waiver/message confirmation, pending/error/conflict/refresh | Accessible UI; no false success or duplicate submit |
| T-17 | Boundary/security | Client source scan, request-body assertions, HTML/text rendering, safe response/log inspection | No direct Firestore, role/recipient/amount authority, HTML injection, secret, or unnecessary-PII leakage |
| T-18 | Scheduler/operational | Five-minute worker schedule, 100-record batch, 60-second deadline, three attempts, timeout/failure, retry logs | Aggregate safe logs; bounded continuation; no unbounded reads or hidden failure |
| T-19 | Index/emulator | Required reservation, fine, notification, and activity query indexes | Local manifest/query tests pass; missing index is recorded as a release gate |
| T-20 | Regression | Existing auth, catalog, manager, circulation, session, Origin, build, lint, and format checks | No regression; deviations recorded |

## Verification commands

At minimum, the implementer must record:

```text
npm run build
npm test
npm run lint
npm run format:check
```

The task must also record focused route/client tests, Firestore emulator
concurrency tests, expiry/overdue worker tests, and index-manifest validation.
If the emulator, Java runtime, scheduler, or deployment environment is
unavailable, the exact block must be recorded rather than marked as passed.

## Risks and trade-offs

- The current shared schema does not distinguish overdue and lost fines with a
  typed reason code. Reusing the current server-owned reason snapshot avoids a
  data-model expansion, but human approval is needed before relying on string
  values for reporting or idempotency.
- The current code has partial reservation/fine/notification methods and a
  worker, but they are not a complete public contract. Exposing them without
  strict DTOs and route tests could leak member data or permit forged writes.
- The approved overdue policy and scheduler budget materially affect member
  charges and notification volume; implementation must match the fixed values
  and production must still pass deployment/configuration gates.
- Listing librarian-visible member identifiers improves operational lookup but
  increases privacy exposure. The implementation should use the minimum stable
  identifiers required by the approved UI and avoid names/email addresses.
- External payment and message delivery are intentionally excluded. In-app
  notifications are a durable record, not proof that a member has read a
  message.

## Resolved decisions approved by the human

1. Overdue processing uses one fixed server-owned SGD 5.00 (`500` minor units)
   per active loan still unreturned 72 hours after `dueDate`, with no daily
   accrual or repeat fine; one `OVERDUE_ALERT` is created atomically.
2. Confirmed lost-book fines create one linked `FINE_ISSUED` notification
   atomically in order 4; waiver creates one linked `FINE_UPDATED` notification
   atomically in order 5.
3. Reservation lists expose exact ISBN/status filters and stable `memberId`
   only; names, emails, user IDs, and free-text search are excluded.
4. Manual messages to inactive members are rejected with `403`; valid automatic
   notifications are persisted for later reactivation and never externally
   delivered.
5. Workers use the team-owned Cloud Scheduler → authenticated backend worker
   pattern, every five minutes, with 100-record batches, a 60-second deadline,
   and at most three bounded retries.
6. Jun Hong owns the API `v1` member reservation, fine-payment, and notification
   routes/UI; Jiali owns only the librarian routes/workers and shared contract
   tests in this slice.
7. Librarian messages require a bounded `Idempotency-Key`; identical retries
   replay the original result, mismatched payload reuse returns `409`, records
   are retained for seven days, and raw keys are never logged.

## Out-of-scope release gates

- No application source, dependency, index deployment, scheduler deployment,
  external message, payment, push, or merge action is authorized by this
  draft.
- Human approval is still required for this full specification, the separate
  checklist and handoff gates, independent review, residual-risk acceptance,
  and merge/release. The seven policy decisions above are approved and must
  not be reinterpreted by implementation.

## Amendments

- 2026-10-21 — Initial analyst draft created from PLAN order 5, `Overview.md`,
  order-4 circulation specification `0.4-approved`, catalog/auth boundaries,
  current source, indexes, and tests. No application source or tests were
  modified. The specification is awaiting human approval.
- 2026-10-21 — Full-project conflict audit recorded the partial-source
  authorization and idempotency mismatches, clarified member/Jiali ownership,
  and added recommended values for overdue fines, notification side effects,
  inactive recipients, and worker hosting. The recommendations were later
  approved as the seven decisions recorded below; no application source was
  modified.
- 2026-10-21 — Human approved all seven policy and ownership decisions: SGD
  5.00 overdue fines after 72 hours with one alert, atomic lost-fine and waiver
  notifications, minimum-PII reservation lists, inactive-recipient handling,
  Cloud Scheduler worker limits, Jun Hong's API `v1` member-slice ownership,
  and seven-day librarian-message idempotency. The order-4 specification was
  amended to version `0.4-approved`; this specification advanced to
  `0.3-draft`. Full specification, checklist, and implementation-handoff
  approval remain separate gates.

# FEATURE: Librarian Loan Creation and Return/Loss Review

**Task ID:** `librarian-loan-closure-review`
**Plan order:** Jiali feature 4
**Specification version:** `0.3-approved`
**Status:** `APPROVED — specification, checklist, and implementation handoff approved`
**Owner:** Librarian feature area (Jiali)

## Objective

Let an active librarian create a loan for an active member, inspect pending
member return/loss reports, and review each report through a server-authorized,
transactional state transition. A confirmed return must produce an explicit
copy disposition (`AVAILABLE`, `DAMAGED`, or, when an eligible pending
reservation exists, `RESERVED`). A confirmed loss must close the loan and mark
the copy `LOST`. A rejected report must restore the loan and copy to the
active/on-loan state.

The feature must preserve the browser-to-Express-to-Firestore boundary,
member ownership, the existing copy/loan state machine, and safe response
serialization. It must not allow a client, librarian UI, model, or retrieved
record to authorize a state change.

## Why this change is required

`Overview.md` and `PLAN.md` require librarian loan creation and return/loss
review, but the current application exposes no circulation route or librarian
circulation page. The repository contains a partial `LibraryWorkflows`
implementation in `apps/api/src/storage/workflows.ts` and typed loan/copy
records in `packages/shared/src/domain/records.ts`; these are integration
evidence only and do not replace this specification. `apps/api/src/server.ts`
currently wires authentication, catalog, and manager routers but not a
circulation router, and `apps/client/src/App.tsx` has no circulation route.

## Sources and assumptions

### Authoritative sources

1. Current user request and explicit approvals.
2. `Overview.md` for product behavior and domain vocabulary.
3. `PLAN.md` for Jiali's ownership, dependency order, and release gates.
4. Existing approved catalog/inventory specification for the catalog/copy
   boundary.
5. Current source and tests as evidence of integration points only.

### Approved decisions

- This slice is the librarian-owned side of circulation. Jun Hong's member
  slice owns the member-facing report action and member loan-history UI. Both
  slices must use the same server-side loan/copy transition contract.
- The initial loan period is fixed at 30 days, as already stated in
  `Overview.md` and `PLAN.md`.
- Pending closure is represented by `Loan.status = PENDING_CLOSE`, with
  `closureReportType = RETURNED | LOST`, and `BookCopy.status = IN_TRANSIT`.
- The minimal reservation handoff needed to produce `RESERVED` on a confirmed
  return belongs in this transaction, but creation, cancellation, expiry
  scheduling, and the complete reservation UI belong to later circulation work.
- A confirmed loss marks the copy `LOST` and creates one `OUTSTANDING` fine in
  the same transaction. The fine amount is a server-owned fixed policy setting
  (for example, `LOST_BOOK_FINE_MINOR_UNITS`); it is never supplied by the
  browser or selected ad hoc by the librarian. The exact production amount is
  deployment policy and must be documented before release. Fine payment,
  waiver, and general fine management remain in order 5.
- The minimal reservation handoff is included: the earliest eligible pending
  reservation receives the copy, a 15-day pickup expiry, and a linked
  `RESERVATION_READY` notification atomically. Reservation creation,
  cancellation, expiry scheduling, and the full notification UI remain in
  order 5.
- Rejected reports clear the pending `closureReportType` and
  `closureReportedDateTime` fields, retain `closureReviewedDateTime`, and set
  server-controlled `closureReviewDecision = REJECTED` and
  `closureReviewedByUserId`. Confirmed reviews set the same fields with
  `CONFIRMED`; reviewer identity is omitted from member-facing DTOs.

## Scope

### In scope

- Active-librarian authorization for loan creation, pending-report listing,
  return preview, and report review.
- Strict request validation and safe DTOs for the librarian circulation API.
- Creating a loan for an active member and a lendable copy.
- The reserved-copy pickup path when the reservation, member, copy, and expiry
  all match.
- Reading a bounded, deterministic pending-review queue containing only the
  fields needed for librarian review.
- Confirming or rejecting a member's `RETURNED` or `LOST` report.
- Choosing `AVAILABLE`, `DAMAGED`, or eligible `RESERVED` disposition for a
  confirmed return.
- Marking a confirmed loss as `LOST` and creating one server-policy-driven
  outstanding fine in the same transaction.
- Transactional concurrency protection across loan, copy, reservation, and
  required notification/fine writes.
- Librarian UI for loan creation and pending-report review, including loading,
  empty, validation, conflict, failure, and refresh states.
- Unit, route, Firestore-emulator, client, authorization, ownership, and
  regression verification mapped to the matrix below.

### Out of scope

- Member registration, login, profile, or account administration.
- Member-facing loan history, borrowing UI, or the member report UI itself;
  the integration contract for that report is in scope.
- Renewal policy and renewal UI.
- Creating, cancelling, or reordering reservations; scheduled reservation
  expiry and pickup reminders.
- Fine payment, fine waiver, overdue-fine calculation, and general fine
  management. Confirmed-loss fine creation is in scope under the fixed
  server-owned policy.
- Librarian notifications beyond the minimal `RESERVATION_READY` side effect
  required when a return is assigned to an eligible pending reservation.
- AI summaries, notification drafting, external metadata, payments, email,
  bulk operations, and direct browser access to Firestore.
- No-JavaScript circulation forms unless separately approved; the React UI and
  JSON API are the required interface for this slice.

## Actors and authorization

| Actor | Allowed behavior | Denied behavior |
|---|---|---|
| Active librarian | Create loans, view the pending review queue, preview eligible return dispositions, confirm/reject closure reports | Acting on behalf of a client-supplied role, changing arbitrary loan/copy fields, reviewing a non-pending loan |
| Active member | Owns the member-side report contract and may report only their own active loan through the member slice | Creating librarian loans, reviewing reports, or reporting another member's loan |
| Inactive account | None | Every protected circulation action |
| Signed-out requester | None | Every protected circulation action |
| Manager | No additional privilege is required for this feature | Manager status must not bypass ordinary state/ownership checks |

The server must resolve the authenticated actor from the session and current
Firestore user record on every request. `accountType`, `accountStatus`,
`isManager`, `memberId`, `loanId`, `copyId`, and confirmation fields supplied
by the client are not authorization inputs.

## Domain and state contract

### Loan creation

1. The server accepts only a target `memberId` and `copyId`; it generates the
   `loanId`, timestamps, and due date.
2. The member must resolve to an active `MEMBER` account.
3. The copy must resolve to an existing book copy whose parent book exists.
4. `AVAILABLE` copies may be loaned to the requested active member.
5. `RESERVED` copies may be loaned only when their linked reservation is
   `PENDING`, assigned to that exact copy and member, linked to the same ISBN,
   and not expired. The transaction marks the reservation `FULFILLED`.
6. Any other copy status, missing parent/member/reservation, expired pickup,
   duplicate loan, or mismatched reservation causes a conflict/validation
   response and no partial write.
7. A successful loan creates `ACTIVE` with `borrowDateTime = now`,
   `dueDate = now + 30 days`, `returnDateTime = null`, no closure report,
   and `isRenewed = false`; the copy becomes `ON_LOAN`.

### Member report integration

The member-owned report action must atomically require the member to own the
loan, require `ACTIVE`/`ON_LOAN`, set the loan to `PENDING_CLOSE` with exactly
one report type, and set the copy to `IN_TRANSIT`. A pending copy is not
lendable. This specification tests the contract and librarian handling of
that state; it does not authorize the implementer to build the member UI.

### Librarian review transitions

| Current state | Decision | Required result |
|---|---|---|
| `PENDING_CLOSE` + `RETURNED` / `IN_TRANSIT` | Reject | Loan `ACTIVE`, report fields cleared, review time set; copy `ON_LOAN` |
| `PENDING_CLOSE` + `RETURNED` / `IN_TRANSIT` | Confirm + `AVAILABLE` | Loan `CLOSED_RETURNED`, return/review times set; copy `AVAILABLE` |
| `PENDING_CLOSE` + `RETURNED` / `IN_TRANSIT` | Confirm + `DAMAGED` | Loan `CLOSED_RETURNED`, return/review times set; copy `DAMAGED` |
| `PENDING_CLOSE` + `RETURNED` / `IN_TRANSIT` | Confirm + `RESERVED` | Same closure; earliest eligible pending reservation receives the copy, 15-day pickup expiry, and a linked `RESERVATION_READY` notification |
| `PENDING_CLOSE` + `LOST` / `IN_TRANSIT` | Reject | Loan `ACTIVE`, report fields cleared, review time set; copy `ON_LOAN` |
| `PENDING_CLOSE` + `LOST` / `IN_TRANSIT` | Confirm | Loan `CLOSED_LOST`, review time and server reviewer metadata set; copy `LOST`; one server-policy-driven fine is created |

Every review re-reads all affected records inside one Firestore transaction.
The transaction must reject stale state, missing records, an invalid
disposition, a missing eligible reservation, or a mismatched copy without
writing any affected record. Retried transaction callbacks must not generate
duplicate loans, fines, or notifications.

## API and integration contract

The exact route names may follow existing project conventions, but the
following operations and payload boundaries are required:

| Operation | Request | Success | Authorization |
|---|---|---|---|
| `POST /api/v1/librarian/loans` | Strict JSON `{ memberId, copyId }` | `201` with safe loan/copy summary | Active librarian |
| `GET /api/v1/librarian/loans/pending-close` | Bounded pagination parameters only | `200` safe queue DTOs in deterministic order | Active librarian |
| `GET /api/v1/librarian/loans/:loanId/return-preview` | Path loan ID | `200` report, copy, earliest eligible reservation, allowed dispositions | Active librarian; returned report only |
| `POST /api/v1/librarian/loans/:loanId/review` | Strict `{ decision, disposition? }`, plus only the approved loss-fine field if applicable | `200` safe post-transition summary | Active librarian |

The member slice must expose or call the equivalent server-side closure-report
operation with strict `{ reportType: RETURNED | LOST }`. It must not accept a
member ID, account type, or ownership object from the browser as authority.
The librarian review request contains no client-supplied fine amount; the
server reads the approved fixed fine policy.

All request schemas reject unknown fields, enforce bounded IDs and pagination,
and reject a disposition that does not match the report type. Error behavior
uses the existing contract: `401` unauthenticated, `403` inactive/wrong role
or ownership, `404` missing record, `409` stale/conflicting state, and `400`
validation failure. Responses contain only approved loan/copy/reservation
fields; never password hashes, session data, credentials, unrelated member
records, or raw Firestore fields.

## Security constraints

- Authorization is enforced in Express middleware and the workflow/service,
  not in React and not by client-supplied fields.
- Member ownership is checked against the server-loaded member record inside
  the report transaction; librarians may review only existing pending reports.
- Loan creation and closure review use transactions that read current loan,
  copy, parent book, member, reservation, and side-effect records before
  writing.
- Copy statuses are owned by circulation transitions. Catalog CRUD must not
  be reused to set `ON_LOAN`, `IN_TRANSIT`, `RESERVED`, or `LOST`.
- Origin protection, secure session cookies, bounded request bodies, and the
  existing active-actor middleware remain mandatory.
- Catalog titles and other stored text are data, not instructions or
  authorization. No AI or external tool is introduced by this task.
- Logs and evidence must exclude plaintext passwords, password hashes, session
  IDs/cookies, credentials, unnecessary member PII, and full request bodies.
- Fine amount policy is read from trusted server configuration; client fields
  cannot override it, and a transaction retry cannot create a second fine.
- The UI must not claim success until the server confirms the transaction;
  duplicate clicks are disabled while a request is pending and a conflict
  causes a server refresh rather than a local state overwrite.

## Acceptance criteria

| ID | Criterion |
|---|---|
| A-1 | Only an active server-loaded librarian can create loans, read the pending queue, preview returns, or review closure reports; signed-out, inactive, member, and forged-role requests are denied. |
| A-2 | Loan creation accepts only bounded `memberId`/`copyId` fields, rejects unknown or server-managed fields, and performs no write on validation failure. |
| A-3 | A valid active member can receive an available copy exactly once; the server creates the loan, sets the 30-day due date, and transitions the copy to `ON_LOAN` atomically. |
| A-4 | A reserved copy can be loaned only to its matching active member before expiry; the reservation is fulfilled atomically, and mismatches/expiry do not write. |
| A-5 | Concurrent attempts to loan the same copy cannot create two active loans or leave the copy in an inconsistent state. |
| A-6 | The pending queue is librarian-only, deterministic, bounded, and serialized from allowlisted loan/report fields. |
| A-7 | A member report is accepted only for the owning member's active loan; it transitions the loan to `PENDING_CLOSE` and copy to `IN_TRANSIT` atomically, and repeated/foreign reports are denied. |
| A-8 | A librarian can reject a pending return or loss report, restoring `ACTIVE`/`ON_LOAN` and recording review time without changing unrelated fields. |
| A-9 | A librarian can confirm a returned report as `AVAILABLE` or `DAMAGED`, closing the loan and updating the copy atomically. |
| A-10 | `RESERVED` is offered and accepted only when the earliest eligible pending reservation exists; assignment sets the 15-day expiry and creates a correctly linked ready notification in the same transaction. |
| A-11 | A librarian can confirm a lost report, closing the loan, marking the copy `LOST`, and creating exactly one server-policy-driven `OUTSTANDING` fine atomically. |
| A-12 | Stale, already-reviewed, missing, mismatched, or invalid-state requests return the approved error without partial writes. |
| A-13 | The librarian UI uses the protected route, renders safe server data, requires explicit confirmation for review, handles loading/empty/validation/conflict/error states, and refreshes after success. |
| A-14 | No browser code writes Firestore or sends client role, ownership, status, or account fields as authorization. |
| A-15 | Existing authentication, catalog/inventory, manager, session, Origin, build, and regression checks remain passing. |

## Test matrix

| ID | Level | Scenario | Expected evidence |
|---|---|---|---|
| T-1 | Unit | Strict create/report/review schemas, bounded IDs, unknown fields, invalid enum combinations | `400`; workflow/storage not called |
| T-2 | Route | Signed-out, inactive, member, active librarian, forged actor fields | Only active librarian succeeds on librarian routes |
| T-3 | Unit | Available-copy loan and 30-day due-date calculation | Exact `ACTIVE` loan and `ON_LOAN` copy |
| T-4 | Integration | Reserved-copy matching member, wrong member, expired reservation, missing reservation | One valid fulfilment; all invalid paths no-write |
| T-5 | Emulator | Concurrent loan attempts for one copy | At most one committed active loan; final copy is `ON_LOAN` |
| T-6 | Route | Queue ordering, pagination bounds, safe-field serialization | Deterministic queue; no secrets/raw fields |
| T-7 | Integration | Member reports own active return/loss, foreign loan, repeated report, wrong copy state | Correct ownership/error and atomic `PENDING_CLOSE`/`IN_TRANSIT` |
| T-8 | Route/storage | Librarian rejects returned and lost reports | `ACTIVE`/`ON_LOAN`; review time; no fine/notification side effect |
| T-9 | Emulator | Confirm return as `AVAILABLE` and `DAMAGED` | `CLOSED_RETURNED` and matching copy state in one transaction |
| T-10 | Emulator | Confirm return as `RESERVED` with/without eligible pending reservation | Earliest reservation only; 15-day expiry and linked notification; no-write on absent queue |
| T-11 | Emulator | Confirm loss with trusted fixed fine policy and transaction retry | `CLOSED_LOST`/`LOST`; exactly one matching outstanding fine; no client override or duplicate side effect |
| T-12 | Emulator | Concurrent review/review and review/catalog deletion/status races | One winner; no inconsistent loan/copy/reservation state |
| T-13 | Route | Missing loan/copy/member/book, stale status, malformed path, disallowed Origin | Existing `404`/`409`/`400`/Origin contract |
| T-14 | Client | Librarian page access, queue, explicit confirmation, success/failure/refresh | No false success; accessible status/error messaging |
| T-15 | Boundary | Client source scan and request-body assertions | No direct Firestore import or authorization fields |
| T-16 | Regression | Existing auth, catalog, manager, session, Origin, build, lint, format tests | No regression |
| T-17 | Security/evidence | Secret and unnecessary-PII scan; transaction callback inspection | No secret leakage; no model/tool/external side effect |

Required commands and environment evidence will be recorded by the implementer
in the task report. Emulator-backed concurrency is a release gate; if the
Firestore emulator cannot run, the implementation must record the exact
environment block rather than marking the gate passed.

## Risks and tradeoffs

- The current repository already has unexposed workflow methods. Wiring them
  without schema, route, transaction, and safe-DTO tests could turn an
  implementation detail into an accidental public contract.
- The loan/copy/reservation/fine/notification changes span multiple records;
  Firestore transaction limits and query/index requirements must be verified
  before implementation.
- The current Loan record needs two server-controlled review metadata fields
  (`closureReviewDecision` and `closureReviewedByUserId`) to preserve the last
  review decision without introducing a separate history collection. A full
  append-only audit history remains a later cross-cutting improvement.
- Searchable member identifiers and book titles in a librarian queue can expose
  more member information than needed. The response should prefer stable
  member ID and loan/copy metadata, with names only if human approval confirms
  the usability need.

## Resolved decisions

The human approved the following recommendations in chat on 2026-10-21:

1. Confirmed lost reports create one outstanding fine using a fixed,
   server-owned policy. The temporary approved policy is SGD 20.00 (`2000`
   minor units), configured through `LOST_BOOK_FINE_MINOR_UNITS`; the browser
   and librarian cannot override it.
2. Minimal reservation assignment, 15-day expiry, and the linked ready
   notification are included in this slice; full reservation/notification
   management remains order 5.
3. Rejected reports clear pending fields and record the last review decision
   and reviewing librarian in server-controlled metadata rather than adding a
   separate history collection.

## Out-of-scope release gates

- No AI model, tool, prompt, or external service is introduced; AI assistant
  security gates apply only when the later AI feature is designed.
- Human approval is required for this specification, the later checklist and
  implementation handoff, independent review, residual-risk acceptance, and
  merge/release.

## Amendments

- 2026-10-21 — Initial analyst draft created from plan order 4, `Overview.md`,
  the approved catalog/inventory boundary, current typed records, and the
  unexposed workflow baseline. No application source or tests were modified.
- 2026-10-21 — Human approved the specification recommendations: fixed
  server-owned lost-book fine creation, minimal reservation handoff, and
  server-controlled review-decision metadata. Version advanced to
  `0.2-approved`; checklist and implementation handoff remain separate gates.
- 2026-10-21 — Human approved the implementation checklist and handoff in the
  implementation task. Implementation may proceed within the approved scope.
- 2026-10-21 — Human approved the temporary lost-book fine policy of SGD 20.00
  (`2000` minor units). The trusted server configuration, tests, and task
  evidence must record this value; no browser or librarian override is added.
  Specification version advanced to `0.3-approved`.

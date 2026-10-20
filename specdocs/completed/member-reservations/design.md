# Member Reservations

## Description

Allow a signed-in member to make a reservation from a book detail page when
the title has no available copies. If the member has a pending reservation
for the title, the action changes to cancellation. Reservation creation
requires no confirmation; cancellation requires confirmation.

## Purpose

Let members join the reservation queue for a title they cannot currently
borrow, and let them cancel their own pending reservation while keeping
reservation and copy records consistent.

## Why this change is required

The member-facing behavior is specified in
`PlanDraft/Specs/Member/CreateReservation.md`. The domain schema already
defines reservation status, ownership, assigned copy, and expiry fields in
`packages/shared/src/domain/records.ts`.

The repository has a partial `createReservation` method in
`apps/api/src/storage/repositories.ts`, but that method is librarian-gated
and does not enforce member eligibility, copy availability, or duplicate
pending reservations. There is no member reservation API route or client API,
and `apps/client/src/pages/MemberBookDetail.tsx` currently displays
availability without a reservation action. Members therefore cannot reserve
or cancel a title through the member application.

Librarian return processing already assigns pending reservations, marks the
copy `RESERVED`, and creates a ready notification in
`apps/api/src/storage/workflows.ts`. Reservation expiry is also implemented
there. This feature adds member-side creation and cancellation while retaining
those librarian-side responsibilities.

## Purpose and capabilities

### Added

- A member-only **Make Reservation** action on book detail when the title has
  no `AVAILABLE` copies, including titles with no physical copies.
- A member-only **Cancel Reservation** action when that member has a pending
  reservation for the title.
- Server-side creation eligibility, duplicate prevention, ownership checks,
  and transactional cancellation of an assigned reservation and its copy.
- Success, error, loading, and stale-state feedback for both operations.

### Modified

- The book detail page gains the reservation action and displays state from
  the server.
- Member reservation creation and cancellation are added to the API and
  storage workflow.
- Existing reservation creation, assignment, expiry, and copy status fields
  are preserved. No reservation schema change is intended.

The reservation cancellation operation should be reusable by the My
Reservations page, but implementing that page's list UI is outside this
design. Its requirements are in `PlanDraft/Specs/Member/MyReservations.md`.

## Product specifications

### Reservation action and eligibility

- The action is available only to an authenticated member on a valid book
  detail page.
- If the member has a `PENDING` reservation for the book's ISBN, show
  **Cancel Reservation** regardless of current copy availability or whether
  a copy has been assigned.
- Otherwise, show **Make Reservation** and enable it only when the book
  exists and no copy has status `AVAILABLE`. A title with zero copies is
  eligible.
- Copies in `ON_LOAN`, `RESERVED`, `IN_TRANSIT`, `DAMAGED`, or `LOST` status
  are not available to borrow.
- A `FULFILLED`, `CANCELLED`, or `EXPIRED` reservation does not prevent a
  new reservation when the title is eligible.
- Availability and the member's pending reservation state are loaded from
  server data. The server rechecks eligibility when an action is submitted.

### Create a reservation

1. Selecting **Make Reservation** submits a request without a confirmation
   dialog.
2. The server derives the member from the authenticated session and verifies
   the book exists, no copy is `AVAILABLE`, and the member has no pending
   reservation for that ISBN.
3. Create a reservation with `memberId` set to the authenticated member,
   `isbn` set to the selected book, `status` set to `PENDING`,
   `reservationDateTime` set by the server, and `copyId` and `expiryDate`
   unset/null.
4. A member cannot have more than one pending reservation for the same ISBN,
   including under concurrent requests.
5. On success, show confirmation and update the action to
   **Cancel Reservation**. Do not assign a copy or create a
   `RESERVATION_READY` notification during member creation.

### Cancel a reservation

1. Selecting **Cancel Reservation** for a pending reservation opens a
   confirmation dialog identifying the book. Dismissing the dialog makes no
   change.
2. After confirmation, the server verifies the reservation belongs to the
   authenticated member and remains `PENDING`.
3. On success, set the reservation status to `CANCELLED` and update its
   `updatedAt` time if that field is used by the record. The member may create
   another reservation when the title is eligible.
4. If the reservation has an assigned copy, release the copy from `RESERVED`
   to `AVAILABLE` in the same transaction and clear the copy's
   `reservationId`.
5. **User decision:** Keep the cancelled reservation's `copyId` and
   `expiryDate` as historical assignment data after releasing the copy.
6. Do not automatically assign the released copy to another reservation.
   Assignment remains part of the librarian circulation workflow.

### Feedback and errors

- Disable the relevant action while its request is in progress to prevent
  duplicate submissions.
- On success, show confirmation and refresh the displayed availability and
  reservation state.
- On failure, show an error, keep the last server-confirmed state, and allow
  retry when appropriate.
- If creation fails because a copy became available or a pending reservation
  already exists, refresh the state and explain why the request did not
  complete.
- If cancellation fails because the reservation is no longer pending,
  refresh the state and explain that it cannot be cancelled.
- Do not display another member's reservation state as a fallback.

## Acceptance criteria

1. A signed-in member can make a reservation for an existing title when no
   copy is `AVAILABLE`, including a title with zero copies.
2. When the member has a pending reservation for a title, the detail page
   shows **Cancel Reservation**, even if availability has changed or a copy
   is assigned.
3. A member cannot create two pending reservations for one ISBN. Concurrent
   requests cannot bypass this rule.
4. A title with an `AVAILABLE` copy cannot be newly reserved. The server
   rechecks availability when creating the reservation, not only when the
   page loads.
5. A successful creation stores the authenticated member ID, selected ISBN,
   `PENDING` status, server creation timestamp, and null/unset copy and expiry
   fields. It does not assign a copy or create a ready notification.
6. Creating a reservation does not require confirmation. Success feedback
   appears and the action updates to **Cancel Reservation**.
7. Cancellation requires confirmation. Dismissing the confirmation leaves
   the reservation and assigned copy unchanged.
8. Only the owner can cancel a reservation, and cancellation is accepted
   only while status is `PENDING`.
9. Cancelling an unassigned pending reservation marks it `CANCELLED` without
   changing any copy.
10. Cancelling an assigned pending reservation marks it `CANCELLED`, changes
    its linked copy from `RESERVED` to `AVAILABLE`, and clears the copy's
    `reservationId` atomically. The cancelled reservation retains its
    `copyId` and `expiryDate` as history.
11. Cancellation does not automatically assign the released copy to another
    pending reservation.
12. Signed-out users, librarians, and members acting on another member's
    reservation cannot use member reservation operations.
13. Duplicate in-flight submissions are prevented in the UI. On server
    errors, the UI retains confirmed state, shows actionable feedback, and
    refreshes when an eligibility conflict makes the displayed state stale.

## Technical specifications

The project uses React with TypeScript, an Express API, Firestore accessed
through trusted server code, and cookie-backed sessions. The browser does not
write application records directly.

### Client

- Add reservation API calls under `apps/client/src/api`, using the shared
  `apiRequest` helper and cookie credentials behavior.
- Extend `MemberBookDetail` to load the member's pending reservation state
  alongside the existing book, copy, and availability response.
- Keep the book detail display available while reservation state loads, but
  prevent a new reservation action until eligibility and the member's pending
  state are known.
- Render the action state from server-confirmed data. Disable it during
  requests and refresh book and reservation data after success or stale-state
  errors.
- Use an accessible confirmation dialog for cancellation, with keyboard
  operation, focus handling, and an announced result/error state.

### API and authorization

Mount member reservation routes under `/api/v1/member` and require an active
member actor. Resolve the member from the session; reject client-supplied
owner identifiers.

Proposed API contract:

| Method and path | Behavior |
|---|---|
| `GET /api/v1/member/reservations/by-isbn/:isbn` | Return the authenticated member's pending reservation for the title, or `null` if none exists. |
| `POST /api/v1/member/reservations` with `{ isbn }` | Create an eligible pending reservation and return it. |
| `DELETE /api/v1/member/reservations/:reservationId` | Cancel the member's pending reservation; return `204` on success. |

These paths and response envelopes are proposals based on existing `/api/v1`
patterns. The create/cancel operations should be factored so the My
Reservations page can call the same cancellation behavior without duplicating
state-transition logic.

The existing `LibraryRepository.createReservation` method is librarian-only.
**Proposal:** Implement member eligibility and state transitions in a
member-specific workflow or a clearly separated member operation rather than
weakening that librarian gate. Continue using the existing API validation
and error envelope conventions.

### Storage and state transitions

- For creation, verify the book exists, query for copies with the selected
  ISBN and `AVAILABLE` status, and query for an existing `PENDING`
  reservation by the actor's member ID and ISBN.
- Perform eligibility reads and reservation creation in a Firestore
  transaction. Use a transaction conflict/serialization strategy so
  concurrent requests for the same member/title cannot both create a pending
  reservation. A concurrently borrowed last available copy must be
  re-evaluated before committing.
- For cancellation, read the reservation and verify `memberId` and `PENDING`
  status. If it has a `copyId`, read and verify that copy is `RESERVED` and
  linked to the reservation before atomically setting the reservation to
  `CANCELLED` and the copy to `AVAILABLE` with `reservationId` cleared.
- Preserve `copyId` and `expiryDate` on the cancelled reservation as
  historical data. Copy assignment state is represented by the live copy's
  status and `reservationId`; a cancelled reservation is not active even if
  its historical assignment fields remain populated.
- If the reservation/copy linkage is inconsistent or status changed during
  the request, fail without partially updating either record and return a
  conflict that the client can present safely.
- Add composite indexes required by the reservation lookup and copy
  availability query to `firestore.indexes.json` based on actual query
  shapes. The current index file does not define reservation indexes.

### Integration with librarian circulation

- Librarian return processing selects the earliest pending reservation,
  assigns a copy, sets the copy to `RESERVED`, sets `copyId` and `expiryDate`,
  and creates a linked `RESERVATION_READY` notification. Those actions remain
  owned by the librarian workflow.
- Member cancellation of an assigned reservation releases its copy to
  `AVAILABLE` and does not claim the next queue entry. The next assignment
  occurs through the existing librarian return workflow.
- Reservation expiry remains 15 days after assignment, returns the copy to
  `AVAILABLE`, and does not automatically assign the next reservation.
- Coordinate the `RESERVED` to `AVAILABLE` transition with the librarian
  feature owner so cancellation, pickup, and expiry transactions preserve the
  copy/reservation link invariant.

### Verification

- API tests cover eligibility, ownership, role restrictions, duplicate and
  concurrent creation, cancellation state transitions, and stale-state
  conflicts.
- Firestore Emulator verification covers zero-copy and unavailable titles,
  rejecting a title with an available copy, concurrent duplicate requests,
  cancellation before and after assignment, retained historical fields,
  transaction atomicity, and required indexes.
- Client tests cover action enablement and toggling, confirmation cancel and
  confirm paths, success/error states, in-flight duplicate prevention, and
  refresh after stale-state failures.

## Out of scope

- The My Reservations profile list UI, filters, and history presentation.
- Librarian reservation queue ordering, assignment, ready notifications, and
  expiry processing.
- Creating or editing catalog books and copies.
- Direct browser writes to Firestore.

## Risks and tradeoffs

- Reservation creation must remain correct under concurrent borrowing and
  duplicate member requests. Transaction query and write behavior should be
  verified against Firestore Emulator, not only mocked storage tests.
- Cancelling an assigned reservation changes a copy status also used by
  librarian pickup and expiry workflows. Incorrect linkage checks can make a
  reserved copy lendable or leave it unavailable after cancellation.
- Retaining `copyId` and `expiryDate` on a cancelled reservation preserves
  assignment history, but readers must use reservation status and the copy's
  current `reservationId` to determine whether the assignment is active.
- The proposal to place member operations in a member-specific workflow may
  require integrating with existing repository methods without weakening
  role checks.

## Context reviewed

- `AGENTS.md` — project context and team ownership boundaries.
- `Overview.md` — reservation fields, statuses, and expiry rules.
- `PLAN.md` — circulation module sequence and librarian/member boundaries.
- `PlanDraft/Developer_Responsibilities/junhong.md` — member reservations are
  Jun Hong's responsibility.
- `PlanDraft/Developer_Responsibilities/jiali.md` — librarian assignment and
  circulation state transitions are Jiali's responsibility.
- `PlanDraft/Specs/Member/CreateReservation.md` — book detail creation and
  cancellation requirements.
- `PlanDraft/Specs/Member/MyReservations.md` — separate member list and
  cancellation requirement.
- `PlanDraft/Specs/Member/ProfilePage.md` — profile navigation and current
  My Reservations route context.
- `packages/shared/src/domain/records.ts` — reservation record schema.
- `apps/api/src/storage/repositories.ts` — current librarian-gated create
  method and pending reservation query.
- `apps/api/src/storage/workflows.ts` — librarian assignment, pickup, and
  expiry transactions.
- `apps/api/src/server.ts` — API route mounts and active-actor middleware.
- `apps/client/src/App.tsx` — current book detail and member profile routes.
- `apps/client/src/pages/MemberBookDetail.tsx` — existing availability UI.
- `firestore.indexes.json` — currently no reservation-specific indexes.

Source code was available and inspected. No project files were changed during
design review. The assigned-copy cancellation decision is approved: retain
`copyId` and `expiryDate` on the cancelled reservation as historical data.

# Create and Cancel Reservations

## Purpose

Let a signed-in member join the reservation queue for a catalog title when no
copy is currently available to borrow, and cancel their own pending
reservation.

## Book detail action

- Add a **Make Reservation** action to the member book detail page.
- Enable it when the book exists and none of its copies has status
  `AVAILABLE`. Copies in any other status, including `ON_LOAN`, `RESERVED`,
  `IN_TRANSIT`, `DAMAGED`, or `LOST`, are not borrowable. A title with no
  copies is eligible for reservation.
- If the member already has a `PENDING` reservation for that title, show
  **Cancel Reservation** instead. This includes a pending reservation that
  has been assigned a copy; the member must not create a second pending
  reservation for the same title.
- If the member has a `FULFILLED`, `CANCELLED`, or `EXPIRED` reservation,
  they may create a new reservation when the book is eligible.
- Show the current availability and the member's pending reservation state
  from server data. Recheck both when the member submits an action because
  availability or reservation state may have changed.

## Create a reservation

1. Selecting **Make Reservation** submits a request for the displayed book;
   no confirmation dialog is required.
2. The server identifies the member from the authenticated session and
   verifies that the book exists, no copy is `AVAILABLE`, and the member has
   no existing `PENDING` reservation for that title.
3. On success, create a reservation with `memberId` set to the authenticated
   member, `isbn` set to the selected book, `copyId` and `expiryDate` unset,
   `reservationDateTime` set to the creation time, and `status` set to
   `PENDING`. Show a success message and update the action to
   **Cancel Reservation**.
4. Reservation creation must be protected against duplicate submissions and
   concurrent requests so the same member cannot create multiple pending
   reservations for one title.

## Cancel a reservation

1. Selecting **Cancel Reservation** for a `PENDING` reservation opens a
   confirmation dialog identifying the book. Cancelling the dialog leaves
   the reservation unchanged.
2. On confirmation, submit a cancellation for that reservation. The server
   verifies that it belongs to the authenticated member and is still
   `PENDING`.
3. On success, set its status to `CANCELLED` and show a success message. The
   member may reserve the title again if it remains eligible.
4. If a copy has already been assigned to the reservation, cancellation must
   release that copy from `RESERVED` to `AVAILABLE` in the same operation.
   Do not automatically assign it to another reservation; subsequent
   reservation assignment follows the librarian circulation workflow.

## Request feedback and errors

- Disable the relevant action while its request is in progress to prevent
  repeated create or cancel submissions.
- After success, refresh the book availability and reservation state shown
  on the page.
- If a request fails, show an error message, keep the server-confirmed state
  on screen, and allow the member to retry when appropriate.
- If creation is rejected because a copy became available or a pending
  reservation already exists, refresh the displayed state and explain why
  the request could not be completed.
- If cancellation is rejected because the reservation is no longer pending,
  refresh its state and explain that it could not be cancelled.

## Access and scope

- Only authenticated members may create or cancel reservations through this
  flow. The server derives the member identity from the session; client-side
  checks do not replace server authorization.
- Members may view or change only their own reservation records.
- Reservation queue ordering, assignment of copies, reservation-ready
  notifications, and expiry processing belong to the librarian and
  reservation-processing workflows. An assigned reservation expires 15 days
  after assignment; expiry returns its copy to `AVAILABLE` and does not
  automatically assign the next reservation.

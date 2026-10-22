# My Reservations

## Purpose

Let a signed-in member review their reservations and cancel a reservation that
is still pending. Creating a reservation from a book's detail page is
specified in [CreateReservation](CreateReservation.md).

## Reservation list

- The My Reservations section is available from the member profile and is
  accessible to signed-in members only.
- Show the member's `PENDING` reservations by default. Let the member switch
  to a history view containing `FULFILLED`, `CANCELLED`, and `EXPIRED`
  reservations.
- Display reservations newest first by `reservationDateTime`.
- Each reservation card shows the reserved book title, reservation status,
  and creation date.
- A reservation with status `PENDING` and no assigned `copyId` is waiting
  for a copy. A `PENDING` reservation with an assigned `copyId` and
  `expiryDate` is ready for pickup; distinguish this state from a reservation
  still waiting in the queue and display its pickup expiry date.
- If the selected view has no reservations, show a clear empty state. Provide
  loading and retryable error states when reservations cannot be loaded.

## Cancel a pending reservation

1. Show **Cancel Reservation** only for a reservation with status `PENDING`.
   This applies whether the reservation is waiting for a copy or has an
   assigned copy ready for pickup. Do not offer cancellation for
   `FULFILLED`, `CANCELLED`, or `EXPIRED` reservations.
2. When the member selects **Cancel Reservation**, show a confirmation dialog
   identifying the reserved book. Cancelling the dialog leaves the
   reservation and any assigned copy unchanged.
3. After confirmation, submit a cancellation for that reservation. The
   server verifies that it belongs to the authenticated member and is still
   `PENDING`.
4. On success, set the reservation status to `CANCELLED`. If a copy was
   assigned, release it from `RESERVED` to `AVAILABLE` as part of the same
   operation. Do not automatically assign the released copy to another
   reservation; subsequent assignment follows the librarian circulation
   workflow.
5. Show a success message, refresh the reservation and copy state, and remove
   the reservation from the default pending view. It appears in the history
   view with status `CANCELLED`.

## Feedback and access

- While cancellation is being submitted, prevent duplicate submissions for
  that reservation and indicate that the request is in progress.
- If loading the list fails, show an error and allow retry. Do not show
  another member's reservations as a fallback.
- If cancellation fails, show an error, retain the last server-confirmed
  state, and allow retry when appropriate.
- If the server rejects cancellation because the reservation is no longer
  `PENDING`, refresh its state and explain that it can no longer be
  cancelled.
- The server derives member identity from the authenticated session and
  returns or changes only reservations owned by that member. Client-side
  filtering does not replace server authorization.

## Scope

- Reservation creation from the book detail page is specified in
  [CreateReservation](CreateReservation.md).
- Queue ordering, copy assignment, reservation-ready notifications, and
  expiry processing are handled by the librarian and reservation-processing
  workflows.
- An assigned reservation expires 15 days after assignment. Expiry releases
  the reserved copy to `AVAILABLE` and does not automatically assign it to
  the next reservation.
- Members cannot edit reservation details or change a reservation's status
  directly.

# My Fines

## Purpose

Let a signed-in member review fines owed by or previously settled by them, and
mark an outstanding fine as paid through the application's simulated payment
flow.

## Fine list

- The My Fines section is available from the member profile and is accessible
  to signed-in members only.
- Show the member's `OUTSTANDING` fines by default. Let the member switch to a
  history view containing both `PAID` and `WAIVED` fines, with each fine's
  status clearly shown.
- Display each fine as a card containing its book title, reason, issue date,
  amount, and status. Format the amount from `amountMinorUnits` using the
  record's currency (`SGD`); do not use floating-point arithmetic for money.
- Show **Pay Fine** only for an `OUTSTANDING` fine. `PAID` and `WAIVED` fines
  cannot be paid again.
- If the selected status has no fines, show a clear empty state. Provide
  loading and retryable error states when the list cannot be retrieved.

## Pay an outstanding fine

1. When the member selects **Pay Fine**, open a confirmation dialog showing
   the book title, fine reason, amount and currency, and a **Confirm Payment**
   action. Do not change the fine when the dialog opens.
2. The member may cancel the dialog without changing the fine.
3. On confirmation, submit the payment request. No payment gateway is
   integrated: confirmation represents a successful simulated payment.
4. The server identifies the member from the authenticated session, verifies
   that the fine belongs to that member, and confirms its current status is
   `OUTSTANDING`.
5. On success, set the fine status to `PAID` and set `paidDateTime` to the
   server's payment-confirmation time. Preserve the fine amount, currency,
   reason, related loan, issue date, and any other fine details. Show a
   success popup and refresh the displayed fine state.
6. Do not allow members to reverse payment or change `PAID` back to
   `OUTSTANDING`. A librarian waiver remains a separate librarian action.

## Feedback and errors

- Prevent duplicate payment submissions for the same fine while a request is
  in progress and indicate that it is being processed.
- On success, show a confirmation popup and remove the fine from the default
  outstanding view. It appears in the history view with status `PAID`.
- On failure, show an error popup, leave the fine in its last
  server-confirmed state, and allow retry when appropriate.
- If the server rejects payment because the fine is no longer `OUTSTANDING`,
  refresh its status and explain that it cannot be paid.
- If loading fines fails, show an error and provide a retry action. Do not
  show data from another member as a fallback.

## Access and scope

- Members may view and pay only fines associated with their own account. The
  server derives the member identity from the authenticated session and
  enforces ownership; a client-supplied member ID is never authoritative.
- The server must enforce fine ownership and `OUTSTANDING` status when
  processing payment. Client-side visibility of the button is not sufficient.
- Member payment is the only fine state change in this feature. Fine creation,
  deletion, amount or reason changes, and librarian waiver decisions are
  outside its scope.
- No external payment processing, payment credentials, or card data are
  collected or stored.

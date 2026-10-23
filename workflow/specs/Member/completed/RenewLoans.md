# Renew Loans

## Purpose

Allow a signed-in member to renew an eligible loan once from the My Loans
section of their profile. Renewal extends the loan's due date; it does not
close the loan or change the copy's status.

## Eligibility

A loan can be renewed only when all of the following are true at the time the
server processes the request:

- The loan belongs to the authenticated member.
- The loan status is `ACTIVE`.
- `isRenewed` is `false`.
- The current time is on or before the end of the loan's due date in
  Singapore time. A loan may be renewed at any time on the due date; once
  that date has passed, it is overdue and cannot be renewed.
- No reservation for the loan's ISBN is pending or has an assigned copy.

Closed loans, loans already reported for return or loss, loans already
renewed, and loans past the due date cannot be renewed. There is no separate
`EXPIRED` loan status; closed and overdue loan states determine eligibility.

The My Loans card shows **Renew** only when the loan appears eligible. The
server is authoritative and must recheck all conditions when processing the
request; hiding the action in the client is not authorization or validation.

## Renewal behavior

1. The member selects **Renew** on an eligible loan card. No confirmation
   dialog is required.
2. The server identifies the member from the authenticated session and
   verifies ownership and current eligibility.
3. On success, add 30 days to the loan's existing `dueDate` and set
   `isRenewed` to `true`. Keep the loan `status` as `ACTIVE`; do not change
   the book copy's status.
4. A renewal is irreversible through the member interface. Members cannot
   clear `isRenewed` or undo the due-date extension.
5. Update the loan card with the new due date and indicate that the loan has
   been renewed. Hide the **Renew** action after a successful renewal.

The due-date cutoff is the end of the due date's calendar day in the library
timezone, Asia/Singapore. The renewal extension is 30 days from the existing
due-date timestamp. This keeps the renewal period anchored to the original
due date, even when the member renews on the last eligible day.

## Feedback and errors

- Prevent duplicate requests while a renewal is in progress and show that the
  request is being processed.
- On success, show a confirmation popup and refresh the loan card with its
  new due date and renewed state.
- On failure, show an error popup and keep the last server-confirmed loan
  state. Allow retry when appropriate.
- If the server rejects the request because eligibility changed, refresh the
  loan state and explain that it can no longer be renewed.

## Access and scope

- Only an authenticated member may renew a loan, and members may renew only
  their own loans. The server derives member identity from the session and
  enforces ownership.
- The server must perform authorization and eligibility checks; client-side
  state alone cannot authorize a renewal.
- Librarian-side renewal actions, loan creation, return/loss review, and
  reservation management are outside this member feature. The shared
  circulation rules still apply to librarian actions.

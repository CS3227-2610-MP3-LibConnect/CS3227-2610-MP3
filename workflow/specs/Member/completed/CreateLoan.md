# Create Loans

## Purpose

Allow a signed-in member to borrow available physical book copies. Each
successful copy checkout creates a loan belonging to the authenticated member.

## Borrow flow

1. The member enters one or more copy IDs on the borrow page.
2. Validate that at least one ID is provided and identify the corresponding
   books and copies for review. Reject unknown or malformed IDs with a clear
   message; do not create loans for them.
3. Before checkout, show a confirmation dialog listing each selected book and
   copy. The member can cancel without making any changes.
4. On confirmation, revalidate the request on the server and process it as one
   operation. Create one loan per selected copy only if every selected copy
   can be borrowed and the member remains within the loan limit. If any check
   fails, do not partially create loans or update copy statuses; explain the
   failure so the member can revise and retry.
5. On success, show confirmation and refresh the member's loan information.

## Eligibility and loan limit

- Only an authenticated member may use this flow. The server derives the
  member identity from the authenticated session; the client cannot choose
  the loan owner.
- Every requested copy must exist and have status `AVAILABLE` when checkout
  is processed. A copy that is unavailable or has changed since the review
  dialog was opened cannot be borrowed.
- A member may have at most 10 loans that have not been closed. Count both
  `ACTIVE` and `PENDING_CLOSE` loans toward this limit. The server must check
  the current count and requested number of copies together when processing
  checkout, so concurrent requests cannot exceed the limit.
- If the member is at the limit or the request would exceed it, reject the
  entire checkout and state how many additional copies, if any, the member
  can borrow.

## Successful checkout state

For each selected copy, checkout creates one loan with:

- `memberId` set to the authenticated member;
- `copyId` set to the selected copy;
- `borrowDateTime` set to the checkout time;
- `dueDate` set to 30 days after `borrowDateTime`;
- `status` set to `ACTIVE`;
- `closureReportType`, `closureReportedDateTime`, `closureReviewedDateTime`,
  and `returnDateTime` unset;
- `isRenewed` set to `false`.

Each checked-out copy changes from `AVAILABLE` to `ON_LOAN`. Loan creation
and copy status updates must succeed or fail together, so a copy cannot be
left on loan without its corresponding loan record or vice versa.

## Errors and access

- If checkout fails, show an error message that explains the issue and does
  not suggest that any copy was borrowed. Keep the member on the borrow flow
  so they can correct the selection or retry.
- The server must verify member authorization, copy availability, and loan
  limit at the time of checkout. Client-side validation is for feedback and
  does not replace server enforcement.
- Members may create loans only for themselves. A member cannot borrow a copy
  on behalf of another account.

## Out of scope

- Viewing active and past loans is specified in [My Loans](MyLoans.md).
- Reporting a loan as returned or lost is specified in [My Loans](MyLoans.md).
- Renewal and librarian-side loan creation are handled by their respective
  features.

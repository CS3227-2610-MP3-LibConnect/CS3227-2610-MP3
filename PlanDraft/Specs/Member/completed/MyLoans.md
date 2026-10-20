# My Loans

## Purpose

Let a signed-in member review their loans and report an active loan as
returned or lost for librarian review. A member report is not a confirmed
return or loss; only the librarian review workflow may close the loan or
change the copy's status.

## Loan list

- The My Loans section is available to signed-in members from their profile.
- Members can view their active loans and their past loans.
- Each loan card shows the book title and due date. Active loans past their
  due date are visually highlighted as overdue.
- A loan in `ACTIVE` status has a **Report Return or Loss** action.
- A loan in `PENDING_CLOSE` status remains visible as active, is identified as
  awaiting librarian review, and has no further report action.
- Closed loans appear in the past-loans view. They do not have a report action.

## Report a return or loss

1. When the member selects **Report Return or Loss** on an `ACTIVE` loan, show
   a dialog identifying the book and offering **Returned** and **Lost** choices.
2. After a choice, show a confirmation dialog identifying the book and the
   selected report type. Do not submit the report until the member confirms.
   The member can cancel either dialog without changing the loan.
3. On confirmation, submit a report for that loan. Set `closureReportType` to
   `RETURNED` or `LOST`, as selected, and set `status` to `PENDING_CLOSE`.
   Record `closureReportedDateTime` when the report is accepted.
4. The server must derive the member identity from the authenticated session
   and verify that the loan belongs to that member and is still `ACTIVE`.
   Client-side checks do not replace these checks.
5. Do not set `returnDateTime`, mark the loan closed, or change the book
   copy's status as part of the member report. A librarian will review the
   report and determine the final loan and copy state.

## Feedback and refreshed state

- While a report is being submitted, prevent duplicate submissions for that
  loan and indicate that the request is in progress.
- On success, show a confirmation that the selected report was submitted for
  librarian review. Update the loan card to the `PENDING_CLOSE` presentation
  so the member can see that no further action is available.
- If the request fails, show an error dialog or notification that the report
  was not submitted. Keep the loan in its prior displayed state and allow the
  member to retry when appropriate.
- If the server rejects the request because the loan is no longer `ACTIVE`,
  refresh the displayed loan state and explain that it could not be reported.

## Access and scope

- Members can read and report only loans associated with their own account.
- Librarian review, report acceptance or rejection, loan closure, copy status
  changes, fines, and notifications are handled by their respective features.

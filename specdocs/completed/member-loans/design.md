# Member Loans

## Description

Update the member's My Loans page to show active and past loans and let
members report an active loan as returned or lost for librarian review. A
member report records a request for review; it does not close the loan.

The report changes the loan to `PENDING_CLOSE` and changes its copy to
`IN_TRANSIT` when the report is accepted. The member cannot report that loan
again while the report is pending.

## Purpose

Let members review their current and past loans and report a return or loss
while preserving the librarian's authority to review the report and decide
the final loan and copy state.

## Why this change is required

Before this feature, the member loan page listed loans, but its behavior did
not match the refined member requirement:

- `MemberLoanCard` shows a disabled **Return** button instead of **Report
  Return or Loss**.
- `loansForView` places only `ACTIVE` loans in the active view, so
  `PENDING_CLOSE` loans appear in the past view.
- The member loan summary omits the report type needed to describe a pending
  review.

The server already has a transactional `reportClosure` workflow that checks
ownership and current loan/copy state, records the report, and changes the
copy to `IN_TRANSIT`. The member API has no route to call it. This feature
adds the member-facing report flow and corrects the active/past presentation.

These findings are based on `apps/client/src/pages/MemberLoans.tsx`,
`apps/client/src/components/MemberLoanCard.tsx`,
`apps/api/src/storage/workflows.ts`, and
`apps/api/src/routes/member-borrow.ts`.

## Capabilities

### Added

- A two-step return or loss report flow in an accessible modal popup, with confirmation and feedback.
- A pending-review presentation for loans whose members have reported a
  return or loss.

### Modified

- The active view includes both `ACTIVE` and `PENDING_CLOSE` loans; the past
  view includes closed loans only.
- Replace the disabled **Return** button with **Report Return or Loss** for
  `ACTIVE` loans.

### Kept separate

Renewal behavior is specified separately in
`PlanDraft/Specs/Member/RenewLoans.md`. This design covers the loan list and
return/loss report behavior. The renewal design remains responsible for the
**Renew** action and its server rules.

## Product specifications

### Loan list

- My Loans is available to signed-in members from their profile.
- The active view includes `ACTIVE` and `PENDING_CLOSE` loans. The past view
  includes `CLOSED_RETURNED` and `CLOSED_LOST` loans.
- Each loan card shows its book title and due date.
- Active loans past their due date are visually highlighted as overdue. To
  align with the existing renewal requirement, a loan remains within its due
  date for the entire calendar day in Singapore time; it becomes overdue
  after that day ends.
- An `ACTIVE` loan offers **Report Return or Loss**.
- A `PENDING_CLOSE` loan appears in the active view as awaiting librarian
  review, shows which report was submitted, and has no further report action.
- Closed loans appear in the past view and have no report action.

### Report a return or loss

1. Selecting **Report Return or Loss** opens a modal popup over a dimmed
   backdrop. The centered popup identifies the book and offers **Returned**
   and **Lost** choices.
2. Choosing a report type advances the popup to a confirmation step that
   identifies the book and selected type. Neither step changes the loan;
   cancelling either makes no change.
3. Confirmation submits the report. The server sets `closureReportType`,
   `status: PENDING_CLOSE`, and `closureReportedDateTime`.
4. The server derives the member from the authenticated session and checks
   ownership and current state. Client-side state is not authoritative.
5. On acceptance, the server also changes the copy from `ON_LOAN` to
   `IN_TRANSIT`. The report does not set `returnDateTime` or close the loan.
6. A librarian reviews the report and determines whether to confirm or reject
   it and what the final loan and copy state will be.

### Feedback and refreshed state

- Prevent duplicate submissions while a report is being processed.
- On success, show that the report was submitted for review and update the
  loan card to its pending-review state.
- On failure, keep the last server-confirmed state, show an error, and allow
  retry when appropriate.
- If the server rejects the request because the loan is no longer active,
  refresh it and explain why the report could not be submitted.
- A dedicated retry control for an initial loan-list load failure is not
  included in this feature.

## Accepted resolution to a requirement conflict

`PlanDraft/Specs/Member/MyLoans.md` says that reporting must not change the
copy status. That conflicts with `Overview.md`, `PLAN.md`, and the existing
`reportClosure` workflow, which use `IN_TRANSIT` while a report awaits review.
The user resolved the conflict in favor of setting the copy to `IN_TRANSIT`
when the report is accepted. This design reflects that decision; the original
requirement text has not been edited.

## Acceptance criteria

1. The active view includes `ACTIVE` and `PENDING_CLOSE` loans; the past view
   includes `CLOSED_RETURNED` and `CLOSED_LOST` loans.
2. Loan cards show book title and due date. Active loans become
   overdue-highlighted only after the end of the due date in
   `Asia/Singapore`.
3. An `ACTIVE` loan offers **Report Return or Loss**. A `PENDING_CLOSE` loan
   shows its report type and that it is awaiting review, with no report
   action. Closed loans have no report action.
4. Selecting the report action opens an accessible modal popup with **Returned**
   and **Lost** choices over a dimmed backdrop. Choosing one advances the same
   popup to its confirmation step. Cancelling either step leaves the loan and
   copy unchanged.
5. Confirming a report sets the loan to `PENDING_CLOSE`, records the selected
   report type and server report time, and changes the linked copy from
   `ON_LOAN` to `IN_TRANSIT` atomically.
6. Member reporting does not set `returnDateTime`, close the loan, or decide
   its final copy status.
7. Only the owning member can report a loan, and only while the loan is
   `ACTIVE` and the linked copy is `ON_LOAN`. Signed-out users and librarians
   cannot use the member report operation.
8. A second or concurrent report cannot change the same loan after the first
   report succeeds.
9. While submitting, the client prevents duplicate requests. On success it
   shows confirmation and updates the card to the pending-review state.
10. On a stale-state or other server failure, the client shows an error and
    keeps the last confirmed state; when the loan is no longer active, it
    refreshes and explains that reporting is unavailable.
11. Librarian review remains responsible for confirming or rejecting a
    report, closing the loan, and setting the copy's final status.

## Technical specifications

The project uses React with TypeScript, an Express API, Firestore accessed
through trusted server code, and cookie-backed sessions. The browser does not
write application records directly.

### Client

- Update `MemberLoans` and `MemberLoanCard` to distinguish the active,
  pending-review, and past states.
- Extend the typed loan summary in `apps/client/src/api/borrow.ts` to include
  the report type needed for pending-review display.
- Add a client API call for submitting a report type.
- Use a centered modal popup with a dimmed backdrop, keyboard operation,
  focus handling, and announced success/error feedback.
- Keep the existing loan list loading and error display. A dedicated retry
  control for initial load failures is outside this feature.
- Implement overdue display using the `Asia/Singapore` due-date boundary
  already selected in `RenewLoans.md`. Do not treat the stored due timestamp's
  time of day as an earlier cutoff.

### API and storage

- Add a member-only route under `/api/v1/member`, following
  `requireActiveActor` and member-role checks in
  `apps/api/src/routes/member-borrow.ts`.
- **Proposed contract:** `POST /api/v1/member/loans/:loanId/closure-report`
  with `{ reportType: "RETURNED" | "LOST" }`. Derive member identity from
  the authenticated actor. Return the updated loan or a success response
  consistent with existing API conventions.
- Reuse `LibraryWorkflows.reportClosure`. It already validates report type,
  member ownership, `ACTIVE` loan status, and `ON_LOAN` copy status within a
  Firestore transaction. It records the report and changes the copy to
  `IN_TRANSIT`.
- Return a conflict when the loan or copy state changed, and do not partially
  update either record.
- Extend the member loan response to include the fields needed by the page,
  while preserving the current ownership filter and safe summary behavior.

### Renewal integration

`RenewLoans.md` defines separate renewal eligibility and transition behavior.
The My Loans list should remain a compatible host for that action. Renewal
controls and renewal API behavior are outside this design; the renewal feature
must use the same authenticated member loan data and must not offer renewal
for a loan in `PENDING_CLOSE`.

### Verification

- API checks cover active-member authorization, ownership, valid report
  types, stale loan/copy state, and safe error responses.
- Firestore Emulator checks confirm loan and copy updates are atomic, the
  report timestamp is server-generated, and concurrent or repeated requests
  cannot submit a second report.
- Client checks cover active/pending/past selection, overdue date-boundary
  behavior, the popup's selection and confirmation steps and cancellation
  paths, success feedback, duplicate-submit prevention, and stale-state errors.
- Keep librarian review and copy finalization within the librarian feature
  boundary.

## Integration specifications

- `apps/api/src/storage/workflows.ts` already contains `reportClosure`. The
  member API should call it rather than implement a second report transition.
- `apps/api/src/routes/member-borrow.ts` mounts member loan routes, and
  `apps/api/src/server.ts` mounts that router under `/api/v1/member`; add the
  report route consistently with those patterns.
- `apps/api/src/storage/workflows.ts` changes the loan and copy in one
  transaction. Librarian review in the same workflow later confirms or
  rejects the report and applies final state changes; those actions remain
  outside the member feature.
- `apps/client/src/App.tsx` already mounts `MemberLoans` at
  `/member/profile/loans`; `MemberProfileHub` provides the profile navigation.
  Update the existing page and card rather than creating a second loans page.
- The member report must not issue fines or notifications. Those remain part
  of their respective librarian/system workflows.

## Out of scope

- Librarian review, approval or rejection of reports, loan closure, and final
  copy status.
- Creating loans.
- Fine issuance, fine payment, and notifications.
- Renewal eligibility or renewal mutation, which remain in
  `PlanDraft/Specs/Member/RenewLoans.md`.
- Changes to the shared loan status model unless required by a separately
  approved specification.

## Risks and tradeoffs

- The copy becomes `IN_TRANSIT` when the member submits a report, before a
  librarian confirms it. This follows the selected state model; librarian
  rejection restores the copy to `ON_LOAN`.
- The member UI must not present a pending report as a completed return or
  loss.
- The existing loan list query returns the member's loans ordered by borrow
  time, but the current summary omits report type. The API summary needs a
  safe extension.
- The overdue highlight must use the same Singapore calendar-day boundary as
  renewal eligibility, or the UI could show a loan overdue while renewal
  still permits it.

## Context reviewed

- `AGENTS.md` — project documentation and ownership boundaries.
- `Overview.md` and `PLAN.md` — loan/copy statuses and pending review state.
- `PlanDraft/Developer_Responsibilities/junhong.md` — member loan history
  and reporting are Jun Hong's responsibility.
- `PlanDraft/Developer_Responsibilities/jiali.md` — librarian review,
  closure, and copy finalization are Jiali's responsibility.
- `PlanDraft/Specs/Member/MyLoans.md` — member loan list and report
  requirements.
- `PlanDraft/Specs/Member/RenewLoans.md` — renewal eligibility and due-date
  cutoff context.
- `packages/shared/src/domain/records.ts` — loan status and record schema.
- `apps/api/src/storage/workflows.ts` — existing member report and librarian
  review transitions.
- `apps/api/src/routes/member-borrow.ts` and `apps/api/src/http/auth.ts` —
  member route and authorization patterns.
- `apps/api/src/server.ts` — API route mounts.
- `apps/client/src/App.tsx`, `apps/client/src/pages/MemberLoans.tsx`,
  `apps/client/src/components/MemberLoanCard.tsx`, and
  `apps/client/src/api/borrow.ts` — current loan UI and client API.
- `tests/` and `package.json` — current test conventions and scripts.

Source code and tests were inspected. The member summary and transactional
`reportClosure` workflow are in place; the member-only report route delegates
to that workflow. The My Loans page presents the report selection and
confirmation steps in a centered modal popup with a fixed dimmed backdrop,
then refreshes the pending-review state after success.

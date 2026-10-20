# Member Loan Renewals

## Description

Add a one-time **Renew** action to the member's existing My Loans page. A successful renewal extends an eligible loan's due date by 30 days from its existing due-date timestamp.

## Purpose

Let a member keep a borrowed book for one additional 30-day period when the loan is still active and within its due date, while enforcing the one-renewal limit and due-date policy on the server.

## Why this change is required

The shared loan record already contains `dueDate` and `isRenewed` in `packages/shared/src/domain/records.ts`. The member loans workflow returns a safe loan summary, but that summary currently omits `isRenewed`; `apps/api/src/routes/member-borrow.ts` exposes loan listing but no renewal operation. The My Loans page and `MemberLoanCard` display loan and due-date information but provide no renewal action. The client also currently determines overdue status by comparing the due-date timestamp directly with the current time, while the approved My Loans design requires overdue treatment to begin only after the due date's entire calendar day in Singapore.

This feature adds the member renewal workflow, its API route, and the client action on the existing My Loans page. It does not change loan or copy schemas. The current member workflow pattern derives the member from the authenticated actor, and the API applies `requireActiveActor` and member-role checks.

## Purpose and capabilities

### Added

- One-time renewal of an eligible member loan.
- Transactional server-side validation of ownership, loan status, renewal state, and due-date cutoff.
- Success, progress, and error feedback on the My Loans card.

### Modified

- The member loan summary includes the renewal state needed by the UI.
- The existing My Loans card gains **Renew** when the loan appears eligible and reflects the new due date after success.
- Overdue presentation uses the due date's calendar-day boundary in `Asia/Singapore`, consistent with renewal eligibility and the approved Member Loans design.

The loan schema, status model, and copy status behavior are not intended to change.

## Product specifications

### Eligibility

A renewal is eligible at the time the server processes the request only if:

- The loan belongs to the authenticated member.
- The loan status is `ACTIVE`.
- `isRenewed` is `false`.
- The current time is before the start of the calendar day after the loan's due date in `Asia/Singapore`.

A loan remains eligible throughout the due date in Singapore. It is overdue and cannot be renewed from the start of the next Singapore calendar day. `PENDING_CLOSE`, `CLOSED_RETURNED`, and `CLOSED_LOST` loans cannot be renewed. There is no separate `EXPIRED` loan status.

**Approved user decision:** A reservation for the same ISBN does not prevent renewal, whether the reservation is waiting or has an assigned copy. The renewal workflow must not reject a loan because of pending or assigned reservations.

The My Loans card shows **Renew** only when its latest loan data appears eligible. Client visibility is not authorization; the server rechecks all eligibility conditions.

### Renewal behavior

1. The member selects **Renew** on an eligible loan card. No confirmation dialog is required.
2. The server derives the member identity from the authenticated session and verifies ownership and current eligibility.
3. On success, add exactly 30 days (30 × 24 hours) to the loan's existing `dueDate` timestamp and set `isRenewed` to `true`.
4. Keep the loan status as `ACTIVE`. Do not change the book copy's status or any reservation state.
5. Renewal cannot be undone through the member interface.
6. Update the card with the new due date, show a success popup, and hide **Renew**.

### Feedback and errors

- Prevent duplicate renewal submissions for the same loan while a request is in progress and indicate that processing is underway.
- On success, show confirmation and update the card from the server-confirmed response or refreshed loan data.
- On failure, show an error and retain the last server-confirmed loan state. Allow retry when appropriate.
- If the server rejects the request because eligibility changed, refresh the loan and explain that it can no longer be renewed.

### Accepted resolution to the reservation-rule conflict

`PlanDraft/Specs/Member/RenewLoans.md` and the current planning baseline in `PLAN.md` say a pending or assigned reservation blocks renewal. The user resolved this conflict for this feature by specifying that members may renew even when a reservation exists for the book. This design follows the user's latest decision; the older reservation restriction must not be implemented for member renewals.

## Acceptance criteria

1. A signed-in member can renew only their own `ACTIVE` loan when `isRenewed` is false.
2. A loan remains eligible for the entire due-date calendar day in `Asia/Singapore`; a request at or after the next Singapore midnight is rejected.
3. Pending or assigned reservations for the same ISBN do not block renewal.
4. A successful renewal sets `isRenewed` to `true` and advances `dueDate` by exactly 30 days from its prior timestamp, not from the request time.
5. The renewal leaves loan status `ACTIVE` and leaves the linked copy's status and reservation state unchanged.
6. A closed loan, a `PENDING_CLOSE` loan, an already-renewed loan, or a loan past the Singapore due-date cutoff cannot be renewed.
7. Concurrent or repeated requests cannot renew a loan more than once.
8. The card shows the updated due date, displays success feedback, and no longer offers **Renew** after renewal.
9. In-progress requests prevent duplicate client submissions. On failure, the card retains its last confirmed state; stale eligibility failures refresh the loan and explain the result.
10. Signed-out users, librarians, and members acting on another member's loan cannot renew it.
11. The overdue indicator on My Loans does not mark a loan overdue before the end of its due date in Singapore.

## Technical specifications

The project uses React with TypeScript, an Express API, Firestore accessed through trusted server code, and cookie-backed sessions. The browser must not write loan records directly.

### Client

- Add a typed renewal call under `apps/client/src/api/borrow.ts` using the shared `apiRequest` helper.
- Extend `MemberLoan` with `isRenewed`, populated by the existing loan list response.
- Add renewal eligibility presentation to `MemberLoanCard`. The UI may derive apparent eligibility from the returned status, `isRenewed`, and due-date cutoff using `Asia/Singapore`; the server remains authoritative.
- Update card state from the server-confirmed renewal response or refresh the member loan list after success or a stale-state error.
- Disable the relevant action while renewal is in progress. Announce success and errors through accessible status/alert content; the success and error popups should be keyboard-accessible and dismissible.
- Update the existing overdue helper in `apps/client/src/pages/member-loan-view.ts` to use the Singapore calendar-day boundary rather than comparing the raw due timestamp to the browser's current time.

### API and authorization

**Proposed contract:**

| Method and path | Behavior |
|---|---|
| `POST /api/v1/member/loans/:loanId/renew` | Renew the authenticated member's eligible loan and return the updated safe loan summary. |

- Mount the route in the existing member borrow router under `/api/v1/member`.
- Apply `requireActiveActor` and the existing member-role middleware. Reject a request from a librarian or unauthenticated caller.
- Validate the loan ID and derive the member ID from the authenticated actor. Never accept a member ID from the client.
- Map missing-loan and stale eligibility errors to established API error responses.
- Keep the loan list's ownership filtering and return only the fields required by the member page, including `isRenewed`.

### Storage and state transition

- Add a member renewal operation to `LibraryWorkflows`.
- In a Firestore transaction, verify the active member account and read the loan. Confirm ownership, `ACTIVE` status, `isRenewed === false`, and that the current server time is before the next Singapore calendar day's start.
- Set the loan's `dueDate` to its existing timestamp plus exactly 30 days and set `isRenewed` to `true` atomically.
- Do not change the loan's status, copy record, or reservation records. Do not query reservations as an eligibility condition.
- Use the loan record as the transactional serialization point so concurrent renewals cannot both succeed. After one request sets `isRenewed`, another request must retry against the updated record and fail as no longer eligible.
- Return a conflict for a loan that is no longer eligible, with no partial state changes.

### Date handling

- Compute the eligibility cutoff from the `dueDate` calendar date in the IANA timezone `Asia/Singapore`, using the start of the following local date as an exclusive boundary. Do not compare the current instant directly against the stored due timestamp, since that could reject a renewal before the due date ends.
- Compute the new due date from the original stored timestamp by adding `30 * 24 * 60 * 60 * 1000` milliseconds. Do not calculate it from the current time or from the due-date calendar boundary.
- Use the same Singapore calendar-day rule for client overdue presentation. The server's transaction check remains the final decision.

## Integration specifications

- Reuse the existing `/api/v1/member/loans` list and My Loans page at `/member/profile/loans`; do not create a second loan page or list endpoint.
- The current loan summary is constructed in `LibraryWorkflows.memberLoans` and consumed by `borrowApi.listLoans`. Extend that allowlisted summary to return `isRenewed` without exposing internal fields such as member ID or copy ID.
- The current Member Loans design requires active loans to remain within their due date for the entire Singapore calendar day. The renewal control and overdue indication must share that cutoff rule.
- Renewal does not alter reservation state. A pending or assigned reservation remains subject to its existing librarian reservation and pickup workflows, even if another member renews their currently borrowed copy.
- Librarian-side loan creation, renewal actions, return/loss review, and reservation management remain outside this member feature.

## Out of scope

- Librarian-side renewal actions.
- Renewing a loan more than once or undoing a renewal.
- Changing due dates for loans outside the member renewal operation.
- Changing loan/copy status, copy assignment, reservation state, or reservation workflow.
- Changes to the loan schema or shared status model.

## Risks and tradeoffs

- Allowing renewal while a reservation is pending or assigned can delay pickup for the waiting member. This is an accepted product decision and must not be silently reversed by implementation.
- A timezone or cutoff error could allow an overdue renewal or reject one during the due date. Tests must cover the instant immediately before Singapore midnight and the instant at/after midnight.
- Concurrent requests must not extend the due date twice. The workflow must re-read and validate `isRenewed` transactionally.
- The client's loan data can become stale if another request renews the loan. The server rejection and client refresh path must keep the card accurate.
- A loan's current due timestamp can be earlier in the day than the actual renewal cutoff; comparing timestamps directly would violate the accepted entire-day rule.

## Context reviewed

- `AGENTS.md` — application documentation and ownership boundaries.
- `Overview.md` and `PLAN.md` — loan model and existing renewal baseline; the PLAN reservation exclusion is superseded by the user's latest decision for this feature.
- `PlanDraft/Developer_Responsibilities/junhong.md` and `PlanDraft/Developer_Responsibilities/jiali.md` — member versus librarian ownership.
- `PlanDraft/Specs/Member/RenewLoans.md` — renewal rules and the prior reservation restriction.
- `specdocs/member-loans/design.md` — My Loans behavior and Singapore due-date boundary.
- `packages/shared/src/domain/records.ts` — `LoanRecordSchema` includes `dueDate` and `isRenewed`.
- `apps/api/src/storage/workflows.ts` — current member loan query and safe summary.
- `apps/api/src/routes/member-borrow.ts`, `apps/api/src/http/auth.ts`, and `apps/api/src/server.ts` — member route authorization and mounting conventions.
- `apps/client/src/pages/MemberLoans.tsx`, `apps/client/src/pages/member-loan-view.ts`, `apps/client/src/components/MemberLoanCard.tsx`, and `apps/client/src/api/borrow.ts` — existing member loans page, overdue helper, card, and typed client API.
- `tests/member-borrow-storage.test.mjs`, `tests/member-loans-api.test.mjs`, and `tests/client-member-loans.test.mjs` — current loan storage, API, and client test conventions.

Source code was available and inspected. The user-approved renewal policy allows renewal when a reservation exists for the same ISBN. The due-date cutoff is the end of the due date in Singapore, and the extension is 30 days from the existing due-date timestamp.

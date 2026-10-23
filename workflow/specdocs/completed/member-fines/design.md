# Member Fines

## Description

Let signed-in members review their outstanding fines and their paid or waived
fine history, and mark an outstanding fine as paid through a simulated payment
flow. Payment requires member confirmation, and the server enforces fine
ownership and status.

## Purpose

Give members a clear view of amounts they owe and fines they have already
settled, with a safe member-facing way to record payment.

## Why this change is required

The My Fines route currently renders a placeholder in
`apps/client/src/App.tsx`. There is no member fine API route or client page.
The shared fine schema and transactional payment workflow already exist:
`packages/shared/src/domain/records.ts` stores integer `amountMinorUnits` and
the fixed currency `SGD`, and `apps/api/src/storage/workflows.ts` implements
`payFine`, checking ownership and `OUTSTANDING` status before setting `PAID`
and the server payment timestamp. The member-facing list, route, and UI are
needed to expose that behavior.

Fine creation and librarian waiver behavior remain within their separate
librarian-side workflows and outside this member feature. The feature must
integrate with those existing state transitions without implementing or
changing their behavior.

## Capabilities

### Added

- A member-only fine list with outstanding and history views.
- Bounded, cursor-based loading of paid and waived fine history.
- A confirmation dialog and simulated payment action for outstanding fines.
- Loading, empty, retry, success, in-progress, and conflict feedback.

### Modified

- Replace the My Fines placeholder at `/member/profile/fines` with the member
  fine list and payment experience.
- Expose the existing transactional payment workflow through a member API
  route. Fine creation, waiver, and the fine record schema are not intended to
  change.

## Product specifications

### Fine list

- The My Fines section is available to signed-in members only.
- Show the member's `OUTSTANDING` fines by default.
- Provide a history view containing the member's `PAID` and `WAIVED` fines,
  with each status clearly shown. Load the history in bounded pages as the
  member scrolls; all pages remain reachable.
- Display each fine's book title, reason, issue date, amount, and status.
- Format `amountMinorUnits` using the record currency, currently `SGD`, without
  floating-point arithmetic for money.
- Show **Pay Fine** only for an `OUTSTANDING` fine. `PAID` and `WAIVED` fines
  cannot be paid again.
- Show a clear empty state for a selected view with no fines. Provide loading
  and retryable error states when the list cannot be retrieved.
- History is ordered newest first by issue time. This follows the existing
  member activity query's `issuedDateTime` ordering.

### Pay an outstanding fine

1. Selecting **Pay Fine** opens a confirmation dialog showing the book title,
   fine reason, amount, and currency, with a **Confirm Payment** action. The
   dialog opening does not change the fine.
2. Dismissing the dialog makes no change.
3. On confirmation, submit the payment request. No payment gateway is
   integrated; confirmation represents successful simulated payment.
4. The server identifies the member from the authenticated session, verifies
   the fine belongs to that member, and confirms its current status is
   `OUTSTANDING`.
5. On success, set the fine status to `PAID` and set `paidDateTime` to the
   server's payment-confirmation time. Preserve the fine amount, currency,
   reason, related loan, issue date, and all other fine details. Show success
   feedback and refresh the displayed fine state.
6. A member cannot reverse payment or change `PAID` back to `OUTSTANDING`.
   Librarian waiver remains a separate librarian action.

### Feedback and errors

- Prevent duplicate payment submissions for the same fine while a request is
  in progress and indicate that it is being processed.
- On success, show confirmation and remove the fine from the default
  outstanding view. It appears in history with status `PAID`.
- On failure, show an error, leave the fine in its last server-confirmed
  state, and allow retry when appropriate.
- If the server rejects payment because the fine is no longer `OUTSTANDING`,
  refresh its status and explain that it cannot be paid.
- If loading fines fails, show an error and provide a retry action. Never show
  another member's data as a fallback.

## Acceptance criteria

1. A signed-in member can view only fines associated with their account;
   signed-out users and librarians cannot use member fine operations.
2. The default view contains only `OUTSTANDING` fines. The history view
   contains `PAID` and `WAIVED` fines, with each status clearly displayed.
3. Fine cards show book title, reason, issue date, amount, and status. Amounts
   are formatted from integer minor units in the record currency without
   floating-point money arithmetic.
4. Only an outstanding fine offers **Pay Fine**.
5. Opening or dismissing the payment confirmation dialog does not change the
   fine.
6. Confirming payment changes the fine to `PAID` and sets `paidDateTime` from
   the server's confirmation time while preserving all other fine details.
7. Repeated or concurrent requests cannot create multiple payment
   transitions. At most one request changes the fine from `OUTSTANDING`; a
   later request is rejected and the client refreshes the fine's state.
8. On success, the fine is removed from the outstanding view and appears in
   history as `PAID`.
9. On payment failure, the last server-confirmed state is retained, useful
   feedback is shown, and retry is available when appropriate.
10. Fine list loading failures expose a retry action and do not display data
    from another member.
11. History is loaded in bounded pages, ordered newest first, and all records
    can be reached without skipped or duplicated entries during ordinary
    pagination.

## Technical specifications

The project uses React with TypeScript, an Express API, Firestore accessed
through trusted server code, and cookie-backed sessions. The browser does not
write application records directly.

### Client

- Add fine API calls under `apps/client/src/api`, using the shared `apiRequest`
  helper and cookie credential behavior in `apps/client/src/api/base.ts`.
- Replace the placeholder route component with a My Fines page integrated
  into `MemberProfileHub`.
- Load outstanding fines by default. Load history in bounded pages as the
  member scrolls; keep a deterministic cursor and prevent duplicate page
  requests.
- Use server-confirmed state for payment availability. Disable **Pay Fine**
  while that fine's payment request is active.
- Use an accessible confirmation dialog with keyboard operation, focus
  handling, and an announced success or error state.
- After successful payment or a stale-state conflict, refresh the relevant
  view. Do not show paid fines as outstanding after the server confirms the
  transition.
- Format amount using integer minor units and the record's `currency` value.

### API and authorization

- Mount member fine routes under `/api/v1/member` and require an active member
  actor, following the authorization pattern in
  `apps/api/src/routes/member-borrow.ts`.
- Derive member identity from the authenticated session. Do not accept a
  client-supplied member ID as the source of ownership.
- Proposed list contract: `GET /api/v1/member/fines?view=outstanding|history`
  with an optional cursor for history pagination. Return only the actor's
  fines, with a bounded page of history results. The exact page size, cursor
  encoding, and response envelope should follow the existing API conventions.
- Proposed payment contract: `POST /api/v1/member/fines/:fineId/pay` with no
  payment details in the request body. Reuse the existing `payFine` workflow.
  Return the updated fine or a success response, following the project's API
  response conventions.
- Map ownership failures and non-outstanding status to the existing API error
  envelope. A stale payment attempt should be a conflict the client can
  present after refreshing fine state.

### Storage and state transitions

- Use the existing `FineRecordSchema` in
  `packages/shared/src/domain/records.ts`. It requires positive safe integer
  `amountMinorUnits`, literal `SGD` currency, status, timestamps, reason, and
  related IDs. No schema change is intended.
- Add or adapt a member fine query that derives `memberId` from the actor,
  filters to `OUTSTANDING` for the default view and `PAID`/`WAIVED` for
  history, and orders history by `issuedDateTime` descending with a stable
  tie-breaker for cursor pagination.
- Add required composite indexes to `firestore.indexes.json` based on the
  final query shapes.
- Keep payment transactional: read the fine, verify actor ownership and
  `OUTSTANDING` status, then update only `status` and `paidDateTime`.
- If two payment requests race, the transaction must allow at most one
  transition from `OUTSTANDING`. A later attempt sees the changed status and
  fails without further writes.
- Coordinate with the librarian fine waiver workflow. Payment and waiver
  must not both successfully change the same outstanding fine; each workflow
  must validate the current status in its transaction. Do not implement or
  otherwise change the librarian waiver feature under this design.

### Verification

- API verification covers member ownership, role restrictions, list view
  filtering, cursor pagination, payment success, non-outstanding conflicts,
  cross-member denial, and repeated/concurrent payment requests.
- Firestore Emulator verification confirms fine queries and required indexes
  work against the actual query shapes and that failed/racing transitions do
  not partially update the fine.
- Client verification covers outstanding/history selection, bounded history
  loading, amount display, empty/loading/retry states, dialog cancel/confirm,
  in-progress duplicate prevention, success refresh, and stale-state errors.
- Verify payment remains compatible with the librarian waiver transition
  without changing the librarian workflow's responsibilities.

## Integration specifications

- `apps/api/src/storage/workflows.ts` already contains `payFine`, which
  authenticates the active member, checks ownership and outstanding status in
  a Firestore transaction, and records `paidDateTime`. The member API should
  call this workflow rather than create a separate payment state transition.
- `apps/api/src/storage/repositories.ts` has a `memberActivity` query that
  includes the actor's fines ordered by `issuedDateTime`, but there is no
  member fine API route using it. A dedicated member fine list operation is
  proposed so the endpoint can filter and paginate the requested view.
- `apps/api/src/server.ts` mounts member routes under `/api/v1/member`; mount
  the fine routes consistently with existing member routes.
- `apps/client/src/components/MemberProfileHub.tsx` already links to
  `/member/profile/fines`. `apps/client/src/App.tsx` currently renders a
  placeholder for this path; replace it with the My Fines page.
- Fine creation and librarian waiver are outside this feature and remain
  within their respective workflow ownership. Fine records remain the source
  of truth; notifications about fine issuance or updates are not changed by
  member payment in this design.

## Out of scope

- Creating, deleting, or editing fines, including amounts or reasons.
- Librarian fine waiver decisions or librarian-facing fine workflows.
- Reversing a payment or changing a `PAID` fine back to `OUTSTANDING`.
- External payment processing, payment credentials, or card data.
- Fine policy calculations, overdue detection, or notification issuance.
- Changes to the shared fine record schema.

## Risks and tradeoffs

- Payment and librarian waiver may race. Both transitions must check the
  current fine status transactionally so a fine cannot be paid and waived.
- Cursor pagination needs deterministic ordering, including a tie-breaker
  when fines share an issue timestamp, to avoid skipped or duplicated history
  entries.
- Moving a fine from outstanding to history after payment can change the
  member's visible lists. Refresh the views from server-confirmed data.
- The proposed page size, cursor encoding, and API response envelope are
  implementation details to settle consistently with existing API patterns.

## Context reviewed

- `AGENTS.md` — project documentation and ownership boundaries.
- `Overview.md` and `workflow/PLAN.md` — product scope, fine model, and open fine-policy
  context.
- `workflow/responsibilities/junhong.md` — member fines and
  payment are Jun Hong's responsibility.
- `workflow/responsibilities/jiali.md` — librarian-side fine
  issuance and waiver remain Jiali's responsibility.
- `workflow/specs/Member/MyFines.md` — member fine list and simulated payment
  requirements.
- `workflow/specs/Member/ProfilePage.md` — profile navigation and current
  My Fines section context.
- `packages/shared/src/domain/records.ts` — fine record schema and statuses.
- `apps/api/src/storage/workflows.ts` — existing transactional `payFine`
  operation and librarian waiver workflow.
- `apps/api/src/storage/repositories.ts` — existing member activity fine
  query.
- `apps/api/src/routes/member-borrow.ts` and `apps/api/src/http/auth.ts` —
  active-member route authorization patterns.
- `apps/api/src/server.ts` — API route mounts.
- `apps/client/src/App.tsx`, `apps/client/src/components/MemberProfileHub.tsx`,
  and `apps/client/src/api/base.ts` — current placeholder, profile navigation,
  and client API conventions.
- `firestore.indexes.json` — current composite indexes.
- `package.json` and `tests/` — current verification scripts and test
  conventions.

Source code was available and inspected. The member list, API route, and UI
are not implemented; the schema and payment workflow are present. Fine history
pagination is approved to use bounded pages as the member scrolls.

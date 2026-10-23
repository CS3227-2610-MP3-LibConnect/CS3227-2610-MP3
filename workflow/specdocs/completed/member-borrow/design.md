# Member Borrow Feature

## Description

Add a member-only borrow page where a member stages copies for review, confirms the borrow, and sees which copies were borrowed or failed. Staging does not borrow or reserve a copy; borrowing happens only after confirmation.

## Purpose

Allow members to borrow available physical book copies while enforcing copy availability, member ownership, and the limit of 10 active loans.

## Why this change is required

Members can inspect copy IDs and availability through the catalog, but the current application does not provide a member borrow page or member-facing loan creation route. The existing `LibraryWorkflows.createLoan` is librarian-only, processes one copy at a time, permits reservation pickup, and does not enforce the member loan limit. This feature provides a distinct member workflow while reusing the shared loan and copy records.

## Capabilities and changes

### New capabilities

- Members can enter a copy ID and select **Add copy** to stage it for the current transaction.
- The backend checks that the copy exists and is `AVAILABLE` before the page stages it. Unknown or unavailable copies produce an error and no staged card.
- The page displays a card for each successfully staged copy. Staging does not create a loan, change copy status, or reserve the copy.
- The page prevents members from staging more copies than their remaining loan slots, based on the current active-loan count and the number of copies already staged.
- Members can remove staged copies and review the remaining copies in a confirmation dialog.
- After confirmation, the server rechecks each copy and the member's active-loan count. It processes each copy independently, borrowing eligible copies and rejecting only copies that fail validation.
- The member sees a per-copy result identifying successful borrows and failures, including a reason for each failure.
- Members may have no more than 10 active loans. The server enforces this limit against current data, including concurrent requests.

### Existing capabilities modified

No existing librarian circulation capability is intended to change. The member workflow accepts only `AVAILABLE` copies; librarian reservation pickup remains separate.

## Product specifications

- Only signed-in, active members can use the borrow page.
- A member supplies the copy ID and explicitly selects **Add copy**. If the copy does not exist, the page displays an error and adds no card. If the copy exists and is available, its card is added to the staged transaction.
- A copy not in `AVAILABLE` status cannot be staged. A copy already staged cannot be added a second time.
- The member cannot stage more copies than the remaining capacity under the 10-active-loan limit. The page obtains the current active-loan count from the server and subtracts the staged copies; the server still rechecks the limit when confirming.
- Staged copies can be removed before confirmation.
- The confirmation dialog lists the staged books. Cancelling creates no loans and changes no copy statuses.
- On confirmation, the server rechecks each copy and the member's current active-loan count.
- The server processes each staged copy independently. Copies that remain available are borrowed; copies that fail validation are rejected while other eligible copies may still be borrowed.
- When a copy is successfully borrowed, its `shelfLocation` is cleared to `null` in the same state update that changes its status to `ON_LOAN`. Copies that fail validation retain their existing shelf location.
- Catalog copy data exposed to the member dashboard's book-detail view allows `shelfLocation` to be `null`. The copy availability list displays a clear fallback such as **Not on shelf** for a null location and continues to display the location when present.
- The result identifies each successful borrow and each failure, including the failure reason.
- A member may not exceed 10 active loans. The server enforces this limit, including across concurrent or repeated requests.
- The member identity is derived from the authenticated server actor; client-supplied identity data cannot create a loan for another member.

## Acceptance criteria

1. Only an authenticated, active member can use the borrow page.
2. Adding an unknown copy ID displays an error and adds no card.
3. Adding an available copy displays its card in the staged transaction without creating a loan or changing its status.
4. A copy that is not `AVAILABLE` cannot be staged, and a duplicate staged copy cannot be added.
5. The page prevents adding more staged copies than the member's remaining slots, calculated from the current server-sourced active-loan count and staged-copy count.
6. The member can remove a staged card before confirmation.
7. Cancelling the confirmation dialog creates no loans and changes no copy statuses.
8. On confirmation, each eligible copy gets a loan attributed to the authenticated member, changes to `ON_LOAN`, and has its `shelfLocation` cleared to `null` as part of the same state update.
9. The member catalog copy list handles null shelf locations without displaying a raw null value; it shows **Not on shelf** while continuing to show non-null locations.
10. If a copy becomes unavailable before confirmation, that copy fails while other eligible copies are still borrowed.
11. The result identifies successes and failures, including the reason each copy failed.
12. A member at the 10-active-loan limit cannot borrow more copies; concurrent or repeated requests cannot exceed the limit.
13. Client-supplied identity data cannot create loans for another member.

## Technical specifications

- Add a member-only borrow page and route, linked from the member navigation bar. A catalog detail-page link may also be provided.
- Add an authenticated add-copy API operation. It looks up the copy, checks that it is `AVAILABLE`, and returns the copy and book details needed for the staged card. It makes no state changes.
- Provide the current member's active-loan count (or remaining borrow capacity) through an authenticated server response so the page can prevent staging beyond the member's remaining slots. This is informational page state, not a reservation or substitute for confirmation-time validation.
- Keep staged items as client-side transaction state. Staging is not a reservation; availability may change before confirmation.
- Add a separate confirmation API operation. The client submits copy IDs only; the server gets the member identity from the authenticated actor.
- During confirmation, validate and process each copy independently and return per-copy outcomes. Each successful copy must have a corresponding loan and `ON_LOAN` status update.
- For each successful borrow, clear `shelfLocation` to `null` in the same transaction/state update as the copy's transition to `ON_LOAN`; failed borrow attempts leave the shelf location unchanged. Update the shared copy-record schema to allow a null shelf location for copies that are not on a shelf.
- Update the member-facing catalog copy types to allow a null shelf location, and render a **Not on shelf** fallback in the copy availability list shown from the dashboard's book-detail view.
- Enforce the member loan limit safely under concurrent confirmations. The implementation must serialize or otherwise coordinate member loan-count updates in Firestore; a page-only count or unchecked query is insufficient.
- Reuse the existing `LoanRecordSchema`. Generate loan IDs and timestamps on the server. The initial due date is 30 days after borrowing, as specified in `Overview.md`.
- Keep librarian loan creation separate. The member flow accepts only `AVAILABLE` copies; librarian reservation pickup remains outside this feature.

## Integration specifications

Proposed API contracts:

- `GET /api/v1/member/borrow-capacity` returns the authenticated member's active-loan count and remaining slots under the 10-loan limit. The page uses this response with its staged-copy count to disable or reject further additions when capacity is exhausted.
- `POST /api/v1/member/borrow-items` with `{ copyId }` checks the copy and returns book and copy details for the staged card. It makes no state change.
- `POST /api/v1/member/loans` with `{ copyIds: string[] }` confirms the staged borrow. The server determines the member from the authenticated actor. The response contains an outcome for each ID, such as success with loan details or failure with a reason.

The browser displays the per-copy result as a summary of borrowed copies and failures. The server is authoritative for authentication, availability, the loan limit, and state changes. The existing catalog APIs and shared loan schema are integration points.

## Out of scope

- Viewing loan history or a complete active-loan list.
- Reporting a loan as returned or lost.
- Librarian loan creation, return/loss review, or reservation handling.

## Risks and tradeoffs

- Staged availability can become stale, so confirmation must recheck every copy.
- Per-copy outcomes permit partial success; the UI must clearly distinguish borrowed copies from failures.
- The active-loan limit must be protected against concurrent requests, not enforced only in the page.
- Staging does not hold a copy for the member; another transaction may change its status before confirmation.

## Context reviewed

This design is based on available source code and project documentation. Relevant context includes:

- `Overview.md` — domain records, copy statuses, initial loan duration, and product scope.
- `workflow/PLAN.md` — architecture, circulation delivery phase, and project integration constraints.
- `workflow/responsibilities/junhong.md` — member circulation and member-facing client/API ownership.
- `workflow/responsibilities/jiali.md` — librarian circulation and server-side librarian/manager action ownership.
- `workflow/specs/Member/CreateLoan.md` — member borrow page requirements and out-of-scope items.
- `packages/shared/src/domain/records.ts` — shared loan and copy record schemas.
- `apps/api/src/storage/workflows.ts` — existing librarian loan creation and member closure workflow.
- `apps/api/src/routes/catalog.ts`, `apps/api/src/http/auth.ts`, and `apps/api/src/server.ts` — catalog API, active actor checks, and API mounting.
- `apps/client/src/App.tsx`, `apps/client/src/pages/MemberDashboard.tsx`, `apps/client/src/pages/MemberBookDetail.tsx`, and `apps/client/src/components/MemberNavigation.tsx` — member route and UI integration points.

Jun Hong owns the member circulation workflow and member-facing client/API integration. Librarian loan creation and review remain Jiali's responsibility.

## amendments

- 2026-10-20: Per user approval, extend the shelf-location change to the member catalog flow: catalog copy types allow null locations, and the book-detail copy list displays **Not on shelf** for null values.
- 2026-10-20: Per user approval, clear a successfully borrowed copy's `shelfLocation` to `null` in the same state update as its transition to `ON_LOAN`; failed copies retain their location. The shared copy-record schema must represent the absence of a shelf location.
- 2026-10-20: Per user clarification, prevent members from staging more copies than their remaining slots under the 10-active-loan cap. The page uses active-loan capacity returned by the server; confirmation continues to enforce the limit against current data.
- 2026-10-20: Per user clarification, add a Borrow button to the member navigation bar that opens the member borrow page.

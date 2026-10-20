# Member Reservations List Tasks

Implementation checklist for [`design.md`](./design.md). Complete tasks in order; later tasks depend on the storage and API contracts established earlier.

- [x] **Add paginated member reservation storage query** - Add a bounded repository query for a member's pending reservations or history, with stable descending timestamp/document-ID ordering, cursor support, and book-title enrichment.
  - Acceptance criteria: The query derives ownership from the authenticated member actor; `pending` returns only `PENDING`; `history` returns only `FULFILLED`, `CANCELLED`, and `EXPIRED`; page size is validated from 1 to 50 and fetches at most `limit + 1`; the next cursor includes enough ordering state to resume without duplicate or skipped records; cursor validation binds it to the member and selected view; titles are batch-read by ISBN; response records are validated and include the fields needed by the UI.
  - References: Design sections “Reservation list,” “Storage and serialization,” and acceptance criteria 2–5; `apps/api/src/storage/repositories.ts` (`notificationHistory`, `memberActivity`); `packages/shared/src/domain/records.ts`.

- [x] **Add required reservation query indexes** - Define Firestore composite indexes for the member/status/view query shapes and stable ordering.
  - Acceptance criteria: `firestore.indexes.json` contains indexes required by both pending and history queries; the indexes match the implemented Firestore filters and ordering; emulator verification confirms the queries execute without missing-index errors.
  - References: Design sections “Storage and serialization,” “Integration specifications,” and “Risks and tradeoffs”; `firestore.indexes.json`.

- [x] **Expose member reservation list and cancellation API routes** - Add the member reservation router and mount it under `/api/v1/member/reservations`; route list requests to the paginated repository query and cancellation requests to the existing shared workflow.
  - Acceptance criteria: `GET /api/v1/member/reservations` validates `view`, `limit`, and `cursor`, returns `{ items, page: { limit, nextCursor } }`, and uses the current member actor; cursor parsing rejects malformed cursors and cursors bound to another member or view; `DELETE /:reservationId` validates the identifier, calls `LibraryWorkflows.cancelMemberReservation`, and returns 204 on success; active-member authorization rejects unauthenticated and non-member callers; errors use the established API error envelope.
  - References: Design sections “API and authorization” and “Integration specifications”; `apps/api/src/routes/member-notifications.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/server.ts`, `apps/api/src/storage/workflows.ts` (`cancelMemberReservation`), and `specdocs/member-reservations/design.md`.

- [x] **Add typed client API for reservations** - Add list-page and cancellation methods using the shared API request helper.
  - Acceptance criteria: Types represent the reservation display fields and `{ items, page: { limit, nextCursor } }`; list requests pass the selected view, limit, and cursor; cancellation uses the approved DELETE route; requests use `apiRequest` so cookie credentials and API error behavior match existing client calls.
  - References: Design sections “Client” and “API and authorization”; `apps/client/src/api/base.ts`, `apps/client/src/api/borrow.ts`, and `specdocs/member-reservations/design.md`.

- [x] **Build the My Reservations profile page and bounded views** - Replace the route placeholder with a member page showing pending reservations by default and history on selection, with independent paged state for each view.
  - Acceptance criteria: `/member/profile/reservations` remains member-protected and renders the new page; pending and history display only their specified statuses; both views support loading additional pages and retain stable newest-first ordering; cards show book title, status, and reservation date; a pending reservation with assigned copy and expiry is clearly ready for pickup and shows the expiry date; cancelled reservations with historical assignment fields remain labelled cancelled; each view has loading, empty, error, and retry feedback; list errors never substitute another member's data.
  - References: Design sections “Reservation list,” “Client,” and acceptance criteria 1–6; `apps/client/src/App.tsx`, `apps/client/src/components/MemberProfileHub.tsx`, and `apps/client/src/pages/MemberLoans.tsx` for profile layout conventions.

- [x] **Integrate cancellation confirmation and refresh behavior** - Add cancellation controls only to pending cards and connect them to the shared API operation.
  - Acceptance criteria: Only `PENDING` cards show **Cancel Reservation**; the accessible confirmation dialog identifies the book and dismissal causes no request; the My Reservations page opens the confirmation using native `<dialog>.showModal()` so it appears as a modal popup; confirming disables that card's action while the request is pending; success reports completion, refreshes list state, removes the record from pending, and allows it to appear in history as `CANCELLED`; failures retain last confirmed data and offer retry when appropriate; a stale-status conflict refreshes the record and explains it can no longer be cancelled.
  - References: Design sections “Cancel a pending reservation,” “Feedback and access,” and acceptance criteria 7–13; `apps/client/src/api/base.ts` and `specdocs/member-reservations/design.md`.

- [x] **Verify pagination, access control, and cancellation integration** - Add or extend automated API, storage, client, and Firestore Emulator verification for the acceptance criteria.
  - Acceptance criteria: Storage/API coverage verifies both status views, page boundaries, equal-timestamp tie-breaking, cursor reuse and rejection across members/views, title enrichment, invalid query inputs, and page errors; role/session tests verify member-only access and ownership isolation; cancellation integration verifies unassigned and assigned cases, retained reservation `copyId`/`expiryDate`, copy release/link clearing, stale status, and no automatic reassignment; client coverage verifies view switching, loading/empty/error/retry, further-page loading, ready-state rendering, confirmation dismissal/submit, duplicate-submit prevention, and refresh after success/conflict; emulator coverage confirms required indexes and Firestore cursor behavior.
  - References: Design sections “Acceptance criteria,” “Integration specifications,” and “Risks and tradeoffs”; `tests/member-notifications-api.test.mjs`, `tests/member-notifications-storage.test.mjs`, `tests/member-reservation-cancellation-storage.test.mjs`, and the relevant client test conventions.

## amendments

- 2026-10-20: Completed the bounded member reservation repository query and focused storage tests; build and tests passed. Firestore index/emulator validation follows in the next task.
- 2026-10-20: Added the member/status/date/ID composite index and static plus emulator query checks; checks passed.
- 2026-10-20: Exposed the paginated list endpoint through the repository and retained shared cancellation delegation; build and 11 API tests passed.
- 2026-10-20: Added typed paginated reservation list and cancellation API calls via apiRequest; build and focused client tests passed 8/8.
- 2026-10-20: Added the member-protected My Reservations page with separate pending/history cursors, status-aware cards, and loading/empty/error/retry/load-more states; build and focused page tests passed.
- 2026-10-20: Added accessible pending-only cancellation confirmation, duplicate-submit protection, success/stale refresh, and retry feedback; build and focused client tests passed 8/8.
- 2026-10-20: Expanded API and Firestore Emulator coverage for error/auth paths and cursor paging with tied timestamps/title enrichment; focused suite passed 40/40, full npm test passed 234/234, and prior emulator list/cancellation runs passed.
- 2026-10-20: Replaced the inline cancellation alert with a native modal popup opened by `showModal()` and styled its backdrop. Updated the cancellation requirement to make modal rendering explicit; automated verification was not rerun for this correction.

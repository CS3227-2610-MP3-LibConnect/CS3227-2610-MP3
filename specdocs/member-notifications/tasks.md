# Member Notifications Tasks

- [x] **Add notification preview and history queries** - Extend the existing notification repository to return the member dashboard preview and stable, cursor-paginated notification history.
  - Acceptance criteria: The preview returns every unread notification when any exist, plus the newest read notification only when there is exactly one unread; with no unread it returns up to the two newest read notifications. History returns read and unread records newest first in bounded pages, without duplicates or omissions across cursors. Every query scopes by the authenticated actor's `userId`. Equal timestamps have deterministic ordering. Required Firestore indexes are recorded in `firestore.indexes.json`.
  - References: Design sections **Dashboard preview**, **Full history and details**, **Storage and ordering**; `apps/api/src/storage/repositories.ts`; `packages/shared/src/domain/records.ts`; `firestore.indexes.json`.

- [x] **Expose member notification API routes** - Add the member notification router and mount it under `/api/v1/member/notifications`, following existing authentication, validation, serialization, and error conventions.
  - Acceptance criteria: Active members can request a preview, a history page, and a notification they own; they can mark only their own notification as read. Signed-out requests are rejected, librarians cannot use member routes, and another member's notification ID cannot be read or changed. The preview response follows the existing `{ items }` convention; history follows `{ items, page: { limit, nextCursor } }`; detail returns `{ notification }`; successful read updates return `204`. Validate unknown query fields, bounded page limits, and malformed or mismatched cursors. Serialize Firestore timestamps as ISO strings. Marking an already-read notification is idempotent.
  - References: Design sections **API and authorization**, **Storage and ordering**, **Integration flow**; `apps/api/src/routes/catalog.ts`; `apps/api/src/routes/member-profile.ts`; `apps/api/src/server.ts`; `apps/api/src/http/auth.ts`; `apps/api/src/http/errors.ts`.

- [x] **Add API and storage verification** - Cover notification ownership, preview selection, history pagination, read updates, and failure cases using the project's existing Node test and emulator patterns.
  - Acceptance criteria: Tests verify preview rules for zero, one, and multiple unread items; newest-first and stable history ordering; bounded pagination and cursor validation; owner access and cross-member denial; signed-out, inactive, and wrong-role denial; idempotent read updates; read-update failure behavior; and required Firestore queries/indexes against the emulator. Tests confirm timestamp serialization and the documented response envelopes.
  - References: Design sections **Acceptance criteria**, **API and authorization**, **Dependencies and verification**; `tests/member-loans-api.test.mjs`; `tests/verify-member-profile-emulator.mjs`; `tests/verify-catalog-year-range-emulator.mjs`; `package.json`.

- [x] **Add typed client notification API functions** - Add client methods and response types for preview, history pages, notification detail, and marking a notification read.
  - Acceptance criteria: Requests use the existing `apiRequest` helper and cookie credentials. History requests pass the server-provided cursor and bounded page size. The client exposes typed ISO timestamp and nullable reference fields consistent with the shared notification record. API errors use the existing `ApiClientError` behavior.
  - References: Design sections **Client**, **API and authorization**, **Integration flow**; `apps/client/src/api/base.ts`; `apps/client/src/api/catalog.ts`; `packages/shared/src/domain/records.ts`.

- [x] **Render the dashboard notification preview** - Add the notification section in the required position and implement the preview card and empty, loading, and retryable error states.
  - Acceptance criteria: The section appears below the welcome message and above catalog search. Cards show type and truncated message, are newest first, and visually distinguish read from unread. All preview selection cases match the specification. Notification loading and errors do not clear or interfere with catalog search state. Message content is rendered as text.
  - References: Design sections **Dashboard preview**, **Feedback and errors**, **Client**; `apps/client/src/pages/MemberDashboard.tsx`; `apps/client/src/styles.css`.

- [x] **Implement notification history and detail dialogs** - Add the scrollable full-history dialog and notification detail dialog, including paged loading and mark-as-read behavior.
  - Acceptance criteria: The full history includes read and unread notifications and loads additional bounded pages while scrolling until exhausted. A member can open a notification from either list and see its complete message, type, timestamp, and optional reference type and ID as non-link context. Opening an unread notification updates read state only after API confirmation and updates all visible copies. Opening a read notification does not issue a write; closing dialogs without opening an item does not change read state. Duplicate in-flight page and read requests are prevented. Failures are announced, retryable, and do not incorrectly mark an item read. Dialogs support keyboard use, focus handling, and accessible labels.
  - References: Design sections **Full history and details**, **Feedback and errors**, **Client**, **Integration flow**; `apps/client/src/pages/MemberDashboard.tsx`; `apps/client/src/api`.

- [ ] **Verify the integrated member notification experience** - Add client coverage for dashboard selection and dialog behavior, register the tests and emulator verification in the project scripts, then run the build and verification suites.
  - Acceptance criteria: Client tests cover selection rules, loading/empty/error/retry states, paged history, detail display, read styling and synchronization, and literal rendering of HTML-like message content. New automated tests are included in `npm test`. A notification emulator verification script and package command exercise the relevant Firestore queries and indexes. No notification feature test relies on another member's data being visible. The build, `npm test`, and notification emulator verification pass.
  - References: Design sections **Acceptance criteria**, **Dependencies and verification**, **Risks and tradeoffs**; `tests/client-member-dashboard-results.test.mjs`; `package.json`; `firestore.indexes.json`.

## amendments
- 2026-10-20: Completed notification preview and cursor-paginated history repository queries with deterministic timestamp/document ordering and required indexes.
- 2026-10-20: Added active-member notification preview, history, detail, and idempotent read routes with ownership, cursor validation, and timestamp serialization.
- 2026-10-20: Added API/storage ownership, pagination, read-update, and emulator verification coverage.
- 2026-10-20: Added typed cookie-authenticated client methods for preview, paged history, detail, and read updates.
- 2026-10-20: Added the member dashboard notification preview with independent loading/error states and read/unread presentation.
- 2026-10-20: Added paged history and detail dialogs with read-on-open confirmation, retry handling, keyboard support, and focus management.


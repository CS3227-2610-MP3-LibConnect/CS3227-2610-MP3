# Member Notifications

## Description

Add a member notification preview to the dashboard, a scrollable full-history
dialog, and a notification detail dialog. Members can see notifications
addressed to their account. Opening an unread notification marks it as read.
The full history loads in bounded pages as the member scrolls.

## Purpose

Help members stay informed about library activity through system-generated
and librarian-issued notifications, while ensuring that notification access
and read-state changes remain scoped to the authenticated recipient.

## Why this change is required

The member notification behavior is described in
`workflow/specs/Member/Notifications.md`, and the shared notification record
and supported types are defined in `packages/shared/src/domain/records.ts`.
The API repository in `apps/api/src/storage/repositories.ts` already has
methods for fetching unread notifications, fetching an individual
notification, and marking a notification read. However, the current source
has no member notification routes or notification client API. The member
dashboard in `apps/client/src/pages/MemberDashboard.tsx` has no notification
section. Members therefore do not yet have the specified interface for
viewing notifications or marking them read.

Reservation fulfillment can already create `RESERVATION_READY`
notifications in `apps/api/src/storage/workflows.ts`. This feature connects
members to notification records; it does not change notification creation.

## Capabilities

### Added

- A member dashboard preview that follows the unread/read selection rules.
- A scrollable, paginated dialog for the member's full notification history.
- A detail dialog showing a notification's full message and metadata.
- Mark-as-read behavior when an unread notification is opened.
- Loading, empty, retryable error, and update-in-progress states.

### Modified

- The member dashboard gains a notifications section below the welcome
  message and above catalog search.
- Existing notification repository methods will be exposed through
  authenticated member API routes and client API functions.
- No notification creation, domain fields, or notification types are
  intended to change.

## Product specifications

### Notification data and access

- Use the existing `Notification` record fields: `notificationId`,
  `recipientUserId`, `notificationType`, optional `referenceType` and
  `referenceId`, `message`, `createdAt`, and `read`.
- Supported types are `OVERDUE_ALERT`, `RESERVATION_READY`, `FINE_ISSUED`,
  `FINE_UPDATED`, and `LIBRARIAN_MESSAGE`.
- The boolean `read` field is authoritative: `false` means unread and `true`
  means read.
- Members may see and update only notifications addressed to their own
  account. The server derives the member identity from the authenticated
  session and enforces recipient ownership.

### Dashboard preview

- Show the notification section below the dashboard welcome message and
  above the catalog search bar.
- Sort notifications newest first by `createdAt`.
- Each preview card shows the notification type and a compact message preview.
  Truncate long messages with an ellipsis.
- Select preview entries as follows:
  - With two or more unread notifications, show all unread notifications and
    no read notifications.
  - With exactly one unread notification, show it and the most recent read
    notification if one exists.
  - With no unread notifications, show up to the two most recent read
    notifications.
  - With no notifications, show an empty state.
- Unread and read cards have visibly distinct styles.
- Provide **View All Notifications** to open the full history.

### Full history and details

- The full-history dialog includes all of the member's read and unread
  notifications, newest first. Load the history in bounded pages as the
  member scrolls; all pages remain reachable through the dialog.
- A notification opened from either the preview or full history displays its
  complete message, type, creation time, and any reference type and ID as
  non-link context. Reference details do not grant access to the referenced
  loan, reservation, or fine.
- Opening a dialog without opening a notification does not change read state.
- Opening an unread notification marks it read. Update its style everywhere
  currently displayed after the server confirms the change.
- Opening an already read notification does not require a write.
- Members cannot edit or delete notifications.

### Feedback and errors

- Provide loading states while retrieving the preview and full-history pages.
- Provide a clear empty state when no notifications are available.
- If loading the preview, a history page, or notification details fails, show
  a useful error state and allow retry.
- Prevent duplicate in-flight read updates for the same notification.
- If marking a notification read fails, show an error and keep it visibly
  unread so the member can retry.
- Render notification message content as text; do not interpret it as markup
  or executable content.

## Acceptance criteria

1. An authenticated member sees a notification section below the welcome
   message and above catalog search on the member dashboard.
2. Preview cards are ordered newest first and show notification type and a
   truncated message preview.
3. When at least two unread notifications exist, the preview shows all unread
   notifications and no read notifications.
4. When exactly one unread notification exists, the preview shows it and the
   newest read notification if one exists.
5. When no unread notifications exist, the preview shows up to the two
   newest read notifications. An empty notification set produces a clear
   empty state.
6. Read and unread notifications have visually distinct styles.
7. Selecting **View All Notifications** opens a scrollable dialog containing
   the member's full notification history. The client can load subsequent
   bounded pages until the history is exhausted.
8. A member can open a notification from the preview or full list and see
   its complete message, type, creation time, and optional reference type and
   ID. Reference metadata is informational and does not provide access to
   another feature's record.
9. Opening an unread notification changes its `read` field to `true` only
   after server confirmation and updates its style in all visible lists.
10. Opening an already read notification does not issue a read-state write.
11. Closing a list or detail dialog without opening an unread notification
    does not change its read state.
12. If loading a preview, history page, or detail fails, the UI shows a
    retryable error and does not display data belonging to another member.
13. If a read update fails, the notification remains visibly unread and can
    be retried. Repeated clicks do not create duplicate concurrent updates.
14. Unauthenticated requests are rejected. A member cannot fetch or mark
    read another member's notification, including by supplying its ID.
15. Notification message content is rendered as text and cannot inject
    markup into the UI.

## Technical specifications

The project uses React with TypeScript, an Express API, Firestore through
trusted server code, and cookie-backed sessions. The browser does not write
application records directly.

### Client

- Add notification API functions under `apps/client/src/api`, using the
  existing `apiRequest` helper and cookie credentials behavior in
  `apps/client/src/api/base.ts`.
- Add preview loading and presentation to
  `apps/client/src/pages/MemberDashboard.tsx`. Keep notification state and
  loading/errors independent from catalog search state.
- Add an accessible full-history dialog and detail dialog. Support keyboard
  operation, clear dialog headings, focus handling, and announced loading,
  error, and success states.
- Load subsequent history pages as the user scrolls; prevent duplicate page
  requests while one is in flight.
- Update local read state only after API confirmation. Keep a failed update
  visibly unread and expose a retry action.
- Rely on React's text rendering for messages. Do not use HTML injection APIs
  for notification content.

### API and authorization

Add a member notification router mounted under `/api/v1/member/notifications`.
Require an active member account. Resolve the actor from the authenticated
session and never accept a client-supplied recipient ID as authority.

Proposed endpoint contract:

| Method and path | Behavior |
|---|---|
| `GET /api/v1/member/notifications/preview` | Return the dashboard preview selection for the authenticated member. |
| `GET /api/v1/member/notifications?limit=…&cursor=…` | Return one bounded page of the member's history and an optional continuation cursor. |
| `GET /api/v1/member/notifications/:notificationId` | Return one notification only if it belongs to the authenticated member. |
| `PATCH /api/v1/member/notifications/:notificationId/read` | Mark the member's notification read, after checking recipient ownership. |

These paths and response shapes are proposed to fit the current `/api/v1`
convention; implementation should confirm the response envelopes alongside
existing API patterns. Validate page limits and cursor input. Use the existing
API error envelope and avoid exposing Firestore internals.

The existing `getNotification` and `markNotificationRead` repository methods
already perform ownership checks. Reuse or adapt them behind the new member
routes. The existing read update uses a Firestore transaction; preserve that
transactional ownership check and make marking read idempotent.

### Storage and ordering

- Query notifications by `recipientUserId` and order by `createdAt` descending.
- Use a stable tie-breaker, such as document ID, to make pagination
  deterministic when timestamps match.
- Return an opaque continuation cursor bound to the query ordering and
  recipient context. The server still derives the recipient from the session.
- Add composite Firestore indexes required by the actual query shapes to
  `firestore.indexes.json`.
- The dashboard selection rule requests all unread notifications when there
  are two or more. This can produce a large preview response; the requirement
  currently has no preview cap. Preserve the rule unless the product
  requirement is revised.
- Serialize Firestore timestamps to the API's established ISO 8601 format.

### Integration flow

1. The member dashboard requests the preview with its session cookie.
2. The API authenticates the session, verifies active member access, and
   queries only records whose `recipientUserId` matches the session actor.
3. The preview response is ordered and selected according to the product
   rules.
4. When the member opens the full-history dialog, the client loads the first
   page and requests further pages as needed while scrolling.
5. When the member opens a notification, the client retrieves its detail if
   needed, then requests a read update if the server state was unread.
6. On successful update, the client marks the item read in every visible
   representation. On failure, the UI retains unread styling and offers
   retry.

### Dependencies and verification

- Reuse existing session middleware, active-actor authorization, Firestore
  Admin access, repository conventions, and API error handling.
- Add API tests for recipient isolation, signed-out and wrong-role access,
  pagination ordering and cursor behavior, read idempotence, and failed
  updates.
- Add client tests for preview selection rules, dialog behavior, read styling,
  loading and empty states, retry behavior, and paged history loading.
- Verify that text with HTML-like content is displayed literally.
- Verify required Firestore indexes against emulator query execution.

## Out of scope

- Creating, editing, or deleting notifications.
- Deciding when system or librarian notifications are issued.
- Linking reference metadata to loan, reservation, or fine pages.
- Changing notification types or the shared notification record schema.
- Adding push, email, or SMS delivery.

## Risks and tradeoffs

- Showing every unread notification in the preview may result in an unbounded
  response when many unread records accumulate. The approved behavior has no
  cap; revising it requires a product decision.
- Pagination requires deterministic ordering and correct cursor handling to
  prevent duplicates or skipped notifications.
- Notification reference IDs are identifiers, not authorization. Any future
  links must route through the referenced feature's own access checks.
- Notification messages may contain arbitrary text. They must remain data
  when rendered, even when a message originated from a librarian.

## Context reviewed

- `AGENTS.md` — team ownership and integration constraints.
- `Overview.md` — notification entity, supported notification types, and
  project architecture context.
- `workflow/PLAN.md` — module boundaries, circulation ownership, and notification
  reference expectations.
- `workflow/specs/Member/Notifications.md` — member-facing notification
  requirements.
- `packages/shared/src/domain/records.ts` — current notification schema.
- `apps/api/src/storage/repositories.ts` — current get, unread-list, and
  mark-read repository methods.
- `apps/api/src/storage/workflows.ts` — reservation-ready notification
  creation.
- `apps/api/src/server.ts` — API route mounting and session middleware.
- `apps/client/src/api/base.ts` — client API request and cookie behavior.
- `apps/client/src/pages/MemberDashboard.tsx` — current dashboard layout.

Source code was available and inspected. No implementation files were changed
as part of this design.

## Amendments

### 2026-10-23 — Readable notification labels

- Requested after a user-guide walkthrough found members seeing internal codes
  such as `FINE_ISSUED` and `FINE`.
- Preview cards, history items, and the detail dialog show the notification
  type as a readable label (for example "Fine issued", "Library message").
  The detail dialog labels the reference type as "Related to" with a readable
  value ("Loan", "Reservation", "Fine") and still shows the reference ID as
  non-link context. Stored values and API responses are unchanged.

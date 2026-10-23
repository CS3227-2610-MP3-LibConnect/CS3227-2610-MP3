# Member notifications

## Purpose and current behavior

The member dashboard displays notifications addressed to the signed-in member. Members can inspect a newest-first preview, browse the complete history in a scrollable dialog, and open a detail dialog. Opening an unread notification requests a read update; the UI changes its read styling only after the server confirms. Members cannot create, edit, or delete notification records through this feature.

All seven tasks in `workflow/specdocs/member-notifications/tasks.md` are complete. The final integration task adds Playwright browser coverage for the dashboard preview, history paging, detail dialog, and read-state flows, and registers it in the default test suite. Preview selection is performed by the server; repository tests cover zero, one, and multiple unread cases, while browser tests verify that the dashboard renders each server-selected response in order.

## Architecture and request flow

```mermaid
sequenceDiagram
    participant UI as MemberDashboard
    participant API as Member notifications router
    participant Repo as LibraryRepository
    participant DB as Firestore
    UI->>API: GET preview/history with session cookie
    API->>API: Resolve active actor and require MEMBER role
    API->>Repo: Query using actor.userId
    Repo->>DB: Recipient-scoped ordered query
    DB-->>Repo: Notification records
    Repo-->>API: Preview or page and cursor
    API-->>UI: ISO serialized response envelope
    UI->>API: GET notification detail
    API->>Repo: Get notification for actor
    Repo->>DB: Read notification document
    DB-->>Repo: Notification
    Repo-->>API: Verify recipient ownership
    API-->>UI: Detail envelope
    UI->>API: PATCH read (only if detail is unread)
    API->>Repo: Transactionally verify recipient and set read=true
    Repo->>DB: Transaction
    DB-->>Repo: Commit
    API-->>UI: 204
    UI->>UI: Update visible preview/history after confirmation
```

### Storage

`apps/api/src/storage/repositories.ts` implements the member queries on `LibraryRepository`:

- `notificationPreview(actor)` requires an active member. It queries all unread notifications for `actor.userId`; when there are fewer than two, it separately queries up to one or two newest read notifications. A merge sorts by timestamp and document ID descending.
- `notificationHistory(actor, limit, cursor)` requires an active member, validates a 1–100 page bound and actor-bound cursor, orders by `createdAt` descending and document ID descending, and requests one extra record to determine whether another page exists. Cursor timestamps preserve Firestore seconds and nanoseconds.
- Existing `getNotification` and `markNotificationRead` methods enforce recipient ownership. The read update uses a Firestore transaction.

The required composite indexes are in `firestore.indexes.json`: recipient/read/createdAt/document ID for filtered preview queries, and recipient/createdAt/document ID for full history.

### API

`apps/api/src/routes/member-notifications.ts` is mounted from `apps/api/src/server.ts` at `/api/v1/member/notifications`. Each endpoint resolves an active session actor and applies a member-role check. Recipient IDs are taken from the actor, never from request parameters.

| Request | Response and behavior |
|---|---|
| `GET /preview` | `{ items }`, with Firestore timestamps serialized as ISO strings. |
| `GET ?limit=…&cursor=…` | `{ items, page: { limit, nextCursor } }`; limit defaults to 20 and is bounded to 1–100. Cursor is base64url encoded, validated, and bound to the actor. Unknown query fields are rejected. |
| `GET /:notificationId` | `{ notification }` only when the notification belongs to the member. |
| `PATCH /:notificationId/read` | Verifies ownership, skips a write for an already-read notification, and returns `204`. |

The router uses the shared API error envelope. Signed-out, inactive, wrong-role, malformed-cursor, and foreign-recipient access paths are covered by tests.

### Client API and dashboard

`apps/client/src/api/notifications.ts` defines the client `NotificationRecord`, notification type/reference unions, response envelopes, and `notificationsApi` methods for preview, history, detail, and mark-read. All requests use `apiRequest` and its cookie credentials, 204 handling, and `ApiClientError` behavior. Timestamps are typed as ISO strings; reference fields are nullable.

`apps/client/src/pages/MemberDashboard.tsx` renders the preview between the greeting and catalog search. It preserves server ordering and selection, labels each card's type/read state, truncates message previews, and keeps notification loading and error state separate from catalog state. Messages use normal React text rendering.

The dashboard also owns history and detail dialogs. History requests pages of 20 using the returned cursor, appends and deduplicates records, and prevents concurrent page requests while scrolling. Detail content shows the full message, type, localized creation time, and reference fields as plain text. An unread item is marked read only after detail retrieval and server update; confirmed state is synchronized across visible preview and history items. Failed updates stay unread and expose a retry. Dialogs support Escape, Tab focus containment, labels, and focus restoration.

## Verification

- `npm run build` passed; Vite emitted an advisory that the main JavaScript chunk is larger than 500 kB.
- `npm test` passed with 244 tests and 0 failures, including the Playwright notification browser tests.
- `npm run verify:member-notifications:emulator` targets the integrated local Firestore Emulator at `127.0.0.1:8080` using the `demo-libconnect` project. The verifier checks preview selection, scoped history ordering, bounded cursor pages, and recipient isolation, then deletes its random fixtures.
- `tests/client/client-member-notifications-browser.test.mjs` exercises preview loading/error/retry and empty states; exact-one, zero, and multiple-unread server-selected preview responses; read/unread styling; cursor-driven history append; detail fields; literal HTML-like text; confirmed read synchronization; skipping writes for already-read items; and retry after a failed read update.
- The emulator verifier requires a local Firestore Emulator, a `demo-*` project ID, and a non-production environment.

## Notification creation ownership

This feature does not change notification creation. Reservation fulfillment continues to create `RESERVATION_READY` notifications in `apps/api/src/storage/workflows.ts`, within the librarian circulation workflow.

# Member Reservations List

## Description

Let signed-in members review their pending reservations and reservation history, and cancel a reservation that is still pending. The list is available from the member profile. Reservation creation from a book detail page is specified separately in `specdocs/member-reservations/design.md`.

## Purpose

Give members a reliable view of their reservation status, including whether an assigned copy is ready for pickup, while allowing them to cancel their own pending reservation.

## Why this change is required

The My Reservations route currently renders a placeholder in `apps/client/src/App.tsx`, and the member profile navigation already links to that route. There is no member reservation list route or list page. `LibraryRepository.memberActivity` in `apps/api/src/storage/repositories.ts` can retrieve reservations for an authorized member, but it returns every reservation without pagination and is not exposed through the member API. The reservation record in `packages/shared/src/domain/records.ts` stores the ISBN, status, assignment, and expiry data, but not a book title.

The existing member creation workflow is in `apps/api/src/storage/workflows.ts`. The approved member-reservation design specifies a shared cancellation operation for book detail and My Reservations, but the current source does not yet expose a member cancellation route or implement `cancelMemberReservation`. This feature adds the paginated list and profile UI and integrates cancellation with that shared operation. It does not implement librarian assignment, ready notifications, or expiry processing.

Book deletion is prevented while any reservation references its ISBN (`LibraryRepository.deleteBook`), so the list can enrich reservation results with the current book title without adding a title snapshot to the reservation schema.

## Capabilities

### Added

- A member-only My Reservations page with pending and history views.
- Bounded cursor pagination for both views.
- Clear waiting-for-copy and ready-for-pickup presentation, including the pickup expiry date when assigned.
- Cancellation of the member's own pending reservation through the shared cancellation operation.
- Loading, empty, retry, confirmation, in-progress, success, and stale-state feedback.

### Modified

- Replace the My Reservations placeholder at `/member/profile/reservations` with the paginated member reservation experience.
- Expose a paginated member-owned reservation list through the API.
- Reuse the member cancellation operation defined by `specdocs/member-reservations/design.md`; do not add a second cancellation state transition.

Reservation creation, reservation record fields, librarian assignment, notification, and expiry behavior are not intended to change.

## Product specifications

### Reservation list

- The My Reservations section is available to signed-in members only.
- Show the authenticated member's `PENDING` reservations by default.
- Provide a history view containing `FULFILLED`, `CANCELLED`, and `EXPIRED` reservations, with status clearly shown.
- Paginate both views in bounded pages. All pages remain reachable as the member loads more results or otherwise navigates through the list.
- Order records newest first by `reservationDateTime`. Use a stable secondary ordering so records with the same timestamp are neither skipped nor duplicated across pages.
- Each reservation card shows the reserved book title, status, and creation date.
- A `PENDING` reservation with no assigned `copyId` is waiting for a copy. A `PENDING` reservation with an assigned `copyId` and `expiryDate` is ready for pickup; distinguish it from a waiting reservation and display its pickup expiry date.
- A cancelled reservation may retain historical `copyId` and `expiryDate`. Its status remains `CANCELLED`; historical assignment fields do not make it ready for pickup.
- Show an empty state for a selected view with no reservations. Provide loading and retryable error states when a page cannot be loaded.

### Cancel a pending reservation

1. Show **Cancel Reservation** only for a reservation with status `PENDING`, whether waiting for a copy or assigned and ready for pickup.
2. Selecting **Cancel Reservation** opens a confirmation dialog identifying the reserved book. Dismissing the dialog makes no change.
3. After confirmation, submit the reservation ID to the member cancellation endpoint. The server derives the member from the authenticated session, verifies ownership, and requires status `PENDING`.
4. On success, mark the reservation `CANCELLED`. If a copy is assigned, release it from `RESERVED` to `AVAILABLE` and clear the live copy's `reservationId` atomically. Preserve the reservation's `copyId` and `expiryDate` as historical assignment data. Do not automatically assign the released copy to another reservation.
5. Show success feedback and refresh the relevant list state. The reservation leaves the pending view and appears in history as `CANCELLED`.
6. If cancellation fails because the reservation is no longer pending, refresh its state and explain that it can no longer be cancelled.

### Feedback and access

- Prevent duplicate cancellation submissions for the same reservation while a request is in progress.
- On list or page-load failure, show an error and allow retry. Do not display another member's reservations as a fallback.
- On cancellation failure, retain the last server-confirmed state, show actionable feedback, and allow retry when appropriate.
- The server must enforce ownership and role authorization. Client-side filtering is not an authorization boundary.

## Acceptance criteria

1. A signed-in member can open My Reservations from the member profile and see their pending reservations by default.
2. The member can switch to history and see only their `FULFILLED`, `CANCELLED`, and `EXPIRED` reservations.
3. Both views load reservations in bounded pages, newest first, with stable pagination when timestamps are equal. The member can reach all pages.
4. Reservation cards show the book title, status, and creation date. Assigned pending reservations show their expiry date and are visibly distinct from reservations waiting for a copy.
5. Cancelled reservations with retained assignment fields are presented as cancelled, not ready for pickup.
6. Each view provides appropriate loading, empty, error, and retry states.
7. Only pending reservations offer cancellation. Dismissing the confirmation dialog leaves the reservation and any assigned copy unchanged.
8. A successful cancellation moves the reservation out of pending and into history as `CANCELLED`.
9. Cancelling an unassigned reservation changes its status to `CANCELLED` without changing a copy.
10. Cancelling an assigned reservation atomically changes the reservation status to `CANCELLED`, the linked copy from `RESERVED` to `AVAILABLE`, and clears the copy's `reservationId`; the reservation retains `copyId` and `expiryDate` as history.
11. Cancellation does not automatically assign the released copy to another reservation.
12. The server returns and changes only reservations owned by the authenticated member. Requests by signed-out users, librarians, or a member acting on another member's record are rejected.
13. Duplicate in-flight cancellations are prevented in the UI. On failure, the UI retains confirmed state and refreshes after a stale-status conflict.

## Technical specifications

The application uses React with TypeScript, an Express API, Firestore accessed through trusted server code, and cookie-backed sessions. The browser must not write reservation or copy records directly.

### Client

- Replace the placeholder rendered for `/member/profile/reservations` with a member reservation page.
- Add typed member reservation list and cancellation calls under `apps/client/src/api`, using the shared `apiRequest` helper and cookie-backed session behavior.
- Keep pending and history view state separate, including each view's current items, cursor, loading/error state, and whether more pages are available. Reset the cursor when switching views or refreshing after a state transition.
- Use the returned server state as authoritative. Do not infer active assignment from `copyId` alone; status `PENDING` and a valid assignment/expiry determine ready-for-pickup presentation.
- Implement accessible cancellation confirmation and announce success and errors. Disable the action while that reservation's request is in progress.

### API and authorization

Proposed list contract, following the existing catalog API's bounded pagination response pattern:

| Method and path | Behavior |
|---|---|
| `GET /api/v1/member/reservations?view=pending|history&limit=20&cursor=…` | Return one page of the authenticated member's reservations for the selected view. |
| `DELETE /api/v1/member/reservations/:reservationId` | Reuse the approved cancellation operation; return `204` on success as specified in `specdocs/member-reservations/design.md`. |

The list response is `{ items, page: { limit, nextCursor } }`. The proposed default page size is 20 and maximum is 50, matching the catalog route convention. The cursor must be opaque, validate its shape, and be bound to the member and view/query so it cannot be reused to change filters. The API derives the member ID from the authenticated actor and accepts no member ID from the client.

The list endpoint requires an active member actor. A librarian or unauthenticated caller is rejected. The cancellation endpoint must share the same cancellation workflow as the book detail flow, including the existing ownership and status checks; do not duplicate or weaken those checks.

### Storage and serialization

- Query reservations using the authenticated member ID and the selected status set: `PENDING` for pending, and `FULFILLED`, `CANCELLED`, `EXPIRED` for history.
- Order by `reservationDateTime` descending, then document ID descending for a deterministic cursor. Use Firestore cursor pagination (`startAfter`) and fetch at most `limit + 1` documents to determine whether another page exists.
- Add the composite Firestore indexes required by the concrete member/status/order query shapes to `firestore.indexes.json`.
- Enrich the page's reservation records with book titles using batched book reads keyed by ISBN, avoiding one query per reservation. Preserve reservation identity and ownership fields from the reservation record; return only fields needed by the member UI.
- Reuse the API's timestamp-to-JSON serialization and established error envelope. Validate view, limit, and cursor query parameters.
- The existing unbounded `memberActivity` method should not be used as-is for this page. If the implementation reuses it, it must first be changed to enforce bounded paging and keep member identity derived from the actor.

## Integration specifications

- The My Reservations page complements the book-detail flow in `specdocs/member-reservations/design.md`. Creation remains on the detail page; cancellation is a shared member operation.
- The approved cancellation behavior applies in both entry points. For an assigned reservation, cancellation releases the linked copy atomically, clears the copy's `reservationId`, and keeps the reservation's historical `copyId` and `expiryDate`.
- Librarian queue ordering, assignment, ready-notification creation, pickup, and 15-day expiry remain with the librarian/reservation-processing workflows owned by the other feature area. This page displays assignment and expiry state but does not create or alter it except through member cancellation.
- Cancellation and librarian pickup/expiry can race. The shared transaction must accept cancellation only while the reservation remains `PENDING` and verify the copy is still `RESERVED` and linked before releasing it; a stale or inconsistent state must fail without partial updates.
- Reservation lookup/list indexes and status query shapes must be coordinated with the Firestore emulator and current index definitions during implementation.

## Out of scope

- Reservation creation from the book detail page.
- Queue ordering, copy assignment, ready notifications, pickup, or expiry processing.
- Automatically assigning a copy released by cancellation to another reservation.
- Editing reservation details or directly changing reservation status from the client.
- Changes to the reservation schema or librarian workflows.

## Risks and tradeoffs

- Pagination over multiple statuses requires an index matching the member filter and stable ordering. The selected index/query must be verified against Firestore rather than relying on the existing unbounded member activity query.
- Reservation and book title enrichment adds reads. Batch lookup avoids an N+1 request pattern; books cannot be deleted while reservation references remain, which protects title availability under the current deletion rule.
- Reservation timestamps can tie, so omitting document ID from ordering/cursor logic could cause duplicate or missing records between pages.
- Cancellation races with pickup and expiry. The existing member cancellation design requires transactional linkage checks; this list feature must call that same operation.
- Retaining `copyId` and `expiryDate` on cancellation preserves assignment history. Every display and workflow must use reservation status and the live copy link to determine whether an assignment is active.

## Context reviewed

- `AGENTS.md` — application overview and developer responsibility boundaries.
- `Overview.md` and `PLAN.md` — domain model, reservation lifecycle, and member/librarian ownership.
- `PlanDraft/Developer_Responsibilities/junhong.md` and `PlanDraft/Developer_Responsibilities/jiali.md` — ownership of member and librarian reservation work.
- `PlanDraft/Specs/Member/MyReservations.md` — member list and cancellation requirements.
- `PlanDraft/Specs/Member/CreateReservation.md` — member creation and cancellation requirements.
- `PlanDraft/Specs/Member/ProfilePage.md` — profile route and navigation context.
- `specdocs/member-reservations/design.md` — approved book-detail creation and shared cancellation contract.
- `packages/shared/src/domain/records.ts` — reservation and book record schemas.
- `apps/api/src/storage/workflows.ts` — current member creation workflow and reservation lifecycle operations.
- `apps/api/src/storage/repositories.ts` — current member activity query, reservation access, and book deletion constraint.
- `apps/api/src/routes` and `apps/api/src/server.ts` — current member route mounts; no reservation list route exists yet.
- `apps/client/src/App.tsx` and `apps/client/src/components/MemberProfileHub.tsx` — profile route and navigation; the list route currently renders a placeholder.
- `apps/api/src/routes/catalog.ts` — bounded page size, cursor validation, and response envelope conventions.
- `firestore.indexes.json` — index definitions to update for the member/status/order query shapes.

Source code was available and inspected. No implementation or existing specification files were changed during this design task. The user's pagination decision is to paginate both pending and history views. The approved cancellation decision is to retain `copyId` and `expiryDate` on cancelled reservations as historical data.

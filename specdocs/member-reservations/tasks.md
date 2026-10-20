# Member Reservations Implementation Tasks

Implementation plan for [`design.md`](./design.md). The transaction or
serialization mechanism for concurrent duplicate prevention is intentionally
left open for the implementer to select based on Firestore behavior and the
existing circulation workflows. The acceptance outcome is fixed: if two
eligible requests for the same member and ISBN arrive concurrently, exactly
one request creates a pending reservation; the resulting data contains at
most one pending reservation for that member and ISBN. Document the selected
mechanism and verify it with the Firestore Emulator.

- [x] **Add member reservation storage workflows** - Implement member-scoped lookup and creation, enforcing active member identity, existing-book and unavailable-copy eligibility, and one pending reservation per member and ISBN. Select and document a Firestore transaction/serialization strategy that also rechecks a concurrently borrowed last available copy. Keep the existing librarian-only `LibraryRepository.createReservation` authorization intact.
  - Acceptance criteria: The server uses the authenticated member ID; an unknown ISBN or a title with an `AVAILABLE` copy cannot be reserved; zero-copy and otherwise unavailable titles can be reserved; a new record is `PENDING`, has a server timestamp, and has null/unset `copyId` and `expiryDate`; creation does not assign a copy or create a ready notification. Concurrent eligible requests for the same member and ISBN result in exactly one created pending reservation, with no duplicate pending record. The chosen concurrency mechanism is documented.
  - References: Design sections “Reservation action and eligibility,” “Create a reservation,” “Storage and state transitions,” and Acceptance criteria 1, 3–5; `apps/api/src/storage/repositories.ts`; `apps/api/src/storage/workflows.ts`; `packages/shared/src/domain/records.ts`.

- [x] **Add transactional member cancellation** - Implement reusable member-owned cancellation for unassigned and assigned pending reservations, preserving historical assignment fields and coordinating the copy transition with librarian pickup and expiry workflows.
  - Acceptance criteria: Only the owner can cancel, and only while status is `PENDING`; an unassigned reservation becomes `CANCELLED` without changing a copy; an assigned reservation becomes `CANCELLED` while its linked `RESERVED` copy becomes `AVAILABLE` and has `reservationId` cleared in the same transaction; the reservation retains `copyId` and `expiryDate`; inconsistent linkage or a stale status causes a conflict without partial writes; cancellation does not assign the released copy to another reservation. The existing librarian assignment, pickup, and expiry responsibilities remain unchanged.
  - References: Design sections “Cancel a reservation,” “Storage and state transitions,” and “Integration with librarian circulation”; Acceptance criteria 8–11; `apps/api/src/storage/workflows.ts`; `PlanDraft/Developer_Responsibilities/jiali.md`.

- [x] **Expose member reservation API routes** - Add the proposed lookup, create, and cancel routes under `/api/v1/member`, using active-member authorization, request validation, session-derived ownership, and the project's API error conventions.
  - Acceptance criteria: `GET /reservations/by-isbn/:isbn` returns the signed-in member's pending reservation or `null`; `POST /reservations` accepts `{ isbn }` and returns the created reservation; `DELETE /reservations/:reservationId` cancels only the signed-in member's pending reservation and returns `204`; signed-out users and librarians are denied; client-supplied owner identifiers are rejected; duplicate-pending and stale-state failures map to safe actionable API errors. Cancellation calls the reusable workflow from the preceding task.
  - References: Design section “API and authorization,” proposed API contract, and Acceptance criteria 12; `apps/api/src/routes/member-borrow.ts`; `apps/api/src/http/auth.ts`; `apps/api/src/server.ts`; `apps/api/src/http/errors.ts`.

- [ ] **Add reservation API and book-detail interaction** - Add typed client API calls and update `MemberBookDetail` to load member reservation state, render the correct action, submit creation/cancellation, and provide accessible confirmation and feedback.
  - Acceptance criteria: The book details remain visible while reservation state loads; a new reservation action is unavailable until eligibility and member state are known; a pending reservation shows **Cancel Reservation** regardless of copy availability; creation requires no confirmation and cancellation does; the cancellation dialog is keyboard operable and announces results/errors; actions are disabled during requests; successful actions refresh server-confirmed state and show confirmation; eligibility/stale-state failures refresh state and show an explanation while retaining the last confirmed state; other members' reservation state is never used as fallback.
  - References: Design sections “Reservation action and eligibility,” “Feedback and errors,” and “Client”; Acceptance criteria 2, 6–7, and 13; `apps/client/src/api/base.ts`; `apps/client/src/api/borrow.ts`; `apps/client/src/pages/MemberBookDetail.tsx`.

- [ ] **Verify reservation behavior and add required indexes** - Add API/client coverage and Firestore Emulator verification for the full member flow, concurrency, and linked-copy transitions; add indexes required by the implemented query shapes.
  - Acceptance criteria: Verification covers zero-copy and unavailable titles, available-copy rejection, exactly one creation under two simultaneous same-member/same-ISBN requests, duplicate sequential creation, ownership and role restrictions, cancellation before and after assignment, retained historical fields, atomic rollback on stale or inconsistent linkage, and client confirmation/loading/error/refresh behavior. Required indexes are present in `firestore.indexes.json`; verification demonstrates the queries work against the Emulator. Existing tests and workflows for librarian assignment, pickup, and expiry remain compatible.
  - References: Design sections “Storage and state transitions,” “Verification,” “Integration with librarian circulation,” and Acceptance criteria 1–13; `firestore.indexes.json`; `package.json`; `tests/`.

## amendments

- 2026-10-20: Completed member reservation lookup and transactional creation. Verified duplicate and last-copy concurrency against the Firestore Emulator; the workflow serializes on the member document and touches the book document to coordinate inventory changes.
- 2026-10-20: Completed transactional member cancellation. Verified owner/status checks, linked-copy release, historical assignment retention, and conflict rollback for inconsistent copy links.
- 2026-10-20: Exposed member reservation lookup, creation, and cancellation routes. Verified active-member/session authorization, strict request validation, response contracts, and error envelopes.

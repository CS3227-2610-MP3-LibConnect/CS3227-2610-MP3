# Design

## Context

The API currently exposes only `/health`. Firestore Admin initialization, Express session middleware, Zod record schemas, and partial repositories already exist. Repository methods currently support book save/read/search and copy create/read/list, but not HTTP routing, update/delete operations, or request-scoped authentication middleware. See `proposal.md` and the capability spec for the behavior contract.

## Goals / Non-Goals

**Goals:**

- Provide a small JSON API for catalog browsing and librarian catalog/inventory maintenance.
- Keep Firestore access in server-side routes/services and enforce authorization from the persisted user account.
- Make deletion checks safe against concurrent book/copy/reference changes.
- Return stable, useful HTTP status codes and validation errors to the frontend.

**Non-Goals:**

- Implement frontend pages, auth registration/login flows, or unrelated circulation endpoints.
- Let generic copy updates change circulation-controlled statuses; loan, return, reservation, and loss workflows own those transitions.
- Add soft deletion, cascading deletion, new database fields, or external dependencies.

## Decisions

1. **Use resource routes under `/api/v1`.** Expose `GET /books?q=&limit=&cursor=` for title search, `GET /books/:isbn` for details, and `GET /books/:isbn/copies` for availability. Librarian mutations use `POST /books`, `PATCH /books/:isbn`, `DELETE /books/:isbn`, `POST /books/:isbn/copies`, `PATCH /copies/:copyId`, and `DELETE /copies/:copyId`. A separate `GET /copies/:copyId` may support direct links. Resource-oriented routes fit the frontend's catalog screens; workflow mutations remain explicit actions in their own API change.

2. **Allow catalog reads without a session; require an active librarian for mutations.** Catalog metadata and copy availability are public product information. For each mutation, resolve the session's user ID from Firestore and check that the persisted account remains active and has type `LIBRARIAN`; never trust role or owner fields from JSON. This makes account deactivation effective even for an existing cookie. A shared authorization middleware should be reusable by later API areas.

3. **Validate request DTOs separately from stored record schemas.** Zod request schemas accept only client-editable fields. The server generates timestamps and copy IDs, keeps ISBN/copy ID immutable on update, and strips password hashes, session values, and Firestore metadata from responses. Book edits do not replace related copy, loan, reservation, or fine records. Search uses bounded page sizes and a stable title/ISBN order with an opaque cursor.

4. **Keep copy status under workflow control.** Generic copy PATCH changes shelf location and other explicitly editable inventory metadata, but not status or the ISBN. A new copy starts as `AVAILABLE`; circulation workflows set `ON_LOAN`, `IN_TRANSIT`, `RESERVED`, `DAMAGED`, and `LOST` as their rules require. This avoids an inventory CRUD endpoint bypassing loan/reservation invariants. Deletion checks the current stored status inside a transaction and permits only `AVAILABLE`, `DAMAGED`, or `LOST`.

5. **Use transactional guards for deletion and reference creation.** Book deletion reads the book and queries both `bookCopies` by ISBN and `reservations` by ISBN in one Firestore transaction. Any matching copy or reservation returns `409 Conflict`; otherwise only the book document is deleted. Copy deletion reads the current copy status inside a transaction, then checks its parent and deletes only if the status is eligible. Copy creation and reservation creation must coordinate through their existing Firestore transactions so a concurrent reference cannot be committed against a book being deleted. Transaction conflicts are retried by Firestore; the route maps a final state conflict to 409.

6. **Preserve historical records and do not cascade.** Deleting an eligible copy removes only its current inventory document; loans and fines retain their stable IDs, ISBN, title snapshots, and copy ID. Book deletion is blocked while any reservation still uses its ISBN, including terminal reservations, so a reservation never loses its catalog identity. No unrelated records are deleted as a side effect.

7. **Return a consistent JSON error envelope.** Use `{ error: { code, message, fields? } }` with 400 for invalid input, 401 for missing/invalid session on protected routes, 403 for wrong role/inactive actor, 404 for missing resources, 409 for uniqueness or state conflicts, and a generic 500 response that omits Firestore internals. Successful reads and mutations return JSON records with timestamps serialized as ISO strings.

## Risks / Trade-offs

- [Public catalog reads may be scraped] → Bound page size, restrict search fields, and add rate limiting if production traffic warrants it.
- [Concurrent delete and reference creation can leave dangling relationships] → Keep guard checks and associated writes transactional and coordinate them on the parent book record.
- [Deleting a lost or damaged copy can leave historical loans pointing to a copy ID with no current inventory record] → Preserve loan/fine snapshots and return the copy ID as historical data; do not cascade-delete history.
- [The session middleware alone does not confirm that an account is still active] → Reload the account from Firestore for each authenticated mutation and reject inactive accounts.

## Migration Plan

No data migration is required. Add routers/services and register them before the 404/error handlers. Deploy the updated Firestore indexes if the selected search/pagination query needs them, then deploy the API and frontend against the same `/api/v1` contracts. Roll back by reverting the server release; retain all existing Firestore records.

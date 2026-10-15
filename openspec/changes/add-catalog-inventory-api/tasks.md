# Tasks

## 1. API foundation and authorization

- [ ] 1.1 Add `/api/v1` router registration, request DTO validation, and a consistent JSON error handler; verify malformed requests and storage errors map to the documented status codes and envelope.
- [ ] 1.2 Add session-backed actor loading that reloads the account and enforces active status and librarian role on mutations; verify unauthenticated, member, inactive, and librarian requests receive the expected outcomes.
- [x] 1.3 Document the catalog/inventory API conventions and authentication requirements in the developer guide; verify documented routes and error shapes match the implementation.

## 2. Catalog and availability reads

- [ ] 2.1 Implement bounded title search with stable ordering and pagination cursors; verify prefix results, limits, ordering, and successive pages against the Firestore Emulator.
- [ ] 2.2 Implement book detail and per-book copy availability reads with safe response DTOs; verify missing ISBNs return 404 and returned records omit server-only fields.
- [ ] 2.3 Add route-level integration coverage for anonymous and authenticated catalog reads and document request/response examples; verify the examples match emulator-backed responses.

## 3. Book catalog mutations

- [ ] 3.1 Implement librarian-only book creation and partial metadata updates with server timestamps and immutable ISBN; verify invalid fields do not write and updates preserve creation time and related records.
- [ ] 3.2 Implement transactional book deletion that rejects any associated copy or reservation and coordinates with concurrent copy/reservation creation; verify eligible deletion and 409 conflicts, including concurrent reference creation, in the emulator.
- [x] 3.3 Document book mutation fields, uniqueness behavior, and deletion conflicts; verify the docs match the route schemas and response behavior.

## 4. Physical copy inventory mutations

- [ ] 4.1 Implement librarian-only copy creation for an existing ISBN with a server-generated copy ID and initial `AVAILABLE` status; verify duplicate or unknown-book creation is rejected and valid copies are persisted.
- [ ] 4.2 Implement copy metadata updates while preventing generic status or ISBN changes; verify only allowed fields change and circulation-controlled fields are rejected.
- [ ] 4.3 Implement transactional copy deletion for current statuses `AVAILABLE`, `DAMAGED`, or `LOST`; verify those statuses can be deleted, `IN_TRANSIT`/`ON_LOAN`/`RESERVED` return 409, and a concurrent status change prevents deletion.
- [x] 4.4 Document copy lifecycle ownership and delete behavior; verify API docs distinguish editable metadata from workflow-controlled status transitions.

## 5. Integration review

- [ ] 5.1 Review catalog and inventory scenarios end to end, run the focused API integration suite, and record evidence for authorization, validation, pagination, and deletion constraints.

# Spec Delta

## Purpose

Provides a role-aware HTTP interface for browsing LibConnect's book catalog and physical copy availability, and for librarians to maintain catalog and inventory records through the trusted server.

## ADDED Requirements

### Requirement: Browse catalog records
The API MUST let a caller search the catalog and read a book record with its physical-copy availability summary.

#### Scenario: Search the catalog
- **WHEN** a caller submits a valid title search and pagination limit
- **THEN** the API returns matching books in stable order with their identifiers

#### Scenario: Read a book and its copies
- **WHEN** a caller requests an existing ISBN
- **THEN** the API returns the book details and its current physical copies with their availability statuses

#### Scenario: Unknown book is requested
- **WHEN** a caller requests an ISBN that does not exist
- **THEN** the API returns a not-found response without exposing database details

### Requirement: Restrict catalog mutations to active librarians
The API MUST allow only an authenticated active librarian to create, update, or delete book and copy records.

#### Scenario: Unauthenticated caller mutates the catalog
- **WHEN** a caller without a valid authenticated session submits a catalog or inventory mutation
- **THEN** the API rejects the request with an authentication error and leaves Firestore unchanged

#### Scenario: Member attempts a librarian mutation
- **WHEN** an active member submits a catalog or inventory mutation
- **THEN** the API rejects the request with a forbidden response and leaves Firestore unchanged

#### Scenario: Active librarian mutates a record
- **WHEN** an active librarian submits a valid catalog or inventory mutation
- **THEN** the API applies the authorized operation and returns the resulting record or operation result

### Requirement: Create and update book records
The API MUST validate book fields on the server and persist create and update operations without replacing unrelated fields or linked history.

#### Scenario: Librarian creates a book
- **WHEN** an active librarian submits a valid unique ISBN and complete book details
- **THEN** the API creates the book record with server-managed timestamps

#### Scenario: Librarian updates a book
- **WHEN** an active librarian submits valid changes for an existing book
- **THEN** the API updates the supplied catalog fields and update timestamp while preserving its identifier and creation timestamp

#### Scenario: Invalid book data is submitted
- **WHEN** a caller submits missing, malformed, or immutable server-managed book fields
- **THEN** the API returns a field-level validation error and does not change Firestore

### Requirement: Delete books only when no physical copies or reservations are associated
The API MUST permit deleting a book only when no physical copy or reservation record references its ISBN, and MUST NOT cascade-delete other application records.

#### Scenario: Librarian deletes a book with no copies or reservations
- **WHEN** an active librarian deletes an existing book with no associated physical copies or reservations
- **THEN** the API deletes the book record and preserves unrelated historical records

#### Scenario: Librarian deletes a book that has copies
- **WHEN** an active librarian deletes a book with one or more associated physical copies
- **THEN** the API returns a conflict response and leaves the book and copies unchanged

#### Scenario: Librarian deletes a book referenced by a reservation
- **WHEN** an active librarian deletes a book referenced by any reservation
- **THEN** the API returns a conflict response and leaves the book and reservation unchanged

### Requirement: Manage physical copy records
The API MUST let active librarians create and update physical copy metadata while preserving the copy's book relationship and circulation-controlled status.

#### Scenario: Librarian adds a copy
- **WHEN** an active librarian adds a copy for an existing book
- **THEN** the API creates a uniquely identified copy in `AVAILABLE` status with server-managed timestamps

#### Scenario: Librarian updates copy metadata
- **WHEN** an active librarian updates an existing copy's editable inventory metadata
- **THEN** the API persists the allowed metadata changes without changing its copy ID or ISBN

#### Scenario: Copy status is changed through a generic update
- **WHEN** an active librarian submits a generic copy update that attempts to change circulation-controlled status
- **THEN** the API rejects the request and leaves the copy unchanged

#### Scenario: Copy references an unknown book
- **WHEN** an active librarian attempts to add a copy for an ISBN without a book record
- **THEN** the API rejects the request and creates no copy

### Requirement: Restrict copy deletion by current status
The API MUST allow deletion of a physical copy only when its current status is `AVAILABLE`, `DAMAGED`, or `LOST`.

#### Scenario: Librarian deletes an eligible copy
- **WHEN** an active librarian deletes a copy whose current status is `AVAILABLE`, `DAMAGED`, or `LOST`
- **THEN** the API deletes only the current copy record and preserves linked loan, reservation, and fine history

#### Scenario: Librarian deletes an in-use copy
- **WHEN** an active librarian deletes a copy whose current status is `IN_TRANSIT`, `ON_LOAN`, or `RESERVED`
- **THEN** the API returns a conflict response and leaves the copy unchanged

#### Scenario: Copy status changes before deletion
- **WHEN** a copy's status changes to a disallowed status while a deletion is being processed
- **THEN** the API does not delete the copy and returns a conflict response

### Requirement: Return consistent HTTP errors
The API MUST return consistent JSON errors for validation, authentication, authorization, missing records, and state conflicts without exposing credentials or Firestore internals.

#### Scenario: Request data is invalid
- **WHEN** a request contains invalid path or body data
- **THEN** the API returns a client validation error with field details and performs no mutation

#### Scenario: Mutation conflicts with current state
- **WHEN** the requested mutation violates a deletion or inventory state rule
- **THEN** the API returns a conflict response and leaves affected records unchanged

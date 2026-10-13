# Spec Delta

## Purpose

Defines how LibConnect persists accounts and library records and keeps related records consistent as members and librarians perform library operations. It provides a trusted, queryable source of truth for the single library location.

## ADDED Requirements

### Requirement: Persist application records
The system MUST persist accounts, books, physical copies, loans, reservations, fines, notifications, and authenticated sessions so their state is available across requests and service restarts.

#### Scenario: Read a persisted record
- **WHEN** an authorized application request reads a record that was previously created
- **THEN** the system returns its current persisted values and related identifiers

#### Scenario: Preserve history when catalog details change
- **WHEN** a book catalog record is updated
- **THEN** existing loans, fines, and reservations retain their identifiers and references, and any required historical title snapshot remains available

### Requirement: Enforce trusted and authorized persistence access
The system MUST perform application data reads and writes through trusted server-side operations and MUST enforce the caller's role and ownership before returning or changing records.

#### Scenario: Client attempts direct data access
- **WHEN** a browser client attempts to read or write protected application records directly
- **THEN** the database rejects the request

#### Scenario: Caller requests another member's private records
- **WHEN** a member requests another member's loans, fines, reservations, or notifications
- **THEN** the system denies access and does not disclose those records

### Requirement: Enforce one case-insensitive email identity
The system MUST use the same trimmed, case-insensitive canonical email identity for registration, login, and account updates while preserving the submitted trimmed email for display.

#### Scenario: Email differs only in casing
- **WHEN** a registration or account update uses an email whose casing differs from an existing account's email
- **THEN** the system treats it as the same identity and prevents a duplicate account

#### Scenario: Login email differs only in casing
- **WHEN** a user logs in with an email whose casing differs from the stored email
- **THEN** the system resolves the same account

### Requirement: Persist library entities with stable relationships
The system MUST persist each book, physical copy, loan, reservation, fine, and notification as an identifiable record with references to its related records and members.

#### Scenario: Query a member's library activity
- **WHEN** an authorized member or librarian requests a member's library activity
- **THEN** the system can retrieve that member's loans, reservations, fines, and notifications by their member or user identifiers

#### Scenario: Persist a single-location copy
- **WHEN** a librarian creates or updates a physical copy
- **THEN** the record contains its book identifier, shelf location, and status without requiring a branch identifier

### Requirement: Keep loan and copy state consistent
The system MUST update a loan and its physical copy as one logical operation whenever a loan is created, reported for closure, confirmed, or rejected.

#### Scenario: Create a loan for an available copy
- **WHEN** a librarian creates a loan for a member and an AVAILABLE copy
- **THEN** the system creates an ACTIVE loan and changes the copy status to ON_LOAN together

#### Scenario: Reject borrowing a non-available copy
- **WHEN** a librarian attempts to create a loan for a copy that is not AVAILABLE or is RESERVED for another member
- **THEN** the system rejects the operation without creating a loan or changing the copy

#### Scenario: Close a returned loan
- **WHEN** a librarian confirms a returned copy
- **THEN** the system changes the loan to CLOSED_RETURNED and records the return time before applying the librarian's selected copy disposition

#### Scenario: Member reports a return
- **WHEN** a member reports an ACTIVE loan as returned
- **THEN** the system records a `RETURNED` closure report, changes the loan to `PENDING_CLOSE`, and makes the copy unavailable for lending until librarian review

#### Scenario: Member reports a loss
- **WHEN** a member reports an ACTIVE loan as lost
- **THEN** the system records a `LOST` closure report, changes the loan to `PENDING_CLOSE`, and makes the copy unavailable for lending until librarian review

#### Scenario: Librarian rejects a closure report
- **WHEN** a librarian rejects a pending return or loss report
- **THEN** the system clears the pending closure context, returns the loan to `ACTIVE`, and changes the copy to `ON_LOAN` without closing the loan

#### Scenario: Librarian confirms a loss
- **WHEN** a librarian confirms a pending loss report
- **THEN** the system changes the loan to `CLOSED_LOST`, changes the copy to `LOST`, records the review time, and creates the applicable outstanding fine

### Requirement: Notify librarians about pending reservations during return processing
The system MUST alert the librarian before closing a returned loan when at least one pending reservation exists for the returned book, ordered by reservation creation time from earliest to latest.

#### Scenario: Pending reservation exists
- **WHEN** a librarian processes a returned loan for a book with one or more PENDING reservations
- **THEN** the system alerts the librarian and identifies the earliest pending reservation before the librarian selects the copy's final status

#### Scenario: No pending reservation exists
- **WHEN** a librarian processes a returned loan for a book with no PENDING reservations
- **THEN** the system does not offer a reservation assignment for that return

### Requirement: Support librarian-selected return disposition
After return verification, the system MUST let the librarian set the copy to AVAILABLE, DAMAGED, or RESERVED for the earliest pending reservation.

#### Scenario: Librarian makes copy available
- **WHEN** the librarian selects AVAILABLE
- **THEN** the copy status becomes AVAILABLE and pending reservations remain pending

#### Scenario: Librarian marks copy damaged
- **WHEN** the librarian selects DAMAGED
- **THEN** the copy status becomes DAMAGED and pending reservations remain pending

#### Scenario: Librarian reserves the copy
- **WHEN** the librarian selects RESERVED while a pending reservation exists
- **THEN** the system assigns the copy to the earliest pending reservation, stores the copy identifier on that reservation, sets its expiry to 15 days after assignment, changes the copy status to RESERVED, and creates a reservation-ready notification for that member

### Requirement: Complete a reservation when its member collects the copy
The system MUST fulfill a reservation only when the assigned member's loan for the reserved copy is created.

#### Scenario: Assigned member collects the copy
- **WHEN** a librarian creates a loan for the member assigned to a RESERVED copy
- **THEN** the system creates the loan, marks the reservation FULFILLED, and changes the copy status to ON_LOAN together

#### Scenario: Different member attempts to collect the copy
- **WHEN** a librarian attempts to loan a RESERVED copy to someone other than its assigned member
- **THEN** the system rejects the operation without changing the reservation, copy, or loan records

### Requirement: Expire uncollected reservations
The system MUST expire an assigned reservation after its 15-day pickup period and release its copy to AVAILABLE.

#### Scenario: Reservation reaches expiry
- **WHEN** the reservation expiry date passes without the reservation being fulfilled
- **THEN** the system marks the reservation EXPIRED and changes its assigned copy from RESERVED to AVAILABLE together

#### Scenario: Reservation is fulfilled before expiry
- **WHEN** an assigned reservation is fulfilled before its expiry date
- **THEN** the system keeps it FULFILLED and does not release its copy as AVAILABLE

### Requirement: Persist fine status without a payment gateway
The system MUST record a fine as paid when the member uses the Pay Fine action, without requiring an external payment transaction.

#### Scenario: Member pays a fine in the application
- **WHEN** a member uses Pay Fine for one of their OUTSTANDING fines
- **THEN** the system changes the fine status to PAID and records the payment time

#### Scenario: Member attempts to pay another member's fine
- **WHEN** a member uses Pay Fine for a fine they do not own
- **THEN** the system denies the operation and leaves the fine unchanged

### Requirement: Persist notifications with their related records
The system MUST persist each notification with its recipient, type, message, creation time, read state, and a typed related record reference when applicable. A reference type MUST be one of `LOAN`, `RESERVATION`, or `FINE`, and the referenced record MUST be valid for the notification context.

#### Scenario: Reservation copy is assigned
- **WHEN** a librarian assigns a returned copy to a member's reservation
- **THEN** the system persists a notification for that member that the copy is ready for collection and links it to the reservation

#### Scenario: Member reads a notification
- **WHEN** a member marks one of their notifications as read
- **THEN** the system persists the read state for that notification

### Requirement: Expire reservations based on persisted dates
The system MUST detect due reservations and apply their expiry state transition even if no member or librarian opens the reservation screen at that time.

#### Scenario: Due reservation is processed
- **WHEN** the reservation expiry date has passed and the reservation remains assigned and unfulfilled
- **THEN** the system processes the expiration and atomically updates both reservation and copy records


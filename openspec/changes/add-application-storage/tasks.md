# Tasks

## 1. Firestore foundation and access boundary

- [ ] 1.1 Add Firebase Admin initialization, environment-based project configuration, and Firestore Emulator support; verify the server connects to the emulator without production credentials.
- [ ] 1.2 Define TypeScript record types, status enums, timestamp fields, identifiers, and fixed-precision fine amount representation for the documented entities; verify model validation covers required fields and allowed statuses.
- [ ] 1.3 Add deny-by-default Firestore rules, required composite indexes, and versioned local configuration for application collections; verify browser SDK access is denied and documented queries have declared indexes.
- [ ] 1.4 Document local emulator startup, environment variables, collection conventions, and production project separation; verify a new developer can follow the steps to read seeded records locally.

## 2. Shared account identity and session persistence

- [ ] 2.1 Implement shared user repository operations and private deterministic identity keys for canonical email, member ID, and librarian employee ID; verify uniqueness reservations and account creation are atomic in the emulator.
- [ ] 2.2 Implement the shared trim-and-case-insensitive email canonicalization for registration, login, and account updates, preserving display email and password bytes; verify mixed-case login resolves one account and case variants cannot create duplicates.
- [ ] 2.3 Connect login and registration persistence to the shared user model and identity keys from their in-flight plans; verify member/librarian defaults and Argon2id hash interoperability remain intact.
- [ ] 2.4 Configure the maintained Express session-store adapter to persist minimal server-side session data with bounded expiry and invalidation; verify sign-in creates a session and sign-out/account deactivation invalidates it.
- [ ] 2.5 Document account fields, canonical identity behavior, session configuration, and secret handling; verify the documentation matches the stored records and deployed environment variables.

## 3. Library record repositories and queries

- [ ] 3.1 Implement repositories for books, copies, loans, reservations, fines, and notifications using separate records and stable related identifiers; verify create/read/update operations preserve relationships in emulator-backed tests.
- [ ] 3.2 Implement member activity, catalog/copy availability, librarian work queue, unread notification, and pending reservation queries with stable ordering; verify each query returns only the requested records in the specified order.
- [ ] 3.3 Add repository-level validation and authorization checks for member ownership and librarian operations; verify unauthorized reads and writes are rejected without data changes.
- [ ] 3.4 Document collection fields, references, query patterns, and title snapshot behavior; verify the schema documentation matches model types and repository queries.

## 4. Transactional library workflows

- [ ] 4.1 Implement loan creation and return closure with copy status updates in the same transaction; verify concurrent attempts cannot create duplicate active loans or inconsistent copy status.
- [ ] 4.2 Implement return processing that finds the earliest pending reservation and presents it before disposition; verify the librarian can choose AVAILABLE, DAMAGED, or RESERVED and that reservation assignment revalidates the earliest pending record transactionally.
- [ ] 4.3 On RESERVED disposition, persist the reservation's copy ID, set expiry to 15 days from assignment, set copy status, and persist a linked ready-for-pickup notification; verify all records are created together for the assigned member.
- [ ] 4.4 Implement reservation collection so only the assigned member can receive the reserved copy, with loan creation, FULFILLED status, and ON_LOAN copy status committed together; verify mismatched member attempts leave all records unchanged.
- [ ] 4.5 Implement Pay Fine and librarian waiver status changes with ownership/role checks and persisted timestamps; verify payment marks only the member's outstanding fine PAID without invoking an external payment service.
- [ ] 4.6 Document transaction boundaries, conflict responses, and retry-safe notification persistence; verify documented transitions match emulator-backed workflow tests.

## 5. Reservation expiry and operational readiness

- [ ] 5.1 Implement a scheduled server-side query for assigned reservations due for expiry and an idempotent transaction that marks each EXPIRED and releases its copy to AVAILABLE; verify fulfilled reservations are untouched and repeated job runs are safe.
- [ ] 5.2 Add operational logging and failure handling for scheduled expiry, Firestore transaction failures, and notification delivery retries without logging credentials or sensitive session data; verify retry behavior does not duplicate state transitions or notifications.
- [ ] 5.3 Document scheduler configuration, backup/restore expectations, required indexes, and deployment secrets; verify the documented deployment setup includes the expiry worker and Firestore backup configuration.
- [ ] 5.4 Run an integration review across account, loan, return, reservation, expiry, fine, and notification flows; verify all scenarios in `specs/application-storage/spec.md` map to implemented behavior and recorded evidence.

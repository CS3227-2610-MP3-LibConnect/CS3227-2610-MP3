# Design

## Context

See proposal.md for motivation and `specs/application-storage/spec.md` for the behavior contract. The repository is a greenfield project: it contains planning documents, but no application source, package manifests, Firestore configuration, or deployed records. The overview selects React/TypeScript, Express, and Firestore for one library location. The in-flight login and registration plans establish a shared `users` collection and Argon2id password service; their email normalization descriptions currently differ and must be reconciled to the same case-insensitive key.

## Goals / Non-Goals

**Goals:**

- Establish a server-owned Firestore persistence boundary and a schema/query plan that supports the workflows in the overview.
- Keep related inventory, loan, reservation, and fine state changes consistent under retries and concurrent requests.
- Provide an idempotent way to expire reservations after their 15-day pickup period.
- Coordinate account and session persistence with the separate login and registration plans.

**Non-Goals:**

- Implementing application UI or all feature routes in this storage change.
- Multiple library branches, payment-provider integration, or automatic reservation assignment on a return.
- Replacing the in-flight login and registration changes; this design defines their shared persistence contract.

## Decisions

1. **Use Firestore behind an Express repository/service boundary.** All production reads and writes go through trusted Express server code using the Firebase Admin SDK. Browser code calls application APIs; Firestore client rules deny direct access to application collections. The Admin SDK bypasses those rules, so each API/service must still enforce authentication, role, and record ownership. This follows the selected stack and keeps privileged fields out of client control. Direct browser-to-Firestore access was rejected because it would split business rules between clients and security rules.

2. **Keep frequently queried entities in separate top-level collections.** Use `users/{userId}`, `books/{isbn}`, `bookCopies/{copyId}`, `loans/{loanId}`, `reservations/{reservationId}`, `fines/{fineId}`, and `notifications/{notificationId}`. Store stable related IDs (for example `copyId`, `isbn`, `memberId`, `loanId`, `reservationId`) rather than nesting growing histories under users or books. Keep account role fields on the shared user document as the login/registration plans specify. Store sessions in a server-only `sessions` collection through a maintained Express session-store adapter. This supports member history and librarian work queues without rewriting large parent documents; embedding histories was rejected due to document growth and update contention.

3. **Use a private identity-key collection for uniqueness and shared email canonicalization.** Store deterministic server-only identity reservations under a private collection (for example `identityKeys/{kind_key}`) for canonical email, member ID, and librarian employee ID. Trim emails and lowercase them with locale-independent normalization for every create, login, and email-change path; keep the trimmed submitted value in `users.email` for display. Registration creates the account and its identity keys in one Firestore transaction. Account email changes atomically claim the new key, update the user, and release the old key. This resolves the differing normalization wording in the current login and registration plans and prevents query-then-write uniqueness races.

4. **Make invariants transactional.** Use Firestore transactions for loan creation plus copy transition to `ON_LOAN`; return closure plus the selected copy disposition; reservation assignment plus `copyId`, 15-day `expiryDate`, and copy transition to `RESERVED`; reservation collection plus loan creation and transition to `FULFILLED`/`ON_LOAN`; fine payment/waiver; and reservation expiration plus copy release. Transactions read and validate current statuses before writing, so duplicate requests cannot double-loan a copy or fulfill/expire a reservation twice. Keep external work such as notification delivery outside transaction callbacks; persist notification records as part of the relevant operation and deliver them afterward with retry-safe handling.

5. **Find the oldest reservation at the librarian's return decision.** Query reservations by the returned book's `isbn`, `status == PENDING`, ordered by `reservationDateTime` ascending with a stable document-ID tie-breaker. The server presents the earliest reservation to the librarian before closing the loan. If the librarian chooses `RESERVED`, the transaction revalidates that reservation is still the earliest pending one and unassigned before assigning the copy. If the librarian chooses `AVAILABLE` or `DAMAGED`, no reservation is assigned and the pending queue remains unchanged. This makes the stated ordering deterministic without automatic fulfillment.

6. **Process pickup expiry with a scheduled server job.** Query assigned `RESERVED` reservations whose `expiryDate` is at or before the current server time. For each, transactionally confirm the reservation is still unfulfilled and its copy is still `RESERVED` for that reservation, then mark it `EXPIRED` and the copy `AVAILABLE`. The job is safe to retry. Expiry does not automatically assign the copy to the next pending reservation; librarians make the reservation decision during return processing as specified. Firestore TTL may later clean old session documents, but it must not be used for reservation transitions because TTL deletion cannot atomically update the copy.

7. **Use server timestamps and indexed query fields.** Persist event times as Firestore timestamps, including creation/update, borrow/return, notification, payment, reservation, and expiry times. Required query indexes should cover member histories, librarian queues, copy lookup by ISBN/status, pending reservations by ISBN/time, due/expired records, and unread notifications by recipient/time. Record fine amounts with a fixed-precision representation rather than binary floating-point; confirm the library currency and display policy when fine rules are implemented.

8. **Separate environment configuration and operational data.** Use the Firestore Emulator for local development and seed data, separate development and production Firebase projects, and inject service credentials through environment/deployment secrets. Define Firestore indexes and deny-by-default rules as versioned configuration. Configure scheduled reservation expiry and backups/restore procedures before production use. No account or library data migration is needed because the application has not been implemented or deployed.

## Risks / Trade-offs

- [Firestore transactions have read/write limits and may retry on contention] → Keep transaction scopes small, validate status before writing, and make API operations retry-safe.
- [The manual reservation process can race if two librarians process returns for the same title] → Recheck the earliest pending reservation within the assignment transaction and return a conflict for the librarian to refresh.
- [Scheduled expiry may run late or more than once] → Compare server timestamps and reservation/copy links inside an idempotent transaction; expose overdue jobs through operational logging.
- [Admin credentials bypass Firestore security rules] → Deny browser access, centralize authorization in Express services, use least-privilege deployment credentials where available, and never expose service credentials to React.
- [The current login and registration plans describe email canonicalization differently] → Adopt one shared trim-and-case-fold helper and update both flows to use it before either is implemented.
- [The repository has no runtime or deployment setup to validate adapter choices] → Select maintained Firestore session and scheduler integrations during implementation and record their operational configuration alongside the code.

## Migration Plan

There is no existing application database or user data to migrate. Create the Firebase development project/emulator configuration, rules, indexes, collections-on-write conventions, and server credentials as the application is implemented. Deploy the server and scheduled expiry worker only after transaction paths, rules, indexes, backups, and HTTPS are configured. For rollback, disable the affected API/worker or revert the application release; retain existing Firestore records and avoid destructive schema rollback.

## Open Questions

- Confirm the currency and rounding/display policy before implementing fine calculation or payment status details.
- Select production hosting and the matching scheduled-job/session-store adapters when deployment architecture is chosen.

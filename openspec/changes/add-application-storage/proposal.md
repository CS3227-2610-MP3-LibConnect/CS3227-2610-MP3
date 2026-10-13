# Proposal

## Why

LibConnect has a defined domain model and Firestore stack, but no shared persistence contract for its catalog, inventory, loans, reservations, fines, notifications, and accounts. Establishing one server-owned storage design now gives the feature work a consistent source of truth and protects multi-record library operations from inconsistent state.

## What Changes

- Define the Firestore persistence contract for the application’s account and library records, including references between records and query-oriented fields.
- Require Express server-side access to Firestore, with client access restricted by security rules.
- Define consistent state transitions for borrowing, returns, reservation assignment and expiry, fine payment/waiver, and notifications.
- Require atomic updates for operations that change related records, including creating a loan with its copy status and assigning/expiring a reservation with its copy status.
- Align login and registration with one case-insensitive canonical email lookup and the shared account collection planned by their in-flight changes.
- Include indexes, server timestamps, backup/configuration, and local development requirements needed to operate the storage layer.

## Capabilities

### New Capabilities

- `application-storage`: Persistent records and consistent access to LibConnect accounts, catalog, inventory, loans, reservations, fines, notifications, and sessions.

### Modified Capabilities

None. No durable main specs exist yet; the related login and registration capabilities are currently represented by in-flight changes.

## Impact

- New Express/TypeScript Firestore repositories and transaction services, Firebase Admin SDK configuration, Firestore security rules, indexes, and local development setup.
- Login and registration account lookups and writes, which must share the same canonical email identity convention and user records.
- Library operations that must persist linked state changes: returns, borrowing, manual reservation notification/collection, 15-day reservation expiry, and fine status changes.
- No payment gateway, multi-branch tenancy, automatic reservation fulfillment, or client-direct database writes are included.

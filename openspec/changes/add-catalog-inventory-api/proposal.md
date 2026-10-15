# Proposal

## Why

LibConnect has Firestore models and partial repository operations, but the frontend has no HTTP API for browsing the catalog or managing inventory. A server-owned catalog and inventory API lets the React app read availability and lets authorized librarians maintain books and physical copies without direct browser access to Firestore.

## What Changes

- Add validated Express API operations to search and read books and their copies.
- Let active librarians create, update, and delete book records and physical copies, subject to reference and status constraints.
- Permit copy deletion only when its status is `AVAILABLE`, `DAMAGED`, or `LOST`; permit book deletion only when it has no associated copies.
- Enforce role checks, stable HTTP error responses, and transaction-safe coordination between copy creation and book deletion.

## Capabilities

### New Capabilities

- `catalog-inventory-api`: HTTP access to catalog records and physical copy inventory with role-aware CRUD behavior.

### Modified Capabilities

None. The project has no durable main specs yet; this change establishes the API capability.

## Impact

- Express API routing, request validation, error handling, catalog and inventory services/repositories, and integration with the existing Firestore models and session middleware.
- Frontend-facing JSON contracts for book search/details and copy availability, plus librarian-only catalog and inventory mutations.
- No new database, dependency, or deployment service is expected.

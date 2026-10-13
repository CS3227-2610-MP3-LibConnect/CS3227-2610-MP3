# Proposal

## Why

LibConnect needs a safe way for new members and librarians to create accounts before they can use the platform. Registration must apply the correct role and activation status while preventing duplicate identities even when requests arrive concurrently.

## What Changes

- Add a registration flow for member and librarian accounts with role-specific fields and server-side validation.
- Enforce case-insensitive uniqueness for email addresses across all accounts and for librarian employee IDs, including inactive accounts.
- Generate account identifiers and metadata on the server, activate members immediately, and leave librarians inactive pending manager activation.
- Use the shared Argon2id password service and HTTPS requirements established by the login plan.
- Support standard form submission without JavaScript, clear field errors, and distinct service-error handling.

## Capabilities

### New Capabilities

- `user-registration`: Creation and validation of member and librarian accounts, including atomic uniqueness and role-dependent defaults.

### Modified Capabilities

None.

## Impact

- React/TypeScript registration UI and Express registration endpoints.
- Firestore user records and transactional unique-key records for canonical email and librarian employee ID.
- Shared account repository and Argon2id password service described by `add-user-login`; registration must use the same account model and canonical email lookup behavior.
- HTTPS deployment and integration with the login page after successful registration.

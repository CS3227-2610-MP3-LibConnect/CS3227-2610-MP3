# Proposal

## Why

LibConnect has no implemented way for members and librarians to securely access role-specific features. A shared User Login flow will authenticate both account types while keeping inactive accounts and cross-role attempts from gaining access.

## What Changes

- Add member and librarian login choices and server-submitted credential forms.
- Authenticate active accounts by normalized email, exact password, and selected account type; return the same generic error for credential, account status, and account type failures.
- Establish a secure authenticated session and send each role to its own dashboard.
- Use Argon2id through a vetted library for all project password hashing, shared by registration and login verification.
- Require HTTPS in deployed environments and support standard form submission when JavaScript is disabled.

## Capabilities

### New Capabilities

- `user-authentication`: Login for members and librarians, role-aware sessions, and the shared project password-hashing contract.

### Modified Capabilities

None.

## Impact

- Future React/TypeScript login UI and Express authentication endpoints and session middleware.
- Firestore user records and lookup by normalized email across member and librarian accounts.
- Registration and any future password-changing flows, which must use the shared Argon2id hashing utility.
- Deployment configuration for HTTPS and secure session cookies.

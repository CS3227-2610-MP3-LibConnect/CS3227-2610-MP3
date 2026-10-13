# Design

## Context

See proposal.md for motivation. The repository currently contains project documentation but no frontend, backend, package manifests, or Firestore integration. The overview sets React/TypeScript, Express, and Firestore as the intended stack. The behavior contract is in `specs/user-authentication/spec.md`.

## Goals / Non-Goals

**Goals:**

- Keep credential verification and account-type authorization on the Express server.
- Provide server-compatible login forms that still submit without JavaScript.
- Establish one password-hashing utility and one account lookup convention that registration and later password changes can share.
- Give the browser a protected authenticated session and role-specific post-login routing.

**Non-Goals:**

- Social login, two-factor authentication, password reset, or account lockout after failed attempts.
- Implementing the member or librarian dashboard features themselves.

## Decisions

1. **Use a shared account record model keyed by canonical email.** Store member and librarian accounts in a common Firestore `users` collection with `accountType`, `accountStatus`, `email`, and `passwordHash` fields; role-specific fields remain on their account records. Registration, login, and account updates trim surrounding email whitespace and derive the same locale-independent case-insensitive canonical key. This follows the overview's abstract `User` model and supports cross-role uniqueness. Separate collections would require a coordinated lookup and transactional uniqueness check across both collections.

2. **Verify credentials and issue sessions in Express.** A native form posts to an Express login route. The server loads the account through the canonical email key, checks selected role and active status, and verifies the password. On success it creates a server-side session and sets an opaque session identifier in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Keep session data minimal (user ID and account type), with expiration and server-side invalidation. This keeps authorization out of client-controlled state. A signed client-side identity token was considered but is not selected because server-side session revocation is more direct for inactive accounts.

3. **Use standard form posts as the base and React as progressive enhancement.** Login role choices are ordinary links and credential submission uses a native HTML form targeting Express. The JavaScript-enabled React interface may enhance validation and presentation, but the server renders a usable login response and processes the same form post when JavaScript is disabled. A JavaScript-only SPA form was rejected because it violates the no-JavaScript requirement.

4. **Use Argon2id encoded hashes through one shared password module.** A maintained Argon2id library generates salts and encodes the parameters in its output. Registration and all password changes call this module; login calls the library's verification function on the exact submitted password. No custom salt generation or password logging is allowed. This provides one format and avoids divergent hashing behavior across account flows.

5. **Use HTTPS at the deployment boundary.** Deployed traffic must terminate TLS before credentials reach the application; HTTP requests should be redirected to HTTPS and cookies are marked `Secure`. Local development may use localhost HTTP. If Express is behind a TLS-terminating proxy, configure trusted proxy handling narrowly so secure-cookie behavior reflects the actual deployment topology.

6. **Keep authentication failures indistinguishable.** Missing, inactive, wrong-role, and bad-password accounts return the same generic message. Infrastructure failures are caught and shown as a separate retryable service error. The server must not return account-existence details or log submitted passwords.

## Risks / Trade-offs

- [The repository has no existing source or deployment setup, so endpoint paths, session storage integration, and UI boundaries must be established during implementation] → Build the smallest coherent Express/React/Firestore structure and document the chosen routes and session-store dependency as part of the implementation.
- [Argon2id parameters affect CPU and memory use] → Use library-recommended production parameters and verify them under the expected deployment resource limits.
- [A Firestore session store adds reads and writes to login and authenticated requests] → Store only minimal session data, set a bounded expiry, and use a maintained store adapter rather than building custom session persistence.
- [The shared `users` collection is an implementation convention not yet reflected in code] → Make registration use the same collection and canonical-email key before enabling login, preserving uniqueness across account types.

## Migration Plan

There is no existing application implementation or credential data to migrate. During initial setup, create the shared user and session storage conventions, implement registration/password hashing before or alongside login, and enable HTTPS and secure cookies in deployed environments. If deployment fails, roll back the application release; no credential migration is required. Do not enable the login route until stored accounts use the Argon2id format.

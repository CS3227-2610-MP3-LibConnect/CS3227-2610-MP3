# Design

## Context

See proposal.md for motivation and `specs/user-registration/spec.md` for the behavior contract. The repository currently contains planning documents but no React, Express, or Firestore implementation. The in-flight `add-user-login` plan defines a shared `users` collection, server-side account handling, a canonical email key, and an Argon2id password service; registration should build on those shared foundations rather than create parallel ones.

## Goals / Non-Goals

**Goals:**

- Create member and librarian records with server-controlled role fields and defaults.
- Make email and librarian employee ID uniqueness safe under concurrent registration.
- Share canonical identity normalization and password hashing with login and later account updates.
- Keep validation and account creation usable without JavaScript.

**Non-Goals:**

- Email verification, OAuth, automatic librarian activation, or manager provisioning.
- Creating dashboard functionality or changing the member/librarian roles.

## Decisions

1. **Use the shared `users` collection from the login design.** Store common account fields on a `users/{userId}` document and role-specific fields on that same document. The registration endpoint derives `accountType`, `accountStatus`, IDs, registration time, and `isManager` on the server; it ignores or rejects client attempts to set those values. A split collection design would duplicate account lookup and make cross-role email uniqueness harder to guarantee.

2. **Use canonical keys for identity comparisons, while retaining trimmed values for display.** For email, trim surrounding whitespace and derive a case-insensitive canonical key (lowercase with locale-independent normalization). For employee ID, trim and derive a case-insensitive canonical key. Use the same email canonicalization in the login lookup and account update paths. Preserve the trimmed submitted forms in account fields so display casing is not lost; never normalize a password.

3. **Reserve unique identities in the account-creation transaction.** Keep internal email and employee-ID reservation records in a server-only Firestore collection, with deterministic document keys derived from the canonical values. A Firestore transaction reads the applicable reservation docs, fails with the relevant duplicate-field error if one exists, and otherwise creates the user and reservation records atomically. For member registration, reserve the member ID in the same transaction as well. The user document ID provides the globally unique `userId`. This avoids a separate check-then-write race; ordinary Firestore queries plus a later account write are insufficient under concurrent requests.

4. **Validate and hash before starting the Firestore transaction.** The Express handler validates request shape, trims/normalizes identity fields, enforces the email rule (`a@b` with non-empty sides), requires an 8-character minimum password with no whitespace, and checks exact confirmation equality. It then hashes the exact password with the shared Argon2id service and prepares server-generated identifiers. Only after that does it run the short transaction, reducing transaction duration and retries. A duplicate race may spend hash CPU before being rejected, but avoids holding a transaction open during a slow password hash.

5. **Set role defaults exclusively on the server.** Member accounts receive `ACTIVE` status and a unique member ID. Librarian accounts receive `INACTIVE` status and `isManager: false`; public registration cannot grant manager privileges. Registration time comes from a server timestamp. No successful registration automatically authenticates the visitor; it shows success and redirects to User Login.

6. **Use native form submission with React enhancement.** Provide ordinary registration navigation and a form POST to Express, with server-rendered validation feedback and success redirect. React may add conditional employee-ID display and client-side convenience checks, but it does not own validation or account creation. A client-only SPA submission was rejected because it would not work with JavaScript disabled.

7. **Use HTTPS for deployed registration.** Require HTTPS for the registration page and submission and use the same deployment and proxy assumptions as login. Local development may use localhost HTTP.

## Risks / Trade-offs

- [The login change is not implemented yet, so the shared account model and Argon2id service are plans rather than code] → Sequence implementation so the account repository, canonical email helper, and password service are established once and consumed by both login and registration.
- [A canonical key reservation collection contains sensitive identity relationships] → Deny direct client access to reservation records and expose them only through trusted server-side Firestore credentials.
- [Argon2id work before duplicate checks can consume CPU for requests that lose a uniqueness race] → Apply request-size limits and appropriate service-level abuse controls when the server is deployed; do not weaken password hashing or uniqueness guarantees.
- [Firestore transaction conflicts can retry under bursts of registrations] → Keep transactions limited to a few identity-key and account documents and return a service error if Firestore ultimately fails.

## Migration Plan

There is no deployed account data to migrate. Establish the shared user record and reservation conventions with the login foundation, then use them for new registrations. Deploy registration only after Firestore server credentials and HTTPS are configured. If rollout fails, disable the registration route or roll back the application release; no existing account records need conversion.

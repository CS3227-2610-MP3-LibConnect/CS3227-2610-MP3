# Authentication and Sessions

## Description

Require users to sign in with an active account before accessing application pages or business API endpoints. The feature includes member and librarian registration, login, logout, and session restore. Health checks and auth entry points remain public.

## Purpose

Connect the existing account, session, and authorization foundations so users can access LibConnect securely and consistently across page navigation and API requests.

## Why this change is required

The repository has authentication foundations, but no complete sign-in flow is connected to the app:

- `apps/api/src/server.ts` configures Firestore-backed sessions and mounts catalog routes. It does not mount registration, login, logout, or session-status routes.
- `apps/api/src/storage/accounts.ts` implements Argon2id password hashing, registration, and authentication, but these operations are not exposed through routes.
- `apps/api/src/http/auth.ts` provides middleware for requiring an active actor and librarian access.
- `apps/client/src` contains a catalog API client, but no page or route source was found.
- `Overview.md` and `PLAN.md` specify active member accounts, inactive librarian accounts until manager activation, and server-controlled manager privileges.

The feature connects these pieces and ensures authentication is enforced consistently.

## Capabilities

### Added

- Member and librarian registration, login, logout, and session restore.
- Frontend page gating and sign-in redirects.
- Authentication enforcement for business API routes.
- Consistent handling of inactive accounts, expired sessions, and account deactivation.

### Modified

- Existing and future business API routes require an active authenticated actor.
- Client API calls send the session cookie and handle authentication failures consistently.

## Product specifications

- Members register as active accounts.
- Librarians register as inactive and cannot sign in until activated by a manager.
- Signed-out users are directed to sign in before viewing protected application pages.
- Signing out invalidates the session and returns the user to a public sign-in page.
- Invalid-credential login errors do not reveal whether the email or password was incorrect. When valid credentials belong to an inactive member account, the login page identifies the account as disabled.
- The server is authoritative for account status, role, and manager privileges; client-supplied role fields cannot grant access.
- Health checks and auth entry points remain public. Business APIs and application pages require an active session.

## Acceptance criteria

1. Signed-out users cannot access protected pages; the client directs them to sign in.
2. Business API requests without a valid session receive `401`.
3. Inactive accounts are denied, and inactive librarians cannot sign in.
4. Successful login establishes a session that permits protected access.
5. Logout invalidates the session; subsequent business API requests are rejected.
6. Client-provided roles or manager flags cannot grant access.
7. Deactivation prevents continued use of protected APIs and invalidates active sessions.
8. Registration and login can be used without an existing session.
9. Health checks remain accessible without a session.
10. Successful registration does not create a session; the user must sign in separately.
11. `GET /api/v1/auth/session` returns `200` with `{ authenticated: false }` when no valid session exists, and returns a safe account summary when authenticated.
12. State-changing API requests validate the browser `Origin` against `CLIENT_ORIGIN` to prevent cross-site request forgery.
13. Registration and login remain usable with JavaScript disabled through ordinary HTML form submissions to the auth API.
14. Successful no-JavaScript registration redirects directly to `/login.html` and creates no session; successful login establishes a session and redirects to the application root. Invalid credentials redirect to a generic non-sensitive status page with a link back to the login form. Valid credentials for an inactive member redirect to a distinct account-disabled status page with a link back to the form.

## Technical specifications

The client will be scaffolded as a Vite + React + TypeScript application. Its development server uses `CLIENT_PORT` and `CLIENT_ORIGIN` from `.env`; the API origin is exposed to the client as `VITE_API_ORIGIN` and is `http://localhost:3000` locally. The API permits credentialed requests only from the configured client origin.

### Proposed API surface

These paths fit the existing `/api/v1` routing pattern:

| Method and path | Purpose | Access |
|---|---|---|
| `POST /api/v1/auth/register` | Register a member or librarian | Public |
| `POST /api/v1/auth/login` | Authenticate and establish a session | Public |
| `POST /api/v1/auth/logout` | Destroy the current session | Authenticated |
| `GET /api/v1/auth/session` | Return a safe account summary or `{ authenticated: false }` | Public endpoint |

Session responses must omit password hashes and other secrets.

Registration does not sign the new account in automatically. After registration, the user must sign in. `GET /api/v1/auth/session` returns HTTP `200` with `{ authenticated: false }` when no valid session exists; when authenticated it returns `{ authenticated: true, user: <safe account summary> }`.

The login page requires the user to select `MEMBER` or `LIBRARIAN`. The client sends that expected account type with the email and password; the server verifies all credentials against the account record and does not trust the selection as authorization. The current `authenticate` operation already accepts an expected type.

The Vite client also provides static HTML documents as progressive-enhancement entry points. Their native forms post `application/x-www-form-urlencoded` data to the configured `VITE_API_ORIGIN`. Auth routes distinguish HTML form submissions from JSON API requests: JSON callers retain the JSON contract, while HTML submissions use `303 See Other` redirects to fixed paths on `CLIENT_ORIGIN`. Successful registration redirects directly to `/login.html` without creating a session; successful login redirects to `/`; invalid-credential login redirects to `/login-invalid.html`; valid credentials for an inactive member redirect to `/login-disabled.html`; invalid/duplicate registration redirects to `/register-invalid.html`. These static documents contain the corresponding message without requiring JavaScript. The password is never put in a redirect URL.

For JSON login requests, the server returns a distinct account-disabled error when the credentials are valid but the member account is inactive. Invalid email, password, or selected account type continues to use the generic credential error. The React login page maps the distinct error to an account-disabled message; the no-JavaScript form flow redirects to the fixed `/login-disabled.html` page. This behavior intentionally reveals that a matching member account exists and is inactive. Inactive librarian accounts retain the existing generic login feedback.

### Session and authorization flow

1. The browser submits registration or login over HTTPS.
2. The server validates the input and calls the existing account storage operations.
3. Successful login regenerates the session ID, stores the authenticated user ID, and returns the session cookie.
4. Business API middleware resolves the current user from the session and checks current account status. It attaches the server-loaded actor to the request.
5. Role-specific routes apply librarian, manager, or ownership checks using that actor.
6. Logout destroys the session and clears the cookie.
7. On app load, the client checks session status. A `401` from a protected API returns the user to sign-in.

Session ID regeneration is a proposed safeguard against session fixation. Current session cookies are `httpOnly`, use `sameSite: 'lax'`, and set `secure` in production. The Firestore session store hashes session IDs before storing them and enforces an expiry limit.

### API enforcement

Keep health checks and auth entry points outside the active-actor middleware. Apply the middleware to every business route, including routes added later. Client-side page guards support navigation but do not replace server-side checks.

### Browser and request security

The cookie-session design requires CSRF protection for state-changing requests: validate the request `Origin` against the configured `CLIENT_ORIGIN` and reject mismatches. Configure CORS for the same origin and allow credentials. Production uses HTTPS and secure cookies. Rate limiting is excluded from this feature for now. The implementation should not log passwords, session IDs, or password hashes.

Origin validation against `CLIENT_ORIGIN` is the selected CSRF control. Rate limits are excluded. The production frontend origin is supplied by deployment configuration when the deployed URL is known.

## Integration specifications

- **Frontend:** Add session-aware auth state, protected-page handling, and a shared API client that sends cookies and handles `401` responses.
- **No-JavaScript auth:** Provide static HTML login and registration forms using native browser submission, with static status documents for success and error messages. Keep client and API origins in their existing environment variables. The Express auth routes return redirects only for HTML form requests, preserve JSON responses for fetch callers, and redirect only to server-defined client-origin paths.
- **Backend:** Connect account operations to auth routes and apply active-actor middleware consistently to business routers.
- **Storage:** Continue using the existing `users` and Firestore-backed `sessions` collections; no new domain entity is currently indicated.
- **Account status:** Resolve current status from the user record rather than trusting role or status snapshots in the session. Use the existing `destroyForUser` support when deactivating an account.
- **Firestore:** Browser access to application data remains blocked; the browser accesses it through Express.

## Out of scope

- Social login, third-party identity providers, or multi-factor authentication.
- Password-reset policy beyond the librarian support workflow, which can be specified separately.
- Unauthenticated access to catalog or other business data.
- Client-only authorization.
- Changes to the role model or manager bootstrap policy.

## Risks and tradeoffs

- Cookie sessions need correct CSRF and CORS configuration, particularly if frontend and API origins differ.
- Protecting catalog routes changes behavior for callers that currently make unauthenticated requests.
- Session revocation depends on status checks or session deletion being applied consistently.
- The frontend integration points and navigation structure are not yet present in the inspected client source.

## Open decisions

No open decisions remain in this design. The production frontend and API origins must be supplied by the deployment configuration when deployed URLs are known.

## Resolved decisions

- The login page requires users to select whether they are signing in as `MEMBER` or `LIBRARIAN`. The server checks this expected type against the stored account in addition to validating the email, password, and active status. The selection does not grant role privileges.
- Local development uses `http://localhost:5173` as the frontend origin and `http://localhost:3000` as the API origin. `PORT=3000` configures the API; `CLIENT_PORT=5173` and `CLIENT_ORIGIN=http://localhost:5173` record the frontend dev server port and origin in `.env`. These ports were checked and had no listeners when this decision was recorded. The API must allow credentialed browser requests from the configured client origin.
- Rate limits will not be implemented as part of this feature.
- Successful registration does not create a session; a user signs in separately after registering.
- `GET /api/v1/auth/session` returns `200` with `{ authenticated: false }` when signed out, and `200` with `{ authenticated: true, user: <safe account summary> }` when signed in.
- State-changing API requests validate `Origin` against `CLIENT_ORIGIN`; mismatched origins are rejected. CORS allows credentialed requests only from that configured origin.
- The browser client reads its API base URL from `VITE_API_ORIGIN`; local development sets it to `http://localhost:3000` in `.env`.

## Context reviewed

- `Overview.md` — product roles, account states, manager rules, and application architecture.
- `PLAN.md` — identity-access scope, session architecture, security expectations, and phase ordering.
- `apps/api/src/server.ts` — Express session setup and current route mounting.
- `apps/api/src/storage/accounts.ts` — registration, authentication, and member deactivation operations.
- `apps/api/src/storage/firestore-session-store.ts` — Firestore session persistence and per-user session deletion.
- `apps/api/src/http/auth.ts` — active-actor and librarian middleware.
- `apps/api/src/storage/repositories.ts` and `packages/shared/src/domain/records.ts` — user records, identity lookup, and server-side access checks.
- `apps/client/src` — catalog API client present; no page or route source found.

## Amendments

- 2026-10-16: Clarified that registration does not automatically sign users in, specified the signed-out session response, and selected `Origin` validation against `CLIENT_ORIGIN` for CSRF protection. Rate limits remain excluded.
- 2026-10-16: Confirmed the implementation will include a Vite + React + TypeScript client scaffold because the repository has no frontend application yet.
- 2026-10-16: Removed a stale sentence that described CSRF selection as unresolved and recorded `VITE_API_ORIGIN` as the client-facing API URL configuration.
- 2026-10-16: Added the `PLAN.md` no-JavaScript registration/login requirement. Static HTML forms post URL-encoded data to the API; API redirects provide success and generic error feedback while preserving the JSON API contract.
- 2026-10-21: Specified distinct disabled-account feedback when valid credentials belong to an inactive member, in both React and no-JavaScript login flows. Invalid credentials and inactive librarian accounts retain generic feedback. This intentionally reveals the inactive status of a matching member account, as requested.
- 2026-10-21: Aligned successful no-JavaScript registration with the later registration-password-validation design: it redirects directly to `/login.html` without creating a session. Preserved login success and error destinations. This resolves the older authentication specification's stale confirmation-page redirect requirement.

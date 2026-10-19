# Authentication and Sessions Implementation Tasks

Implement tasks in order. Each task should be checked off only after its acceptance criteria are met. The design is the product and contract source; project conventions below ground the implementation in the current repository.

## Task list

- [x] **Scaffold the React client** - Create a Vite + React + TypeScript application under `apps/client`, add the required client dependencies and development/build scripts, and read the configured `CLIENT_PORT` and `CLIENT_ORIGIN` values rather than duplicating the local port in client configuration.
  - Acceptance criteria: The client starts on the configured port, its build succeeds, and the development configuration can call the API at `http://localhost:3000` with cookies enabled.
  - References: Design sections “Capabilities,” “Technical specifications,” and “Resolved decisions”; `Overview.md` application context; `.env` (`CLIENT_PORT`, `CLIENT_ORIGIN`, `PORT`).

- [x] **Configure credentialed API requests and Origin checks** - Configure Express CORS for the exact `CLIENT_ORIGIN` and credentialed requests. Add middleware that rejects state-changing requests whose `Origin` does not match the configured origin. Keep health checks public and do not add rate limiting.
  - Acceptance criteria: Requests from the configured client origin can send and receive the session cookie; a mismatched origin is rejected for state-changing requests; health checks remain accessible without a session; no rate-limit middleware is introduced.
  - References: Design sections “Browser and request security,” “API enforcement,” and “Resolved decisions”; `apps/api/src/server.ts`; `.env` (`CLIENT_ORIGIN`).

- [x] **Expose registration, login, logout, and session routes** - Add auth routes under `/api/v1/auth` and connect them to `AccountStorage`. Validate inputs with Zod. Registration accepts the selected account type and required fields, creates no session, and leaves librarians inactive. Login requires the selected `MEMBER` or `LIBRARIAN` type, authenticates against stored credentials/status, regenerates the session ID, and returns a safe account summary. Logout destroys the session. Session status returns the approved signed-in or signed-out response.
  - Acceptance criteria: Registration and login work without an existing session; a member is active after registration but must log in separately; a librarian remains inactive and cannot log in before activation; invalid email/password/type combinations use a generic credential error; login establishes a regenerated session; logout invalidates it; `GET /api/v1/auth/session` returns `200` with `{ authenticated: false }` when signed out and `{ authenticated: true, user: <safe account summary> }` when signed in; no response includes a password hash or session identifier.
  - References: Design sections “Product specifications,” “Acceptance criteria,” “Proposed API surface,” “Session and authorization flow,” and “Resolved decisions”; `apps/api/src/storage/accounts.ts`; `apps/api/src/http/errors.ts`; `packages/shared/src/domain/records.ts`.

- [x] **Enforce active-account access across business APIs** - Apply the active-actor policy consistently to all business API routes, leaving only the approved public endpoints exempt. Ensure role checks use the server-loaded actor and account deactivation removes that user’s persisted sessions.
  - Acceptance criteria: Unauthenticated or expired-session business requests receive `401`; inactive accounts cannot use business APIs; role or manager values supplied by the client do not grant access; health and auth entry points remain public; deactivating an account invalidates its active sessions and subsequent requests are denied.
  - References: Design sections “Acceptance criteria,” “API enforcement,” and “Integration specifications”; `apps/api/src/http/auth.ts`; `apps/api/src/server.ts`; `apps/api/src/storage/accounts.ts`; `apps/api/src/storage/firestore-session-store.ts`.

- [x] **Implement client auth pages and route protection** - Add registration and login forms, a session-aware auth state, protected-page handling, and logout. The login form requires an explicit `MEMBER` or `LIBRARIAN` selection. Restore session state on app load using the session endpoint and send credentialed API requests.
  - Acceptance criteria: Signed-out users are redirected to sign-in before protected pages render; session restore displays the signed-in state after reload; login sends the selected account type; successful registration directs the user to sign in rather than treating them as authenticated; logout clears the signed-in UI and session; API `401` responses return the user to sign-in; browser requests include credentials.
  - References: Design sections “Capabilities,” “Acceptance criteria,” “Integration specifications,” and “Resolved decisions”; `apps/client/src/api/catalog.ts` for the existing credentialed-fetch convention.

- [x] **Verify authentication and document local operation** - Add automated or documented manual verification for the design’s acceptance criteria, including session-cookie behavior, Origin rejection, inactive-account denial, role spoofing, registration/login/session/logout, and deactivation revocation. Document how to run the client and API with the configured local origins.
  - Acceptance criteria: Every design acceptance criterion has a corresponding automated check or documented manual verification step; verification uses the Firestore Emulator rather than production credentials; local instructions use the configured client port/origin and API port; no secrets, passwords, or session identifiers are exposed in logs or verification output.
  - References: Design “Acceptance criteria,” “Risks and tradeoffs,” and “Resolved decisions”; `PLAN.md` testing strategy and development environment separation; `firebase.json`; `apps/api/src/server.ts`.

- [x] **Support no-JavaScript registration and login** - Add static HTML auth documents with native URL-encoded form submissions and API redirects for success and validation/authentication failures. Preserve the JSON API behavior for React callers.
  - Acceptance criteria: Static registration and login forms contain no scripts and submit natively; registration success redirects to a sign-in confirmation and does not create a session; login success establishes a session and redirects to the application root; inactive librarian and invalid credentials get the same generic credential feedback; redirects stay on the configured `CLIENT_ORIGIN`; JSON clients retain existing response contracts.
  - References: Design “Acceptance criteria,” “Technical specifications,” “No-JavaScript auth,” and `PLAN.md` Phase 2 gate/testing strategy.

## Repository conventions and dependencies

- The API is Express with TypeScript and mounts routes under `/api/v1`; request parsing and validation use Zod (`apps/api/src/server.ts`, `apps/api/src/routes/catalog.ts`).
- API errors use `{ error: { code, message, fields? } }` (`apps/api/src/http/errors.ts`).
- Account operations use Firestore repositories and Argon2id hashing (`apps/api/src/storage/accounts.ts`, `apps/api/src/storage/repositories.ts`).
- Sessions use `express-session` with a Firestore-backed store and `httpOnly`, `sameSite: 'lax'` cookies (`apps/api/src/server.ts`, `apps/api/src/storage/firestore-session-store.ts`).
- The catalog client sends cookies with `credentials: 'include'` (`apps/client/src/api/catalog.ts`). The client application itself does not yet exist; this plan adds the Vite + React + TypeScript scaffold as confirmed in the design amendment.
- Local API and Firestore Emulator configuration are already present (`.env`, `firebase.json`). Production origins and credentials must be supplied separately at deployment.

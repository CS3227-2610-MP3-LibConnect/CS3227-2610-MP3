# Authentication and Sessions

## Purpose and entry points

LibConnect authenticates members and librarians through the Express API and maintains signed-in state with a server-side session. The React login page is `/login`; a static HTML form at `/login.html` provides the native no-JavaScript login flow. Both flows submit the selected account type, email, and password to `POST /api/v1/auth/login`.

Inactive accounts cannot start a session. For a member account, valid credentials with an inactive status receive a specific disabled-account response. Invalid credentials, a mismatched selected account type, and inactive librarian accounts retain generic credential feedback.

## Login flow

`AccountStorage.authenticate` in `apps/api/src/storage/accounts.ts` loads the account by email. A missing account, wrong account type, or failed Argon2 password verification raises the generic `FORBIDDEN` storage error. The storage layer checks the password before examining inactive status. If the password matches and the account is an inactive member, it raises `StorageError` with code `ACCOUNT_DISABLED`. An inactive librarian continues to use the generic error path.

The `POST /login` handler in `apps/api/src/routes/auth.ts` maps `ACCOUNT_DISABLED` to HTTP `401` with this JSON response:

```json
{
  "error": {
    "code": "ACCOUNT_DISABLED",
    "message": "This account is disabled."
  }
}
```

For native form submissions, the handler redirects to the fixed `CLIENT_ORIGIN` path `/login-disabled.html`. Generic failures redirect to `/login-invalid.html`. Neither failure creates a session. Successful authentication regenerates the session ID, stores the authenticated user ID, account type, and auth version in the session, and then returns the safe account summary or redirects a native form submission to `/`.

The session cookie is named `libconnect.sid` (replacing the former `libconnect.sid`) so Firebase Hosting forwards it when proxying `/api/**` requests to Cloud Run. Existing browser sessions using `libconnect.sid` are not migrated; users need to sign in again after the API cookie-name change. Logout and invalid-session handling clear the `libconnect.sid` cookie.

`LoginPage` in `apps/client/src/pages/LoginPage.tsx` checks for both status `401` and code `ACCOUNT_DISABLED` before showing “This account is disabled.” All other `401` login failures show “Email or password is incorrect.” The static `apps/client/login-disabled.html` page shows the same disabled message and links back to `/login.html`; it contains no JavaScript and is included as a Vite build input in the root `vite.config.ts`.

## Security and privacy boundaries

- The server reads account status and account type from the stored user record; client selection does not grant a role.
- Disabled-account feedback is intentionally specific only for an inactive member with a matching password. Wrong passwords and inactive librarian accounts remain indistinguishable from other credential failures.
- Password hashes, passwords, and session identifiers are not returned in login responses or placed in redirect URLs.
- Login errors do not establish a session. Successful login regenerates the session ID before storing authenticated state.
- Auth routes remain public entry points; protected business routes use active-session middleware.

## Relevant implementation and tests

- `apps/api/src/storage/accounts.ts` — account lookup, Argon2 verification, and active-status distinction.
- `apps/api/src/routes/auth.ts` — JSON error mapping, native form redirects, and session establishment.
- `apps/client/src/pages/LoginPage.tsx` — React login feedback.
- `apps/client/login.html` and `apps/client/login-disabled.html` — native login form and disabled-account status page.
- `vite.config.ts` — Vite multi-page inputs for static auth documents.
- `tests/shared/auth-routes.test.mjs` — JSON and native-route contract, including inactive member, wrong password, wrong account type, and inactive librarian cases.
- `tests/client/client-auth.test.mjs` — browser-level React login feedback for disabled members and generic failures.
- `tests/shared/no-javascript-auth.test.mjs` — static page content, return link, script-free behavior, and build input.
- `tests/emulator/verify-auth-emulator.mjs` — end-to-end account storage, API, and native-form behavior using Firestore Emulator.

Verification performed during this change: the auth-route tests passed (9/9), the client auth tests passed (6/6), the no-JavaScript auth tests passed (2/2), the TypeScript/Vite build passed, and the auth emulator verifier passed against the `demo-libconnect` Firestore Emulator with a controlled local API. The emulator run used an alternate local Firestore port because the default port could not bind in the environment. The full `npm test` run built successfully but reported 306 passing and 3 failing tests in the pre-existing, unrelated `tests/member-api/member-ai-assistant-service.test.mjs`: original answer preservation, replacement answer review, and fail-safe behavior after malformed relevance output. The Vite build prints its existing large-chunk advisory.

## Local operation

See the repository `README.md` for local environment variables, default ports and origins, startup steps, and the `npm run verify:auth:emulator` command. The emulator verifier requires both the Firestore Emulator and API server to be running against the demo project.

## Verification status

The authentication-and-sessions design and checklist now match the later registration-password-validation decision: successful no-JavaScript registration redirects directly to `/login.html` without creating a session. The API and emulator verifier follow this behavior, and all authentication-and-sessions checklist tasks are complete.

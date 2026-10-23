# Registration Password Validation Implementation Tasks

Implement these tasks in order. Mark a task complete only when its acceptance criteria are met. The approved behavior and contracts are defined in `design.md`.

## Task list

- [x] **Enforce the password policy in the registration API** - Extend the strict registration request schema to accept `confirmPassword`; require at least eight Unicode code points, reject whitespace, and require an exact password/confirmation match. Preserve password text exactly and pass only the password to account storage.
  - Acceptance criteria: JSON and URL-encoded registration requests reject each violated password rule with a field-specific validation error that explicitly states the violated rule; Unicode code points are counted consistently; a valid password and confirmation reach account storage with no confirmation field; login schema and behavior are unchanged.
  - References: Design sections “Technical specifications,” “Integration specifications,” and acceptance criteria 6, 8, and 11; `apps/api/src/routes/auth.ts`; `apps/api/src/http/errors.ts`; `apps/api/src/storage/accounts.ts`.

- [x] **Provide safe registration failure responses** - Return structured field errors for JSON callers. For any failed URL-encoded registration, respond directly with a server-rendered registration form and an appropriate message; do not redirect.
  - Acceptance criteria: JSON validation errors state the violated rule in the appropriate field; the HTML response contains the registration form for validation, duplicate identity, and unexpected failures; known failures state the reason when safe, unexpected failures use a general retry message; non-password fields are HTML-escaped before being preserved, password and confirmation fields are blank, and no submitted values are placed in a URL; the successful registration response remains a safe account summary with no password, confirmation, hash, or session identifier.
  - References: Design sections “Technical specifications” and “Integration specifications,” and acceptance criteria 6, 7, and 9; `apps/api/src/routes/auth.ts`; `apps/api/src/http/errors.ts`.

- [x] **Add React registration confirmation, validation, and success navigation** - Add password confirmation and validate code-point length, whitespace, and exact match before making the registration request. Present accessible, field-specific messages. On success, clear password fields, navigate to login, and display the correct status message there.
  - Acceptance criteria: Both account types use the same validation rules; invalid values do not trigger a request; each validation message names the violated rule and server field errors are displayed; the confirmation value is sent only for server comparison and is not retained after success; successful member registration navigates to `/login` with a ready-to-sign-in message; successful librarian registration navigates to `/login` with a manager-activation message; login remains unauthenticated until the user signs in.
  - References: Design sections “Product specifications,” “Technical specifications,” and “Integration specifications,” and acceptance criteria 1–6 and 12–15; `apps/client/src/pages/RegisterPage.tsx`; `apps/client/src/pages/LoginPage.tsx`; `apps/client/src/api/errors.ts`.

- [x] **Update no-JavaScript registration forms and success/failure responses** - Keep confirmation inputs and direct HTML responses for failures. On successful native registration, redirect directly to the static login page rather than a registration confirmation page.
  - Acceptance criteria: Member and librarian forms submit both password fields without scripts; all failed submissions return a form response without a redirect and communicate known rules clearly; non-password values are safely preserved, password fields are empty, and the user can retry; successful registration redirects to `/login.html`; no session is created and no submitted values appear in a URL.
  - References: Design sections “Product specifications” and “Integration specifications,” and acceptance criteria 7, 13, and 14; `apps/client/register.html`; `apps/client/auth-static.css`; `apps/api/src/routes/auth.ts`.

- [x] **Review registration data handling and compatibility** - Check both successful and failed registration flows against the design’s password privacy, safe response, login-navigation, and account behavior requirements.
  - Acceptance criteria: The browser sends the entered password and confirmation over the configured HTTPS production connection, never sends a client-generated hash, and does not put passwords or confirmation values in URLs; the server creates the hash and does not return or log password material; member/librarian account status remains unchanged; React success navigation displays the correct status; native success redirects to `/login.html`; neither success flow creates a session; sign-in behavior for existing accounts remains unchanged.
  - References: Design sections “Integration specifications,” “Out of scope,” and acceptance criteria 8–15; `apps/client/src/auth/AuthContext.tsx`; `apps/client/src/api/base.ts`; `apps/client/src/pages/RegisterPage.tsx`; `apps/client/src/pages/LoginPage.tsx`; `apps/api/src/storage/accounts.ts`; `apps/api/src/routes/auth.ts`.

## Project conventions used

- Auth routes use strict Zod schemas and `parseRequest`; validation errors expose a general message plus field-level details. See `apps/api/src/routes/auth.ts` and `apps/api/src/http/errors.ts`.
- The client represents API field errors through `ApiClientError.fields`. See `apps/client/src/api/errors.ts`.
- No-JavaScript authentication uses URL-encoded native forms. Current auth routes redirect to static status pages for several outcomes; this feature’s failed registration responses are an approved exception that returns server-rendered HTML directly for all failure categories. See `apps/client/register.html`, `apps/client/login.html`, and `apps/api/src/routes/auth.ts`.
- The account storage registration operation receives the account fields and creates the stored password hash. Keep confirmation out of this boundary. See `apps/api/src/storage/accounts.ts`.

## Amendments

- 2026-10-16: Modified the React success task to navigate to login with an account-type status message, modified the no-JavaScript success task to redirect to `/login.html`, and reopened the final compatibility review because successful registration destinations changed. The API validation and failure-response tasks remain complete.

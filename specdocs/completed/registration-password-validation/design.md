# Registration Password Validation

## Description

Add consistent password validation for member and librarian registration. The React registration form, the no-JavaScript registration forms, and the registration API enforce the same password policy and confirmation behavior. Login and existing account passwords are unchanged.

## Purpose

Prevent registration with passwords that do not meet the project’s stated policy, catch password-entry mistakes before account creation, and ensure the rules cannot be bypassed by avoiding the React interface.

## Why this change is required

The current React registration page and static HTML registration forms collect one password and do not request confirmation. The React form does not check password length or whitespace. The registration API schema currently accepts a non-empty password and rejects unknown fields, so it cannot validate a confirmation value.

The existing registration requirements in `PlanDraft/Specs/Auth/UserRegistration.md` specify a minimum of eight characters, no whitespace, and matching confirmation. The current implementation does not meet those requirements. Relevant implementation files are `apps/client/src/pages/RegisterPage.tsx`, `apps/client/register.html`, and `apps/api/src/routes/auth.ts`.

## Capabilities

### Added

- Client-side registration checks for password length, whitespace, and confirmation match.
- Server-side enforcement of the same rules, including for native form submissions and direct API requests.
- Confirmation fields in both React and no-JavaScript registration forms.

### Modified

- The registration request contract accepts a confirmation value solely for validation. Account storage continues to receive only the password used to create the account.
- No login behavior or existing account password policy is changed.
- Successful registration navigates the user to the login page. Registration does not create a session or sign the user in.

## Product specifications

- Both member and librarian registration require a password of at least eight characters.
- Passwords containing whitespace are rejected, following `PlanDraft/Specs/Auth/UserRegistration.md`.
- Both registration forms ask the user to enter the password a second time. A mismatch is clearly flagged and prevents account creation.
- Passwords are preserved exactly as entered; the client and server do not trim or otherwise alter them.
- Client validation provides immediate feedback. Server validation remains authoritative.
- On registration failure, the error message must explicitly state the violated rule when it is safe to do so; naming only the field or saying validation failed is insufficient. Examples: “Password must be at least 8 characters,” “Password must not contain whitespace,” and “Confirmation password must match the password.” Do not use a vague generic validation error when the failed rule is known.
- Validation feedback is associated with the relevant field and announced accessibly.
- After successful React registration, navigate to `/login` and show an account-type-appropriate status message there. Member accounts are ready to sign in; librarian accounts require manager activation first.
- After successful no-JavaScript registration, redirect directly to `/login.html`. The static login page does not show a registration-specific success banner.
- Successful registration does not create a session. Account activation and sign-in behavior remain as defined by the existing authentication design.

## Technical specifications

- Add a confirmation input to the React registration page and both static HTML registration forms.
- In React, validate the password policy and exact confirmation match before submitting. Do not send an invalid registration request.
- Update the registration API schema to accept the confirmation field and validate minimum length, absence of whitespace, and exact match before calling account storage.
- Return structured, field-specific validation errors to JSON callers so the React form can explain the failed rule. For native form submissions, return a server-rendered HTML registration form on any registration failure, including validation, duplicate identity, and unexpected server errors; do not redirect after failure. Show a specific reason when safe, otherwise a general retry message. Preserve non-password registration fields in the rendered form, escape them before inserting them into HTML, and leave password fields blank.
- Do not pass the confirmation value to account storage or persist it.
- Keep the existing maximum password length and request validation constraints consistent between client and server.
- Interpret password length as Unicode code points and apply the same counting rule in the client and server. A password must contain at least eight Unicode code points; combining sequences count as multiple code points when they contain multiple code points.
- On React registration success, clear password values and navigate to the login route with a status message in route state. The login page displays that message without establishing a session.

## Integration specifications

- JSON registration requests include the password and confirmation values for validation. The API uses the password to create the account and ignores the confirmation after successful comparison.
- Successful React registration returns to `/login` with a member-ready or librarian-activation status message. Successful native registration returns an HTTP redirect to the static `/login.html` page. Neither flow creates an authenticated session.
- Native `application/x-www-form-urlencoded` submissions include both values. On any registration failure, the API responds directly with an HTML registration form and an appropriate error message, allowing correction or retry without a redirect or JavaScript.
- The server-rendered form preserves non-password fields after HTML-escaping them and clears the password and confirmation inputs. Known validation failures identify the violated rule; duplicate identity errors may identify the duplicate field; unexpected errors use a safe general retry message. No submitted values are placed in a URL.
- Existing API success responses contain only the safe account summary. Passwords, confirmation values, password hashes, and session identifiers must not be included in response bodies.
- The browser sends the entered password and confirmation to the server over HTTPS in production. The client must never generate or submit a password hash. The server creates and stores the hash using the existing password-hashing implementation.
- Passwords, confirmation values, and hashes must not be written to logs or placed in redirect URLs.

## Acceptance criteria

1. A password shorter than eight characters is rejected by the React form with a clear message and no registration request.
2. A password containing whitespace is rejected by the React form with a clear message and no registration request.
3. A password confirmation mismatch is flagged and prevents the React form from submitting.
4. A matching, policy-compliant password and confirmation can be registered.
5. Each known client-side validation failure displays a message that explicitly states the violated rule and prevents submission.
6. The API rejects short passwords, whitespace-containing passwords, and mismatched confirmations even when client-side checks are bypassed, and returns a validation error that explicitly states the violated rule.
7. The no-JavaScript forms collect and submit confirmation values; any failed registration receives a direct HTML response containing the registration form, without a redirect. Known validation failures explicitly state the violated rule; unexpected failures use a safe general message. Non-password fields are safely preserved, and password fields are blank.
8. The API passes only the actual password to account storage; it never stores the confirmation value.
9. No API response body contains a password, confirmation value, password hash, or session identifier.
10. The client does not submit a client-generated password hash.
11. Login accepts existing credentials without applying registration password rules.
12. Successful React registration navigates to `/login` and shows the correct member-ready or librarian-activation message.
13. Successful no-JavaScript registration redirects directly to `/login.html`.
14. Successful registration in either flow does not establish a session; the user must sign in separately.
15. Member and librarian account status behavior remains unchanged.

## Out of scope

- Login validation changes or changes to existing account passwords.
- Password reset or password change flows.
- Password strength meters, breach checks, or complexity rules beyond minimum length and no whitespace.
- Changes to account roles, librarian activation, or manager privileges.

## Risks and tradeoffs

- The no-JavaScript confirmation requirement needs the registration API to accept and validate a confirmation value, so this design includes a backend contract update and an HTML response path for validation failures.
- Reason-specific registration errors must avoid reflecting sensitive input values and should not expose unnecessary account information.
- Client-side checks alone are bypassable; server enforcement is required for consistent policy.
- Client and server must both count Unicode code points, rather than JavaScript/TypeScript UTF-16 string units, to implement the agreed password length rule.
- Passwords must reach the server for verification and hashing, so transport security and careful exclusion from logs and responses are essential.
- The no-JavaScript flow returns directly to the login form without a registration-specific success banner; this keeps the static login page JavaScript-free and avoids adding success state to the URL.

## Amendments

- 2026-10-16: Resolved password length counting as Unicode code points for both client and server validation.
- 2026-10-16: Replaced query error-code interpretation on a static page with redirects to dedicated static error pages, since a no-JavaScript page cannot select a message based on a URL parameter.
- 2026-10-16: Replaced redirects to dedicated static error pages with a direct server-rendered registration form response so a failed no-JavaScript submission can show the violated rule and allow correction without redirecting.
- 2026-10-16: Applied the no-redirect server-rendered form response to all failed native registration attempts, not only password validation failures.
- 2026-10-16: Changed successful registration to navigate to login; React displays a member/librarian status message there, while no-JavaScript forms redirect directly to `/login.html`. Registration still creates no session.

## Context reviewed

- `Overview.md` — application architecture, account types, and account status rules.
- `specdocs/authentication-and-sessions/design.md` — authentication API, safe account summaries, session behavior, and no-JavaScript form redirects.
- `specdocs/authentication-and-sessions/tasks.md` — implemented authentication and frontend work.
- `PlanDraft/Specs/Auth/UserRegistration.md` — existing registration password policy and confirmation requirements.
- `PlanDraft/Workflows/General/Registration.md` — registration flow and error behavior.
- `apps/client/src/pages/RegisterPage.tsx` — current React registration form.
- `apps/client/register.html` — current no-JavaScript registration forms.
- `apps/client/src/pages/LoginPage.tsx` and `apps/client/login.html` — existing sign-in forms; sign-in behavior remains unchanged, while the React page will display registration status after successful registration.
- `apps/api/src/routes/auth.ts` — current registration and login schemas and response behavior.

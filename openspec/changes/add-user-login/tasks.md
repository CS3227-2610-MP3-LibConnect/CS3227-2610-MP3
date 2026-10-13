# Tasks

## 1. Application foundation and account model

- [ ] 1.1 Establish the React/TypeScript and Express application structure and Firestore configuration; verify the development app starts and the documented setup steps work.
- [ ] 1.2 Define the shared Firestore user record and normalized-email lookup/uniqueness convention for member and librarian accounts; verify repository operations distinguish account type and status and preserve cross-type email uniqueness.
- [ ] 1.3 Add a shared Argon2id password service and use it in registration and password creation/change paths; verify each account stores an encoded salted hash and plaintext passwords are never persisted or logged.

## 2. Server authentication and sessions

- [ ] 2.1 Implement Express login form endpoints that trim and case-fold email for canonical lookup, preserve the password exactly, verify passwords with Argon2id, require an active account of the selected type, and return indistinguishable generic failures; verify valid and invalid account cases.
- [ ] 2.2 Add server-side session storage and role authorization with an HttpOnly, Secure, SameSite cookie, bounded expiration, and invalidation; verify the session identifies the authenticated user and cannot be read by browser scripts.
- [ ] 2.3 Configure deployed HTTPS enforcement, HTTP-to-HTTPS redirects, and trusted proxy behavior where required; verify credentials and session cookies are served only over HTTPS in the deployed configuration.
- [ ] 2.4 Add server-side authentication tests and document the login routes, session behavior, and required deployment settings; verify the documented API and configuration match the implementation.

## 3. Login experience

- [ ] 3.1 Build the general User Login page with Member Login and Librarian Login choices and required email/password forms; verify missing and whitespace-only required fields receive clear prompts.
- [ ] 3.2 Support native form navigation and server submission without JavaScript, with React enhancements where available; verify both role choices and login submission work with JavaScript disabled.
- [ ] 3.3 Display a generic message for bad credentials, inactive accounts, and account-type mismatches, and a distinct retry message for network/server errors; verify the rendered messages do not reveal account existence or failure cause.
- [ ] 3.4 Redirect authenticated members and librarians to their respective dashboards; verify each role lands on its correct destination and cannot use the other role's protected routes.
- [ ] 3.5 Add login UI and end-to-end coverage and document the user login flow; verify role switching, successful redirects, generic errors, service errors, and no-JavaScript submission.

## 4. Integration

- [ ] 4.1 Verify registration-created accounts can sign in through the matching role form and that deactivated accounts lose access; verify the full Firestore-to-session-to-dashboard flow for both account types.

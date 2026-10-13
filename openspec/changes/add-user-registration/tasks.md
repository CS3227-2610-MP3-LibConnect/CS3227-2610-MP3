# Tasks

## 1. Shared account and identity foundation

- [ ] 1.1 Reuse or establish the shared Firestore user repository and Argon2id service from `add-user-login`; verify registration and login use the same account fields, canonical email key, and password format.
- [ ] 1.2 Implement shared canonicalization for trimmed, case-insensitive email and librarian employee ID values while preserving trimmed display values; verify case and surrounding-whitespace variants produce identical keys without changing passwords.
- [ ] 1.3 Define server-only Firestore unique-key records for canonical email, librarian employee ID, and member ID; verify key records cannot be accessed by clients and map back to the owning account only on the server.

## 2. Account creation and validation

- [ ] 2.1 Implement server validation for account type, required fields, email format, password length and whitespace, and exact confirmation matching; verify invalid submissions return field-specific errors and create no account.
- [ ] 2.2 Implement account creation with server-generated user/member IDs, server registration time, MEMBER/ACTIVE and LIBRARIAN/INACTIVE defaults, and `isManager: false`; verify clients cannot override generated or privileged fields.
- [ ] 2.3 Create the Argon2id hash before a short Firestore transaction that atomically reserves the relevant identity keys and creates the account; verify duplicate checks cover inactive accounts and concurrent requests create at most one account.
- [ ] 2.4 Add service-level coverage and document the account model, canonical keys, transaction behavior, and field errors; verify the documentation matches the persisted records and error mapping.

## 3. Registration user experience

- [ ] 3.1 Build Member and Librarian registration forms with role-specific fields and ordinary navigation; verify employee ID appears only for librarian registration.
- [ ] 3.2 Submit through a standard Express form POST and keep server validation authoritative, with React enhancements optional; verify valid member and librarian registrations work with JavaScript disabled.
- [ ] 3.3 Render field errors, duplicate email/employee ID errors, success feedback with redirect to User Login, and a separate retryable service error; verify each response category is distinct and preserves safe form values without retaining passwords.
- [ ] 3.4 Add UI and end-to-end coverage and document the registration workflow; verify successful account defaults, validation, duplicate handling, service failures, and no-JavaScript behavior.

## 4. Deployment and login integration

- [ ] 4.1 Enforce HTTPS for deployed registration and ensure submitted credentials are not logged; verify deployed form URLs and requests use HTTPS and logs contain no password values.
- [ ] 4.2 Verify registration-created member accounts can immediately sign in, librarian accounts remain blocked until activated, and mixed-case email login resolves the canonical account; verify the end-to-end Firestore-to-login flow for both account types.

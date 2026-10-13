## FEATURE: User Login

### Overview

Allow registered members and librarians to authenticate using their registered email address and password.

Passwords must be stored using a modern, purpose-built password-hashing algorithm. Use a vetted library that generates a unique cryptographic salt for each password and stores the salt and hashing parameters with the resulting hash. Do not generate salts or hashes with custom code, reuse salts, or store plaintext passwords. A slow, password-specific algorithm such as Argon2id is preferred; use a suitably configured alternative if the chosen environment does not support it.

### Acceptance criteria

1. The login page must provide two options: **Member Login** and **Librarian Login**. Selecting an option opens the corresponding login form.
2. The login form must accept an email address and password.
3. The server must authenticate the submitted credentials against the selected account type. It must not disclose whether the email address or password was incorrect.
4. If authentication fails, display a generic error message, such as: “Invalid email or password.”
5. If the account does not exist, is inactive, or belongs to a different account type than the selected login form, show the same generic authentication error.
6. If a network or server error prevents authentication, display an error message that tells the user the login could not be completed and to try again. Do not describe this as invalid credentials.
7. Transmit passwords only over HTTPS. Never store passwords in plaintext.
8. Hash passwords using a vetted password-hashing library with a unique, randomly generated salt for each password. Store the hash, salt, and any parameters needed for verification. Do not store or log submitted passwords.
9. Normalize the email address by removing leading and trailing whitespace and deriving a locale-independent case-insensitive canonical key before submission and lookup. Do not trim or otherwise alter the password; spaces may be part of it.
10. Validate required fields before submission and show a clear prompt when a required field is missing.
11. The login form must remain usable when JavaScript is disabled, using a standard form submission to the server.

### Out of scope

- Social login (OAuth)
- Two-factor authentication
- Password reset
- Disabling accounts after repeated failed attempts

### Edge cases

1. Empty email and password fields must be caught before submission where possible; whitespace-only fields count as empty.
2. Authentication must still work without JavaScript enabled.
3. A member trying the librarian login, or a librarian trying the user login, must receive the same generic error shown for other failed authentication attempts.
4. Network or server errors must be handled separately from invalid credentials.

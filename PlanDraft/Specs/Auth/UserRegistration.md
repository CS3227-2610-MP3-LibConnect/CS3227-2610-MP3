## FEATURE: User Registration

### Overview

Allow a user to create a **Member** or **Librarian** account. Member accounts are active upon registration. Librarian accounts are inactive until activated by an authorized master account.

### Acceptance criteria

1. The registration form must let the user select an account type and display the required fields for that type.
2. Both account types must provide:
   - `name`
   - `email`
   - `password`
   - `confirmPassword`
3. Librarian registration must also require an `employeeId`.
4. The system must generate these fields:
   - `userId`: unique across member and librarian accounts
   - `registrationDateTime`: date and time of registration
   - `accountType`: `MEMBER` or `LIBRARIAN`, based on the selected type
   - `accountStatus`: `ACTIVE` for members and `INACTIVE` for librarians
   - `memberId`: unique among members, for member accounts only
5. Email addresses must be unique across all member and librarian accounts, including inactive accounts. If an email is already registered, the system must display an error and not create the account.
6. Librarian employee IDs must be unique among librarian accounts, including inactive accounts. If an employee ID is already registered, the system must display an error and not create the account.
7. The password and confirmation must match. Otherwise, display an error and do not create the account.
8. Passwords must be at least 8 characters long, may contain letters, numbers, and symbols, and must not contain whitespace.
9. Transmit passwords only over HTTPS. Never store or log submitted passwords in plaintext.
10. Hash each password using a vetted password-hashing library with a unique, randomly generated salt. Store the encoded hash, including the salt and any parameters needed for verification, or store those values separately as required by the library.
11. Normalize email addresses by removing leading and trailing whitespace before validation and storage. Do not alter passwords.
12. Validate required fields and formats. When validation fails, display a clear error and do not create the account.
13. On successful registration, display a success message and redirect the user to the login page.
14. If a network or server error prevents registration, display an error explaining that registration could not be completed and inviting the user to try again. Do not present it as a validation or duplicate-field error.
15. The registration form must remain usable when JavaScript is disabled. The server must perform all required validation.

### Out of scope

- Registration using social accounts (OAuth)

### Edge cases

1. Missing required fields must be rejected. Whitespace-only names, emails, and employee IDs count as empty.
2. Email addresses must match the format a@b: a non-empty string, followed by @, followed by a non-empty string. Reject addresses that do not match this format before creating the account.
3. Passwords shorter than 8 characters or containing whitespace must be rejected.
4. A password confirmation that does not match the password must be rejected.
5. Duplicate email addresses or employee IDs must be rejected, including when two registration requests arrive at nearly the same time.
6. Network and server errors must be handled separately from validation and duplicate-field errors.

## FEATURE: Reset Passwords for Librarian Accounts

### Overview

A librarian with manager permissions can manage librarian account statuses and reset librarian passwords.

Manager permissions are granted when the librarian account’s `isManager` field is set to `true`. Only authenticated managers may access this feature.

### Acceptance criteria

1. A manager can reset a librarian’s password by entering a new password and confirming it.
1. A valid password must be at least 8 characters long and contain no whitespace.
1. The new password and confirmation must match before the reset can proceed.
1. The application must request confirmation before changing an account’s status or resetting its password.
1. The server must verify that the requesting librarian has manager permissions before allowing either action. The server must perform all required validation, even if client-side validation is also used.
1. Passwords must be transmitted only over HTTPS, hashed using a vetted password-hashing library with a unique salt, and never stored or logged in plaintext.
1. After a successful password reset, display a success message and refresh the librarian account list.
1. After a successful status change, display a success message and refresh the librarian account list.
1. If a validation error occurs, explain which requirement was not met without performing the action.
1. If a network or server error prevents an action, display an error explaining that the action could not be completed and inviting the manager to try again.
1. The account-management forms must remain usable when JavaScript is disabled. The server must validate and process standard form submissions.

### Out of scope

- None specified.

### Edge cases

1. Reject passwords shorter than 8 characters or containing whitespace.
2. Reject a reset if the password and confirmation do not match.
3. Reject account-management requests from a librarian whose `isManager` field is not `true`.
4. If the target librarian account cannot be found, display an appropriate error and make no changes.
5. Handle network and server errors separately from validation or authorization errors.
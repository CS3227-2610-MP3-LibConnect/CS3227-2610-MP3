### Workflow

**Precondition:** A librarian with manager permissions is logged in.

1. The manager opens the librarian management page.
2. The manager selects a librarian account.
3. To reset the password, the manager selects **Reset Password**, enters a new password, and confirms it.
4. The application validates the password and confirmation. If validation succeeds, it asks the manager to confirm the reset.
5. The manager confirms the reset.
6. The server verifies the manager’s permissions and the submitted password, then resets the target account’s password.
7. On success, the application displays a success message and refreshes the librarian account list. If the reset fails, it displays the relevant validation, authorization, or service error.
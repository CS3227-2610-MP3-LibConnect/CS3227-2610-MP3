### Workflow

**Precondition:** A librarian with manager permissions is logged in.

1. The manager opens the librarian management page.
2. The manager selects a librarian account.
3. The manager chooses **Activate Account** or **Deactivate Account**.
4. The application asks the manager to confirm, stating which status change will be made.
5. The manager confirms the action.
6. The server verifies the manager’s permissions and updates the selected account’s status.
7. On success, the application displays a success message and refreshes the librarian account list. If the change fails, it displays the relevant authorization or service error.

The server must reject attempts to grant manager privilege through public
registration and must prevent deactivation of the last active manager unless a
documented recovery procedure is being used.

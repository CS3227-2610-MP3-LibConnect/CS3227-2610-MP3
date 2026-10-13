## FEATURE: Librarian Account Management by a Manager

### Overview

Librarian accounts are created with the `INACTIVE` status. A librarian manager can activate accounts so librarians can access the application, or deactivate accounts when staff leave the organization or an account is compromised.

This feature is available only to authenticated librarians whose `isManager` field is `true`. See the [Librarian class definition](../../Overview.md#librarian-1).

### Acceptance criteria

1. A manager can view all librarian accounts and their current statuses.
2. A manager can change a librarian account’s status from `INACTIVE` to `ACTIVE` or from `ACTIVE` to `INACTIVE`.
3. Before applying a status change, the application must ask the manager to confirm the action and identify whether the account will be activated or deactivated.
4. The server must verify that the requesting librarian’s `isManager` field is `true` before allowing access or changing an account’s status.
5. If a status change succeeds, the application must display a success message and refresh the librarian account list.
6. If a network or server error prevents the status change, the application must display an error explaining that the change could not be completed. It must not report the error as a successful change.

### Out of scope

- None specified.

### Edge cases

- If the selected librarian account cannot be found, display an error and do not make a change.
- If the manager is not authorized, deny the request and do not make a change.
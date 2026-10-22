### Workflow

**Precondition:** The user navigates to the login page.

1. The user selects **Register an account** and is taken to the registration page.
2. The user selects **Member** or **Librarian** and sees the corresponding fields.
3. The user enters the required information and submits the form.
4. The client performs available validation and submits the form to the server.
5. The server trims the email address, derives its case-insensitive canonical key, and validates all submitted fields.
6. The server checks that the email address is unused across all accounts and, for librarian registration, that the employee ID is unused among librarian accounts.
7. If validation fails or a duplicate is found, the system displays an error identifying the relevant field and does not create the account.
8. If registration succeeds, the system creates the account with the generated fields and correct account status, displays a success message, and redirects the user to the login page.
9. If a network or server error prevents registration, the system displays the corresponding connection or service error.

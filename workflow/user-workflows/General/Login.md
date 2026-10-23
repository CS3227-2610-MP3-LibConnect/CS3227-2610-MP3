### Workflow

**Precondition:** The user navigates to the login page.

1. The user selects **User Login** or **Librarian Login** and is shown the corresponding form.
2. The user enters an email address and password, then submits the form.
3. The system removes leading and trailing whitespace from the email address, derives its case-insensitive canonical lookup key, and sends the credentials securely to the server over HTTPS. It preserves the password exactly as entered.
4. The server looks up the account using the canonical email key, verifies the password against the stored password hash, and checks that the account is active and matches the selected account type.
5. If authentication succeeds, the system authenticates the user and redirects them to the home page.
6. If credentials are invalid, the account is inactive, or the account type does not match, the system displays the generic authentication error.
7. If a network or server error prevents authentication, the system displays the corresponding connection or service error.

Do not begin implementation until you have confirmed your understanding of the acceptance criteria and workflow.

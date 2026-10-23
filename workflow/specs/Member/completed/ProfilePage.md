# Member Profile Page (Implemented)

**Status:** Implemented. The detailed design is archived at [`workflow/specdocs/completed/member-profile/design.md`](../../../specdocs/completed/member-profile/design.md).

## Purpose

Allow a signed-in member to view and update their own account details and password.

## Page layout

- The profile icon in the member navigation opens the profile page.
- The profile page contains a column of sections on the left side.
- The **Profile** section is selected by default.
- The profile section displays the member's current name and email address.
- The page provides sections for updating profile details, email address, and password.

## Profile Section

- A member can change their name.
- The new name must not be empty or contain only whitespace.
- After a successful update, show a success notification and display the new name across member pages, including the profile page.
- If the update fails, show an error notification and keep the entered name in the form.

- A member can change the email address associated with their account.
- The new email must be valid and must not already belong to another member or librarian account.
- Apply the new email immediately after the server confirms it is unique. Email verification is not required.
- After a successful update:
  - Show a success notification and display the new email on the profile page.
  - Allow the member to sign in with the new email; the old email must no longer sign in to that account.
  - Make the old email available for registration by another user.
- If the update fails, show an error notification and keep the entered email in the form.

- A member must provide their current password, a new password, and confirmation of the new password.
- The new password and confirmation must match.
- The new password must be at least eight characters long and contain no whitespace.
- The client should check the confirmation and password rules before submitting. The server must also validate them and verify the current password.
- After a successful update, show a success notification. The new password must work for sign-in and the old password must no longer work.
- Keep the current session active and invalidate the member's other sessions.
- If the update fails, show an error notification. Retain non-password form values; clear password fields after the request completes.

## My Loans Section

Members can view all loans associated with their account. The default view
shows active loans. Members can switch to a past-loans view to see loans that
are no longer active.

Display each loan as a card containing the book title and due date. Show a
disabled **Return** button on active loans; return reporting will be added in
a future iteration. Do not show the button on past loans that have already
been returned.

Highlight overdue loan cards in red so they are easy to identify.


## My Reservations Section

refer to [MyReservations.md](./MyReservations.md) for the requirements.


## My Fines Section

refer to [MyFines.md](./MyFines.md) for the requirements.


## Account and access rules

- This page is for members only. Librarian profile management is out of scope.
- Members may view and change only their own account details.
- The server must identify the account from the authenticated session and enforce access. Client-side checks alone are not sufficient.
- Passwords and password hashes must never be displayed or logged.

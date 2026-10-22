# Member Profile Page

> Planning draft. The implementation design is maintained at `specdocs/member-profile/design.md`.

## Description

Provide members with a profile hub containing four subpages: Profile, My Loans, My Reservations, and My Fines. The Profile subpage displays the name, email, and password forms together. My Loans provides active and past loan views. My Reservations and My Fines are accessible placeholders until their workflows are designed and implemented.

This specification covers member accounts only. Librarian and manager profile changes belong to the librarian feature area.

## Purpose

Let a member keep their account details current and manage their own sign-in credentials through the authenticated member application.

## Why this change is required

The previous profile draft listed the intended sections and account changes, but the client has no profile route or page. The API has an atomic email update operation, but no profile routes or name and password update operations. The client stores the authenticated user summary in `AuthContext`, so successful changes also need to update that state to keep the displayed name and email current.

## Capabilities

### Added

- A member-only profile subpage that displays the profile details, email, and password forms together.
- Viewing the authenticated member's current name and email.
- Updating the authenticated member's name and email.
- Changing the authenticated member's password after verifying the current password.
- Success and error feedback for profile operations, retaining entered non-secret values after errors.
- A My Loans subpage showing the authenticated member's active and past loans.
- My Reservations and My Fines placeholder subpages with no reservation or fine data/actions in this iteration.

### Modified

- The member profile icon/navigation will lead to the new profile page.
- The profile hub will provide left-side navigation for Profile, My Loans, My Reservations, and My Fines, with Profile selected by default.
- The authenticated client user summary will be refreshed or updated after a successful name or email change so member pages do not show stale account details.
- A successful password change will advance the member's authentication version. The session used for the change is updated to that version; older sessions are rejected by the server.

## Product specifications

Requirements inherited from the existing profile outline are marked **Existing requirement**. Choices confirmed during design review are marked **User decision**. Architecture-specific implementation details are **Proposals** and should be treated as design guidance.

### Profile details

- **Existing requirement:** Display the member's name and email address.
- **User decision:** Name, email, and password updates are all available together on the single profile subpage; members do not switch between separate profile, email, and password subpages.
- **Existing requirement:** Provide a name update action. On success, show a success notification and reflect the updated name across member pages, including the profile page.
- **Existing requirement:** On an update error, show an error notification and retain the values entered in the fields.
- **User decision:** Keep name, email, and password updates together on this Profile subpage. The other three hub destinations are separate subpages.

### Email update

- **Existing requirement:** A member can change the email associated with their own account.
- **User decision:** Apply the new email immediately once the server confirms it is unique; email verification is not required by this feature.
- **Existing requirement:** Reject an email already registered to another account.
- **Existing requirement:** After success, the member can sign in with the new email, the old email no longer authenticates that account, and the old email is available for registration by another user.
- **Existing requirement:** Show success or error feedback. On errors, retain the entered email value.
- **Proposal:** Normalize and compare emails using the existing trimmed, locale-independent, case-insensitive canonical email key. Preserve the trimmed display value, consistent with registration and login.

### Password update

- **Existing requirement:** Require the current password, new password, and confirmation of the new password.
- **Existing requirement:** Check that the new password and confirmation match before submission.
- **User decision:** Match the registration policy: the new password must be at least eight characters and contain no whitespace.
- **Existing requirement:** Show success or error feedback. Retain entered non-secret field values after an error.
- **User decision:** Keep the current session active after a successful password change and invalidate the member's other sessions.
- **Existing requirement:** The new password must authenticate successfully after the change; the old password must no longer work.
- **Proposal:** Clear password input fields after every submission result. Never repopulate or retain passwords in UI state after the request completes.

### My Loans

- **Existing requirement:** Members can view the loans associated with their account. Show active loans by default and allow switching to past loans.
- **Existing requirement:** Display each loan as a card containing the book title and due date.
- **Existing requirement:** Highlight overdue active loans in red.
- **Existing requirement:** Show a disabled **Return** button on active loans as a visual indicator only; return reporting is deferred. Do not show the button for returned past loans.
- **Proposal:** Load loan records through a member-only server API that derives member ownership from the authenticated actor. Reuse the existing member activity storage query if suitable; do not expose another member's loans.

### My Reservations and My Fines placeholders

- **User decision:** Provide navigable My Reservations and My Fines placeholder subpages in this iteration.
- The placeholders identify their section and state that the feature is not available yet. They do not show fabricated or live records, filters, cancellation/payment controls, or dialogs.
- Reservation and fine data workflows and actions remain deferred until their dependencies and designs are available.

## Acceptance criteria

1. An authenticated member can open the profile page and see their current name and email.
2. The profile hub has Profile, My Loans, My Reservations, and My Fines subpages in a left-side navigation column on wide screens. On narrow screens, navigation appears above the content. Profile is selected by default and contains the name, email, and password forms together; these account updates are not separate subpages.
3. A member can submit a valid name change. The server updates only the authenticated member's record, the UI shows success, and the updated name is reflected in the profile and other member pages without requiring sign-out.
4. A name change with an empty or whitespace-only name is rejected, and no account data changes.
5. A member can submit a syntactically valid new email. The server checks uniqueness against every member and librarian account using the canonical email key and commits the user record and identity key consistently.
6. If the email is already assigned to another account, the update fails without changing either account. Concurrent attempts to claim the same canonical email cannot both succeed.
7. After a successful email update, the new email can be used to sign in, the old email cannot sign in as that account, and another account can register using the released old email.
8. After a successful email update, the safe authenticated user summary reflects the new email without requiring sign-out. Email and name updates do not alter account type, status, member ID, or manager fields.
9. A password change requires the current password, a new password, and confirmation. The server verifies the current password and rejects incorrect current credentials.
10. A password update is rejected when the new password and confirmation differ, when the new password is shorter than eight characters, or when it contains whitespace. Client checks provide early feedback; server checks remain authoritative.
11. Following a successful password change, the current session remains usable and sessions with an older authentication version are rejected on subsequent requests. The new password works for subsequent login and the old password does not.
12. Successful profile operations show success feedback. Failed operations show an actionable error and preserve entered non-secret values. Password values are cleared after the request completes.
13. Signed-out requests cannot read or change profile data. A librarian cannot use member profile operations.
14. Profile responses and client state never expose password hashes. Submitted passwords and session identifiers are not logged.
15. After a password change, requests and session restores using a session with an older authentication version are rejected. New logins use the current version. The authentication version is not accepted from client input or included in the safe account summary.
16. My Loans loads only the authenticated member's loan records, shows active loans by default, and allows switching to past loans.
17. Loan cards show the book title and due date. Overdue active loans are highlighted in red. Active loans show a disabled Return button; returned past loans do not show it.
18. My Reservations and My Fines are reachable placeholder subpages with clear unavailable messaging and no reservation/fine data or state-changing actions.

## Technical specifications

The current application uses React with TypeScript, an Express API, Firestore accessed through trusted server code, and Firestore-backed cookie sessions. The browser does not write application records directly.

### Client

- **Proposal:** Add a member-only profile hub in `apps/client/src` with left-side navigation for Profile, My Loans, My Reservations, and My Fines. Keep the existing Profile destination as the hub entry and select Profile by default.
- **Proposal:** Add profile API functions that use the shared API client and its cookie credentials behavior.
- **Proposal:** On a successful name or email update, update or reload the safe user summary held in `AuthContext`. Do not trust a client-supplied user ID to select the account being changed.
- **Existing requirement:** Keep form values available after an API error, except password values, which should be cleared after completion for safety.
- **Proposal:** Present the name, email, and password forms as clearly headed, accessible sections together on the Profile subpage, with visible success/error status announcements.
- Add a My Loans subpage that requests loans through a member-only API. The API must derive the member from the active session; client-supplied member IDs are not an authority.
- Add My Reservations and My Fines placeholder subpages with accessible headings and unavailable messaging. Do not add reservation/fine API calls or controls in this iteration.

### API and account operations

- **Proposal:** Add authenticated operations for reading the current member's safe profile summary and updating name, email, and password. Exact route paths and request/response shapes should follow the established `/api/v1` API conventions during implementation.
- Resolve the actor from the authenticated server session and load current account state server-side. Do not accept the target user ID, role, or account status from the browser as authority.
- Require an active member account for member profile operations. Continue applying the existing origin protection to state-changing requests.
- Compare the server-stored session authentication version with the current user record in active-actor authorization and session restore. Missing versions on existing users and sessions count as `0`. Do not accept a client-supplied version or include it in safe account summaries.
- Validate names and email addresses on the server. Existing registration behavior trims names, rejects empty names, limits names to 120 characters, and validates email format; reuse these rules unless a shared validator has since superseded them.
- Use the existing `canonicalizeEmail` behavior and transactional identity-key update to preserve cross-role uniqueness. Keep the user email and identity key update atomic.
- Verify the current password using the existing Argon2id password hash approach, validate the new password server-side, and hash it with Argon2id before persistence. Never return or log any password or hash.
- **User decision:** Use an authentication version to invalidate other sessions reliably. Add an `authVersion` value to user records and authenticated sessions. New sessions use the current user version; existing records and sessions without the field are treated as version `0` for compatibility.
- **Proposal:** During a password change, update the password hash and increment the user's `authVersion` in a Firestore transaction. In that transaction, update the current session to the new version. Other sessions retain the old version and are rejected by active-actor authorization checks. Session restore must also reject and destroy a session whose version differs from the user record. Do not expose session IDs or versions as client-controlled authorization data, and do not log session IDs.

### Data and compatibility

- Add an `authVersion` user field and the corresponding session value. No new Firestore collection is required. Existing users and sessions without a version are interpreted as version `0`; normal login persists the current version into newly created sessions.
- Email changes must preserve uniqueness for both account types and must not leave an old identity key behind after a successful update.
- Name and email updates must not alter registration date, account type/status, member ID, employee ID, or manager privilege.
- Existing login behavior uses the canonical email identity. A successful email change therefore takes effect for future login requests immediately.

## Integration specifications

### Account update flow

1. The signed-in member opens the profile page. The client obtains or uses the safe profile summary for the authenticated session.
2. The member submits a name or email change through the client API.
3. The API validates the request, resolves the member from the active session, and calls the account operation for that member.
4. The storage operation commits the update. Email mutation also atomically claims the new canonical identity key and releases the old key.
5. The API returns a safe updated account summary. The client updates its authenticated user state and displays success feedback.
6. If validation, authorization, uniqueness, or storage fails, the API returns a safe error. The client retains non-secret form values and displays an error.

### Password change flow

1. The member submits the current password, new password, and confirmation.
2. The client checks confirmation equality and the agreed password rule for immediate feedback.
3. The API repeats all validation, resolves the member from the session, verifies the current password, and hashes the new password.
4. The server atomically stores the new hash, increments the user's authentication version, and updates the current session to that version. Other sessions keep the previous version and are rejected by server-side authorization and session restore checks.
5. The API returns a success result without password data. The client clears password fields and displays success.

### Member activity subpage flow

1. The member selects My Loans in the profile hub navigation.
2. The client requests the authenticated member's loans; the server resolves the member from the active actor and returns only that member's records.
3. The client shows active loans by default. The member may switch to past loans; overdue active loan cards are highlighted and Return remains disabled.
4. Selecting My Reservations or My Fines shows its placeholder without requesting or mutating reservation/fine records.

### Ownership and role boundaries

- The member may read and update only the account identified by the authenticated session.
- The API must reject unauthenticated requests and non-member actors for member profile operations.
- These operations do not grant or change librarian or manager privileges. Librarian account support remains within Jiali's assigned area.

## Out of scope

- Librarian and manager profile pages or self-service account changes.
- Reservation cancellation, fine details, fine payment, and related APIs or state changes.
- Reporting loan returns from the disabled Return button.
- Email verification, confirmation links, or delayed email activation.
- Forgotten-password reset flows.
- Changes to account type, account status, member ID, employee ID, manager privileges, or registration date.
- Additional profile data such as address or phone number.
- Changing the project's authentication/session architecture.

## Risks and tradeoffs

- Email uniqueness must remain atomic during concurrent updates or registrations; separate non-transactional checks could permit duplicate claims.
- Authentication-version checks must be applied consistently to business API authorization and session restore. A missed check could leave an old session usable after a password change.
- Client user state can become stale after successful mutations unless the returned safe summary is applied or refreshed.
- Email verification is intentionally omitted per the design decision, so an incorrectly entered address can immediately become the account's login email.
- Password errors need useful feedback while avoiding disclosure of whether an account exists or exposing credential data.
- Loan history must remain restricted to the authenticated member; placeholder subpages must not imply that reservation or fine records are already available.

## Open decisions

No product decisions remain open for this design. The exact API paths and payload field names are implementation details to be selected consistently with the existing API conventions.

## Context reviewed

- `Overview.md` — account model, member account management, and application architecture.
- `PlanDraft/Developer_Responsibilities/junhong.md` — member feature ownership, including profile updates and member-facing client/API integration.
- `PlanDraft/Developer_Responsibilities/jiali.md` — librarian and manager responsibilities excluded from this feature.
- `PlanDraft/specs/Member/ProfilePage.md` — planning draft refined into this design.
- `PlanDraft/specs/Member/Dashboard.md` — member navbar and profile icon reference.
- `PLAN.md` — identity-access and session architecture, security boundaries, and implementation sequence.
- `specdocs/completed/authentication-and-sessions/design.md` — current authentication contract and session behavior.
- `apps/api/src/routes/auth.ts` — current authentication routes and safe account summaries.
- `apps/api/src/storage/accounts.ts` and `apps/api/src/storage/repositories.ts` — account operations, email uniqueness, identity keys, and storage transactions.
- `apps/api/src/storage/firestore-session-store.ts` — current Firestore session store; the approved design adds authentication-version persistence and checking.
- `packages/shared/src/domain/records.ts` — shared user record schema and email canonicalization.
- `apps/client/src/auth/AuthContext.tsx`, `apps/client/src/App.tsx`, and `apps/client/src/components/MemberNavigation.tsx` — authenticated client state, routes, and member navigation.
- `PlanDraft/Specs/Member/ProfilePage.md` — updated profile hub, My Loans, and reservation/fine placeholder requirements.
- Source code is present and was reviewed.

## Amendments

- 2026-10-20: Replaced best-effort deletion of other sessions after a password change with authentication-version checks. User records and sessions carry a version; the password hash, version increment, and current-session version update are committed together. Older sessions are rejected during active-actor authorization and session restore. Missing versions on existing users and sessions are treated as `0`.
- 2026-10-20: Moved the profile section navigation requirement from the right side to the left side of the content panel on wide screens. On narrow screens, the section navigation remains above the panel.
- 2026-10-20: Consolidated profile, email, and password updates into one profile subpage. This supersedes the prior left-side section-navigation layout requirement; all three forms appear together without tab navigation.
- 2026-10-20: Expanded the profile hub to include Profile, My Loans, My Reservations, and My Fines subpages. Added member-owned active/past loan display requirements and accessible placeholder-only reservations/fines pages. Profile account update forms remain together on the Profile subpage; loan return, reservation, and fine actions remain out of scope.

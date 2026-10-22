# Member Profile Page Tasks

This checklist follows [`design.md`](./design.md). Implement only the member profile capabilities in that design; librarian and manager account features remain out of scope.

## Implementation checklist

- [x] **Add authentication-version fields with legacy compatibility** - Add a non-negative authentication version to the shared user record and persist it in authenticated Firestore sessions. Treat a missing version on existing user records or sessions as `0`; initialize new sessions with the current user version. Keep the version server-side and exclude it from safe account summaries.
  - Acceptance criteria: Existing user and session records without a version continue to parse and behave as version `0`; new authenticated sessions persist the account's current version; safe auth/profile responses omit `authVersion`; no client request can set the authoritative version.
  - References: Design §§ Acceptance criteria (15), Technical specifications / API and account operations, Data and compatibility; `packages/shared/src/domain/records.ts`; `apps/api/src/storage/firestore-session-store.ts`; `apps/api/src/routes/auth.ts`.

- [x] **Reject stale sessions during authorization and session restore** - Compare the version in the authenticated session with the current user record in active-actor authorization and `/auth/session` restore. Destroy and clear a stale session during restore, consistent with existing invalid-session handling.
  - Acceptance criteria: A session at the current version can access protected APIs; a session with an older version is rejected and cannot access member or other business APIs; session restore reports it unauthenticated and clears the stale cookie; legacy sessions with no version are accepted only while the account version is `0`.
  - References: Design §§ Acceptance criteria (13, 15), Technical specifications / API and account operations, Integration specifications / Ownership and role boundaries; `apps/api/src/http/auth.ts`; `apps/api/src/routes/auth.ts`; `tests/active-actor.test.mjs`; `tests/auth-routes.test.mjs`.

- [x] **Implement member profile read, name, and email operations** - Add authenticated member API operations for reading a safe current profile summary and updating the current member's name or email. Resolve ownership from the server session, validate fields server-side, reuse existing canonical-email identity transactions, and return only a safe account summary.
  - Acceptance criteria: Active members can read and update only their own profile; unauthenticated and librarian requests are rejected; empty names and invalid emails are rejected; names follow the existing trim/non-empty/120-character rules; duplicate emails across either account type are rejected atomically, including concurrent claims; email changes release the old identity and allow login with the new address; unrelated user fields and account status do not change; errors follow the existing API error envelope.
  - References: Design §§ Acceptance criteria (3–8, 13–14), Technical specifications / API and account operations and Data and compatibility, Integration specifications / Account update flow; `apps/api/src/routes/member-borrow.ts`; `apps/api/src/storage/accounts.ts`; `apps/api/src/storage/repositories.ts`; `packages/shared/src/domain/records.ts`.

- [x] **Implement password change with atomic version advancement** - Add a member password-change operation requiring the current password, new password, and confirmation. Verify the current password, validate the registration-compatible policy, hash with Argon2id, and atomically update the password hash, increment the user's authentication version, and update the current server-side session to that version.
  - Acceptance criteria: Incorrect current passwords, confirmation mismatch, passwords shorter than eight characters, and passwords containing whitespace are rejected without changing the password or version; a successful change makes the new password work and the old password fail; the current session remains valid at the new version; sessions at previous versions fail the checks from the preceding task; password hashes and session identifiers are never returned or logged.
  - References: Design §§ Acceptance criteria (9–11, 14–15), Technical specifications / API and account operations, Integration specifications / Password change flow; `apps/api/src/storage/accounts.ts`; `apps/api/src/storage/firestore-session-store.ts`; `apps/api/src/routes/auth.ts`; `apps/api/src/http/auth.ts`.

- [x] **Connect profile operations to the React client and authenticated state** - Add client API methods for profile reads and mutations, and update or refresh `AuthContext` after name/email changes. Do not expose or accept the server-side authentication version in client state or requests.
  - Acceptance criteria: The client sends requests through `apiRequest` with the current cookie session; the profile shows the current safe name/email; successful changes update the displayed authenticated user without signing out; API failures remain available to the page for clear error feedback; no profile client code accesses Firestore directly.
  - References: Design §§ Acceptance criteria (1, 3, 8, 12, 14–15), Technical specifications / Client, Integration specifications / Account update flow; `apps/client/src/api/base.ts`; `apps/client/src/auth/AuthContext.tsx`.

- [x] **Build the member profile page and navigation** - Add a protected member profile route and page, connect the Profile navigation control, and provide profile, email, and password sections with profile details selected by default.
  - Acceptance criteria: Signed-in members can navigate to the page and see their current name/email; non-members cannot access it; sections and forms are keyboard-operable and have accessible labels; client checks provide early feedback for email format, password length/whitespace, and confirmation mismatch; successful updates show success feedback; failures show errors and retain non-password values; password fields clear after request completion; the current name/email updates across member pages.
  - References: Design §§ Acceptance criteria (1–4, 7–8, 10, 12–14), Technical specifications / Client, Integration specifications / Account update flow and Password change flow; `apps/client/src/App.tsx`; `apps/client/src/components/MemberNavigation.tsx`; `apps/client/src/pages/MemberDashboard.tsx`; `apps/client/src/styles.css`.

- [x] **Verify profile ownership, account updates, and session-version behavior** - Add route, storage, client, and emulator coverage for the acceptance scenarios, following the project's built-in Node test conventions and existing Firestore Emulator verification scripts.
  - Acceptance criteria: Tests cover name/email validation and feedback, cross-role email uniqueness and concurrent claims, ownership and role denial, safe responses, password verification and policy, Argon2id password replacement, current-session continuation, stale-session denial in protected APIs and restore, and compatibility for existing versionless records. `npm test` and an emulator verification flow pass without production credentials.
  - References: Design §§ Acceptance criteria (1–15), Risks and tradeoffs; `tests/active-actor.test.mjs`; `tests/auth-routes.test.mjs`; `tests/verify-auth-emulator.mjs`; `package.json`.

- [x] **Move profile sections to the left of the content panel** - Place the vertical profile section navigation on the left of the active panel on wide screens while retaining the stacked mobile layout.
  - Acceptance criteria: On wide screens, profile, email, and password section navigation is displayed to the left of the active content panel; at widths up to 34rem, the navigation remains above the panel and its buttons remain in a horizontal row; the profile section is still selected by default; the layout regression test asserts both desktop placement and mobile stacking.
  - References: Design §§ Purpose and Acceptance criteria (2a), Technical specifications / Client; `apps/client/src/styles.css`; `tests/client-member-navigation.test.mjs`.

- [x] **Show all profile updates on one subpage** - Consolidate the name, email, and password forms so they appear together on the member profile page without separate tabs or subpages.
  - Acceptance criteria: The name, email, and password forms are visible together on `/member/profile`; no tablist, tab, or tabpanel navigation remains; each form has an accessible heading and labels; existing validation, success/error feedback, non-secret value retention, password clearing, and name/email AuthContext updates remain intact; tests verify the three forms appear on the same page.
  - References: Design §§ Capabilities, Product specifications / Profile details, Acceptance criteria (2, 12), Technical specifications / Client; `apps/client/src/pages/MemberProfile.tsx`; `apps/client/src/styles.css`; `tests/client-member-navigation.test.mjs`.

- [x] **Add profile hub navigation and reservation/fine placeholders** - Add Profile, My Loans, My Reservations, and My Fines destinations to the member profile hub. Keep Profile selected by default and provide placeholder pages for reservations and fines.
  - Acceptance criteria: All four destinations are keyboard-operable and accessible; Profile is selected on entry; My Reservations and My Fines show clear unavailable messaging; the placeholders do not fetch records or expose filters, dialogs, or state-changing controls; the hub is member-only.
  - References: Design §§ Capabilities, Product specifications / My Reservations and My Fines placeholders, Acceptance criteria (2, 18), Technical specifications / Client; `apps/client/src/App.tsx`; `apps/client/src/pages/MemberProfile.tsx`; `apps/client/src/styles.css`; `tests/client-member-navigation.test.mjs`.

- [x] **Add a member-owned loan-list API** - Expose the authenticated member's loan records through a read-only API for the My Loans subpage.
  - Acceptance criteria: The API derives member identity from the active server actor, returns only that member's loans, rejects signed-out and non-member actors, and does not mutate loan/copy state; tests cover ownership, role denial, safe results, and errors.
  - References: Design §§ Acceptance criteria (16), Technical specifications / Client, Integration specifications / Member activity subpage flow; `apps/api/src/routes/member-borrow.ts`; `apps/api/src/storage/repositories.ts`; `packages/shared/src/domain/records.ts`.

- [x] **Implement the My Loans subpage** - Load the member's loans and provide active and past views with the approved card and status treatment.
  - Acceptance criteria: Active loans are shown by default; members can switch to past loans; each loan card shows book title and due date; overdue active loans are highlighted in red; active loans show a disabled Return button, while returned past loans do not; profile hub navigation and existing Profile forms remain functional.
  - References: Design §§ Product specifications / My Loans, Acceptance criteria (16–17), Integration specifications / Member activity subpage flow; `apps/client/src/pages/MemberProfile.tsx`; `apps/client/src/api`; `apps/client/src/styles.css`; `tests/client-member-navigation.test.mjs`.

## Dependencies and repository conventions

- The authentication-version fields and compatibility behavior must precede stale-session checks and password changes.
- Stale-session checks must be in place before the password-change endpoint is considered complete.
- The member API operations and client API methods precede wiring the profile forms; the route and forms depend on the updated `AuthContext` behavior.
- Profile hub navigation and the loan-list API precede implementation of the My Loans view.
- `Overview.md` and `PLAN.md` establish React/TypeScript, Express, and Firestore as the application stack and keep browser database access behind the server.
- `apps/api/src/routes/member-borrow.ts` and `apps/api/src/routes/catalog.ts` show Express routers using `requireActiveActor`, route-level role checks, Zod request schemas, and `ApiError` responses.
- `apps/api/src/storage/accounts.ts` and `apps/api/src/storage/repositories.ts` contain account operations and Firestore transactions, including canonical email identity updates.
- `apps/api/src/storage/firestore-session-store.ts` persists authenticated sessions in Firestore. The design extends this existing store; it does not add a session collection.
- `apps/client/src/api/base.ts` provides cookie-authenticated API requests; `AuthContext.tsx` owns the safe client account summary; member pages reuse `MemberNavigation`.
- `package.json` defines `npm test` as a build followed by Node's built-in test runner. Emulator verification scripts use the Firestore Emulator and refuse production execution.

## Open decisions

None. Authentication-version session invalidation was added to the design by the 2026-10-20 amendment and is reflected in the tasks above.

## amendments

- 2026-10-20: Completed authentication-version fields with legacy compatibility. Verified user/session version `0` defaults, login persistence, safe-summary omission, strict auth input, focused tests, and build.
- 2026-10-20: Completed stale-session checks. Verified current and legacy version matching, protected API rejection of stale sessions, and stale-session destruction/cookie clearing during restore.
- 2026-10-20: Completed member profile read, name, and email operations. Verified safe responses, member ownership and role denial, field validation, canonical email release, cross-role uniqueness including concurrent claims, preserved account fields, focused tests, and build.
- 2026-10-20: Completed password change with atomic authentication-version advancement. Verified password policy/current-password checks, Argon2id replacement, current-session update, stale-version race rejection, safe output, focused tests, and build.
- 2026-10-20: Completed client profile API and authenticated-state updater. Verified cookie-authenticated API requests, safe request/response fields, name/email user-state update mechanism, error propagation, focused tests, and build. The profile page will call the updater in the next task.
- 2026-10-20: Completed the member profile page and navigation. Verified member-only route, safe account details, accessible section controls and forms, right-side section layout on wide screens, mobile stacking, early validation, feedback/value behavior, AuthContext updates, focused navigation tests, and build.
- 2026-10-20: Completed profile verification coverage. Added route, storage, client API, and Firestore Emulator checks for ownership, validation, cross-role and concurrent email uniqueness, safe responses, password changes, auth-version invalidation, and versionless compatibility. `npm test` passed (107 tests); the local demo-project emulator flow passed. UI feedback and value retention were verified against the page implementation and API error-propagation tests.
- 2026-10-20: Amended the profile layout requirement: section navigation belongs on the left of the content panel on wide screens and remains above the panel on narrow screens. Added a separate layout task without reopening completed work.
- 2026-10-20: Completed the profile section layout amendment. Verified the wide-screen left-side placement, narrow-screen stacked navigation with horizontal buttons, and default Profile details selection. `npm run build && node --test tests/client-member-navigation.test.mjs` passed (7 tests).
- 2026-10-20: Amended the design to show name, email, and password updates together on one profile subpage. This supersedes the previous section-tab layout requirement. Added a separate implementation task while preserving the completed layout task as history.
- 2026-10-20: Completed the single-subpage profile layout. Verified all three headed forms render together without tab controls, existing form validation and state-update logic remain in place, focused client tests pass (6 tests), and full `npm test` passes (106 tests).
- 2026-10-20: Revised the checklist for the approved profile hub expansion. Added tasks for profile navigation and reservation/fine placeholders, a member-owned loan-list API, and the active/past My Loans page; existing completed profile tasks remain complete.
- 2026-10-20: Completed profile hub navigation and reservation/fine placeholders. Verified all four destinations, Profile default selection, member-only access, unavailable messaging with no data/actions, and retention of the global member navigation. Build and focused client navigation tests passed (10 tests).
- 2026-10-20: Completed the member-owned loan-list API. Verified authenticated member ownership, signed-out/librarian/inactive denial, allowlisted results, read-only storage behavior, and error envelopes. Build and focused API/storage tests passed (17 tests).
- 2026-10-20: Completed the My Loans subpage. Verified active/past selection, title and formatted due date rendering, overdue styling, disabled Return behavior, timestamp decoding, and preserved profile hub navigation/placeholders. `npm test` passed (117 tests).

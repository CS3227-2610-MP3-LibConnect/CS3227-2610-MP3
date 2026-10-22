# Role-Specific Dashboards Implementation Tasks

Implement tasks in order. The approved design is the behavior and contract source; repository paths below ground the implementation in current client and authorization conventions.

## Task list

- [x] **Add role-specific dashboard routes and guards** - Replace the shared dashboard route with `/member/dashboard` and `/librarian/dashboard`. Protect both with the existing session-aware route pattern and check the authenticated user's `accountType`; redirect a signed-in user requesting the other role's route to their own dashboard. Make `/` redirect to the dashboard selected from the restored session, retaining the session loading state until that role is known.
  - Acceptance criteria: A member can render only `/member/dashboard`; a librarian can render only `/librarian/dashboard`; cross-role navigation redirects to the authenticated user's dashboard without rendering the requested dashboard; signed-out users are sent to login; opening `/` while signed in resolves to the correct role dashboard after session loading.
  - References: Design “Acceptance criteria” 3–5 and 7; “Client routes and guards”; `apps/client/src/App.tsx`; `apps/client/src/auth/ProtectedRoute.tsx`; `apps/client/src/auth/AuthContext.tsx`.

- [x] **Make login redirects role-aware** - After login or when `LoginPage` finds an existing session, navigate to the authenticated user's role dashboard. Preserve a saved return path only when it is permitted for that account type; otherwise use that role's dashboard. Keep the no-JavaScript login redirect to `/` and rely on the role-aware root route after session restore.
  - Acceptance criteria: Member login reaches `/member/dashboard`; librarian login reaches `/librarian/dashboard`; a saved path to the other role's dashboard cannot override this routing; an already signed-in user visiting `/login` is directed to their own dashboard; native HTML login still lands on the correct dashboard via `/`.
  - References: Design “Acceptance criteria” 1, 2, 6, and 9; “Login navigation”; “No-JavaScript login”; `apps/client/src/pages/LoginPage.tsx`; `apps/api/src/routes/auth.ts`.

- [x] **Verify role-specific navigation and access behavior** - Verify the design's route and login acceptance criteria with the client and authenticated sessions for both account types, including direct URL navigation, signed-out access, saved return paths, root routing, session restore, and the native HTML login redirect. Confirm that existing business API role checks remain the authorization boundary; do not introduce client-supplied role authorization.
  - Acceptance criteria: Each design acceptance criterion 1–9 has a corresponding verification result; neither dashboard renders to the wrong role or to a signed-out user; existing server-side API authorization remains unchanged and authoritative.
  - References: Design “Acceptance criteria” 1–9; “Server authorization boundary”; `tests/client-auth.test.mjs`; `apps/api/src/http/auth.ts`; `apps/api/src/routes/catalog.ts`; `apps/api/src/storage/repositories.ts`; `apps/api/src/storage/workflows.ts`.

## Repository conventions and dependencies

- The client is React + TypeScript with React Router routes in `apps/client/src/App.tsx` and a `BrowserRouter` provided in `apps/client/src/main.tsx`.
- `AuthContext` restores the server session and exposes `user` and `loading`; the safe session summary includes `accountType` (`apps/client/src/auth/AuthContext.tsx`, `apps/api/src/routes/auth.ts`). Preserve loading behavior before choosing role-specific navigation.
- The existing `ProtectedRoute` redirects signed-out users to login and stores the attempted location (`apps/client/src/auth/ProtectedRoute.tsx`). Role enforcement should build on this client navigation convention.
- `LoginPage` currently reads the saved location and redirects after login (`apps/client/src/pages/LoginPage.tsx`). Apply the role restriction to the destination before navigating.
- API authorization uses the server-loaded actor and role checks (`apps/api/src/http/auth.ts`, `apps/api/src/routes/catalog.ts`, `apps/api/src/storage/repositories.ts`, `apps/api/src/storage/workflows.ts`). Client route guards are for page navigation and must not replace those checks.
- Native HTML login redirects to `/` after establishing a session (`apps/api/src/routes/auth.ts`); retain that contract and make `/` role-aware in the client.
- Existing client auth behavior has Node test coverage in `tests/client-auth.test.mjs`; use the repository's established verification approach when implementing this plan.

## amendments

- 2026-10-16: Completed all three tasks. Added role-restricted dashboard routes and role-aware login/root redirects. Added route and destination coverage; updated stale auth-route test fixtures/assertions to match the existing registration contract. `npm test` passed (20 tests).

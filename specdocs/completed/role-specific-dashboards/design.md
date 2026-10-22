# Role-Specific Dashboards

## Description

Route authenticated members and librarians to distinct dashboards and prevent either account type from rendering the other role's dashboard.

## Purpose

Complete the existing authentication flow by directing each signed-in account to the dashboard for its role and enforcing role separation across protected dashboard routes.

## Why this change is required

The authentication and session flow is implemented, including a server-provided account type in the session response. However, `apps/client/src/App.tsx` currently exposes one protected dashboard at `/` for both account types. `apps/client/src/pages/LoginPage.tsx` directs a successful login to a saved return path or `/`, and sends an already signed-in user to `/`. The client does not have role-specific dashboard routes or guards.

The API already resolves the authenticated actor from the server-side session in `apps/api/src/http/auth.ts`. Existing business operations use server-side role checks in `apps/api/src/routes/catalog.ts`, `apps/api/src/storage/repositories.ts`, and `apps/api/src/storage/workflows.ts`. This feature adds role-aware dashboard navigation and page access checks while retaining those server authorization boundaries.

## Capabilities

### Added

- Distinct member and librarian dashboard routes.
- Role-aware routing from the application root and after login/session restore.
- Client route checks that prevent a member from rendering the librarian dashboard and a librarian from rendering the member dashboard.

### Modified

- Successful login and signed-in visits to `/` resolve to the account's role-specific dashboard.
- Saved return paths are honored only when permitted for the authenticated account type; otherwise the user goes to their own dashboard.
- The existing shared dashboard route is replaced by role-specific dashboard destinations. Dashboard-specific content is not defined by this specification.

## Product specifications

- A member who signs in is taken to the member dashboard.
- A librarian who signs in is taken to the librarian dashboard.
- A signed-in user who directly opens the other role's dashboard is redirected to their own dashboard, without rendering the requested dashboard.
- Signed-out users cannot render either dashboard and are directed to login.
- After session restore, routing uses the authenticated user's account type in the server-provided session response.
- The login form's account-type selection remains a credential check; it does not grant access. The authenticated account type determines the permitted dashboard.
- The no-JavaScript login flow may continue redirecting successful form submissions to `/`; the client resolves `/` to the correct dashboard after session restore.

## Acceptance criteria

1. A member who signs in is taken to `/member/dashboard`.
2. A librarian who signs in is taken to `/librarian/dashboard`.
3. A signed-in member who opens `/librarian/dashboard` cannot render the librarian dashboard and is redirected to `/member/dashboard`.
4. A signed-in librarian who opens `/member/dashboard` cannot render the member dashboard and is redirected to `/librarian/dashboard`.
5. A signed-out user who opens either dashboard route cannot render it and is directed to login.
6. A saved return path for the other role's dashboard cannot override role routing after login.
7. A signed-in user who opens `/` is sent to the dashboard for their account type.
8. A client-supplied role value does not grant dashboard or business API access; existing server-side authorization remains authoritative.
9. Successful no-JavaScript login, which redirects to `/`, resolves to the correct dashboard after the client loads and restores the session.

## Technical specifications

### Client routes and guards

Use `/member/dashboard` and `/librarian/dashboard` as the role-specific dashboard paths. Protect both with authentication and account-type checks using the session user in `AuthContext`. An unauthenticated request to either route follows the existing protected-route behavior and goes to login. An authenticated user requesting the other role's route is redirected to their own dashboard.

Keep `/` as a role-aware redirect: send a member to `/member/dashboard` and a librarian to `/librarian/dashboard`. Preserve the loading state while session restore is in progress so the client does not route based on an unresolved session.

### Login navigation

After login, use the authenticated user's role to choose the destination. A saved return path may be retained only if it is permitted for that user; otherwise use the user's role dashboard. Apply equivalent role-aware routing when the login page detects an already signed-in user.

### Server authorization boundary

The client route guard controls which dashboard page is rendered; it is not an authorization boundary for data. Dashboard data and actions must use authenticated API endpoints. Any dashboard-specific endpoint introduced by a later feature must authorize using the server-loaded actor and enforce the relevant account type. Continue applying the existing server-side role checks to business operations.

### No-JavaScript login

Keep the existing HTML form login redirect to `/`. The root route on the client resolves the destination from the restored session. Do not pass role or account identity in a redirect parameter as a source of authorization.

## Integration specifications

- **Auth state:** Use `AuthContext`'s restored `user` and `loading` values; `accountType` is returned by the session endpoint.
- **Routing:** Update `App.tsx` and the protected-route behavior (or add a role-aware route guard) to implement the role destinations and root redirect.
- **Login:** Update `LoginPage.tsx` to honor only role-permitted return paths and otherwise select the role dashboard.
- **API:** Preserve the existing authenticated actor and role enforcement. UI route checks do not replace API authorization.
- **Static form flow:** The auth API can continue returning the browser to `/` after successful no-JavaScript login.

## Out of scope

- New authentication endpoints, account types, registration behavior, or librarian activation policy.
- Dashboard-specific business features, widgets, or data requirements.
- Changes to manager privileges or librarian account administration.
- Changes to the session model or existing API authorization architecture.

## Risks and tradeoffs

- Client-side guards prevent rendering role-specific pages but cannot secure data returned by APIs; dashboard endpoints must enforce authorization on the server.
- A saved return path that is not checked against the authenticated role could bypass the intended navigation and must be constrained.
- This specification establishes separate destinations and access enforcement, but does not define the content of either dashboard.

## Context reviewed

- `Overview.md` — account types, account status, and application architecture.
- `specdocs/authentication-and-sessions/design.md` and `specdocs/authentication-and-sessions/tasks.md` — existing authentication design and completed scope.
- `apps/client/src/App.tsx` — current shared protected dashboard at `/`.
- `apps/client/src/auth/ProtectedRoute.tsx` and `apps/client/src/auth/AuthContext.tsx` — current authentication guard and restored session state.
- `apps/client/src/pages/LoginPage.tsx` — current post-login and already-signed-in navigation.
- `apps/api/src/routes/auth.ts` — session response and successful HTML login redirect.
- `apps/api/src/http/auth.ts`, `apps/api/src/routes/catalog.ts`, `apps/api/src/storage/repositories.ts`, and `apps/api/src/storage/workflows.ts` — server-loaded actor and existing role checks.

## Resolved decisions

- Member dashboard path: `/member/dashboard`.
- Librarian dashboard path: `/librarian/dashboard`.
- A signed-in user who requests the other role's dashboard is redirected to their own role dashboard.
- `/` is a role-aware redirect based on the authenticated session user.

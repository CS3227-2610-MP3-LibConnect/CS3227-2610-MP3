# Member Dashboard

## Description

Replace the member's welcome-only dashboard with a searchable catalog, book detail pages, and a reusable navigation bar.

## Purpose

Give signed-in members a place to browse the library's catalog, find titles using combined search criteria, and inspect book and copy details.

## Why this change is required

The role-specific dashboard routes and guards are implemented, but both roles currently render the same welcome-only `DashboardPage` in `apps/client/src/App.tsx`. There is no catalog UI or book detail page.

The backend provides authenticated catalog endpoints. The client has a credentialed catalog API wrapper and paginated `listBooks` support in `apps/client/src/api/catalog.ts`, but the dashboard does not use them. The book detail endpoint returns book data, copies, and availability counts through `GET /api/v1/books/:isbn` in `apps/api/src/routes/catalog.ts`.

## Capabilities

### Added

- A member dashboard catalog with title search, advanced filters, and cursor-based pagination.
- Book cards that navigate to a member book detail page.
- A book detail page showing catalog information and copy availability.
- A reusable navigation bar with a dashboard item, disabled profile button, and Logout button to its right.

### Modified

- The existing member dashboard changes from a welcome-only page to a catalog dashboard.
- The member dashboard navigation retains the existing sign-out behavior through a Logout button immediately to the right of the profile button.
- The catalog API contract is extended to support inclusive publication-year ranges in addition to exact-year filtering. The current `workflow/specdocs/catalog-read-api/design.md` defines exact-year filtering only; update that specification and its implementation checklist before implementing the range extension.
- The librarian dashboard remains unchanged.

## Product specifications

- A signed-in member sees “Welcome back, <name>” and the catalog on `/member/dashboard`.
- The catalog lists all catalog titles, including titles without an available copy.
- Basic search matches title substrings without case sensitivity.
- Advanced filters support case-insensitive substring matching for author, publisher, and category. ISBN matches exactly.
- Advanced filters apply only when the Advanced Search panel is expanded at submission time. When the panel is collapsed, submitting Search applies the title criterion only, even if advanced fields still contain values.
- Publication year can be filtered by an exact year or an inclusive range from a start year to an end year. A range requires both bounds, and the start year must not exceed the end year.
- When Advanced Search is expanded, members may combine its populated criteria with the title criterion. Selected criteria use AND semantics. For example, title containing `xxx` and publication year equal to `yyyy` returns only books matching both criteria. This also applies when combining text filters with an exact year or year range.
- Submitting or clearing filters resets pagination. Results load in pages without duplicates or skipped books. The interface provides loading, error and retry, empty-result, and end-of-results states.
- Each book card shows the title, category, and a shortened synopsis, without a cover image or placeholder. The card is keyboard-accessible and opens the corresponding book detail page.
- The book detail page shows ISBN, title, author or authors, publication year, publisher, category, synopsis, and each copy's shelf location and status. A missing book displays a not-found state.
- The navbar shows the LibConnect brand, the active Dashboard item, a profile button, and a Logout button immediately to the profile button's right. The profile button is disabled until the profile page is implemented. Selecting LibConnect returns to the member dashboard.

## Acceptance criteria

1. A signed-in member opening `/member/dashboard` sees their name and the catalog.
2. The catalog includes every book title returned by the catalog list API, regardless of copy availability.
3. Title, author, publisher, and category filters match substrings without case sensitivity; ISBN matches exactly.
4. Exact publication-year filtering and inclusive year-range filtering work. A range without both bounds or with a start later than the end is rejected or prevented by validation.
5. When Advanced Search is collapsed, submitting Search applies only the title substring, even if advanced fields still contain values. When it is expanded, populated advanced filters combine with the title substring using AND semantics, including exact-year or year-range criteria.
6. Pagination resets when filters are submitted or cleared. Continuing through result pages neither duplicates nor skips matching books.
7. Loading, API failure with retry, no results, and end-of-results states are communicated to the member.
8. Book cards show the title, category, and shortened synopsis without a cover image or placeholder; activating a card by pointer or keyboard opens its detail page.
9. The detail page shows all specified book fields and each copy's shelf location and status. A missing ISBN shows a not-found state.
10. The navbar brand returns to `/member/dashboard`; Dashboard is visually identified as the current item and disabled; the profile button is visibly disabled; the Logout button appears immediately to its right and logs the member out.
11. Dashboard and detail routes are restricted to authenticated members using the existing route guard. API requests use the existing credentialed client. Server-side active-actor authorization remains authoritative.
12. No browser code accesses Firestore directly, and no book cover data or external image integration is added by this feature.

## Technical specifications

### Client routes and components

- Keep `/member/dashboard` and render the member catalog there. Keep the librarian dashboard behavior unchanged.
- Add a member book detail route, proposed as `/member/books/:isbn`, protected by the existing member route guard in `apps/client/src/App.tsx`.
- Extract a reusable navbar component. Use React Router links for client-side navigation.
- Use the existing auth context for the personalized greeting and Logout behavior.
- Use the existing `catalogApi.listBooks` method and credentialed request layer. Request subsequent pages using the returned cursor and the same filter set.
- Use `GET /api/v1/books/:isbn` for book details and copy availability. Handle API errors and missing-book responses with an appropriate error or not-found state.

### Search contract

The client supports title, author, publisher, and category substring filters, exact ISBN, exact publication year, and inclusive publication-year bounds. The proposed query names for range bounds are `publicationYearFrom` and `publicationYearTo`.

The title criterion is controlled by the basic search field. Advanced criteria are eligible for submission only while the Advanced Search panel is expanded. If the panel is collapsed at submission time, the client sends the title criterion only and omits all advanced criteria, regardless of values remaining in those fields.

The API validates year bounds as integers within the supported publication-year domain, requires both bounds together, and rejects a lower bound greater than the upper bound. Exact year and a year range are mutually exclusive. All supplied criteria combine with AND semantics. The repository applies year constraints before substring matching and preserves cursor pagination. Cursor identity includes all normalized filters so a cursor cannot be reused for a different search.

This range contract extends the existing catalog API design, which currently specifies `publicationYear` exact matching only. Revise `workflow/specdocs/catalog-read-api/design.md` and the corresponding tasks before implementation; add API, repository, and emulator acceptance coverage for the range behavior.

### Data and presentation

- Keep book and copy domain records unchanged.
- Do not render a cover image or placeholder on book cards.
- Render synopsis text with a visual length limit and ellipsis; do not use synopsis as a search field.
- Ensure filter controls, result cards, pagination actions, statuses, loading states, and errors have accessible names and keyboard behavior.

## Integration specifications

### Request and navigation flow

1. The member opens `/member/dashboard`; the existing guard verifies the authenticated account type.
2. At submission time, the client always includes the title criterion and includes populated advanced criteria only if the Advanced Search panel is expanded; when collapsed, it omits every advanced criterion. It requests a page from `GET /api/v1/books` through `catalogApi.listBooks` with the resulting filter set and cursor.
3. The Express route authenticates the active actor, validates the filters, and passes them to the catalog repository.
4. The repository applies exact ISBN/year constraints or inclusive year bounds, then supported text substring matching, and returns a cursor-based page.
5. Selecting a book navigates to `/member/books/:isbn`.
6. The detail page requests `GET /api/v1/books/:isbn`, which returns the book, copies, and availability summary.

### Authorization and data ownership

- The Express server remains the only application component that reads Firestore.
- Dashboard and detail routes use existing session and member-role route guards.
- Catalog API routes continue to require an active server-loaded actor. Client route checks do not replace API authorization.
- Do not use client-supplied account type or other identity values to grant access.

### Navigation

- The navbar is reusable for later member pages, but this feature only supplies the dashboard destination.
- The profile button is disabled until a profile page and route are implemented. The Logout button is immediately to its right and uses the existing logout behavior.
- Selecting the LibConnect brand navigates to the member dashboard.

## Out of scope

- Librarian dashboard content.
- Profile-page implementation or profile editing.
- Catalog create, update, or delete operations.
- Borrowing, reservations, fines, or other circulation actions.
- Adding cover-image fields, fetching images from an external service, or selecting a cover-art source.
- Changes to server authorization architecture or direct browser access to Firestore.

## Risks and tradeoffs

- The existing `catalog-read-api` design supports exact `publicationYear` only. Range search requires an explicit update to that API contract, repository implementation, and emulator verification before this dashboard can satisfy its year-range criteria.
- Year bounds must remain consistent across Firestore filtering, substring matching, pagination, and cursor validation.
- Book cards omit cover images and placeholders; adding cover art would require a separate product decision.
- Client route guards control page navigation but do not secure data; the API's active-actor checks remain required.

## Open decisions

None. The user confirmed that members may search by an exact publication year or a range, should see all catalog titles, should omit cover images from book cards, and should see a disabled profile placeholder until the profile page is implemented.

## Amendments

- 2026-10-23: Removed the cover placeholder from book cards; cards show title, category, and shortened synopsis without cover imagery, per user request.
- 2026-10-20: Specified that collapsed Advanced Search submits the title criterion only, even when advanced fields retain values; expanded Advanced Search submits populated advanced criteria alongside the title using the existing AND semantics.

## Context reviewed

- `plandraft/specs/member/dashboard.md` — member dashboard, navbar, book cards, and book information page requirements.
- `Overview.md` — account roles, book and copy fields, and application architecture.
- `workflow/PLAN.md` — architecture baseline, catalog/inventory capability, and testing strategy.
- `workflow/specdocs/completed/role-specific-dashboards/design.md` and `workflow/specdocs/completed/role-specific-dashboards/tasks.md` — role-specific route and access behavior.
- `workflow/specdocs/catalog-read-api/design.md` and `workflow/specdocs/catalog-read-api/tasks.md` — existing catalog query contract and outstanding work.
- `apps/client/src/App.tsx` — current dashboard routes and placeholder dashboard.
- `apps/client/src/api/catalog.ts` and `apps/client/src/api/base.ts` — catalog client methods and credentialed request behavior.
- `apps/client/src/auth/AuthContext.tsx` and `apps/client/src/auth/ProtectedRoute.tsx` — session and route guard conventions.
- `apps/client/src/styles.css` — current global and dashboard styles.
- `apps/api/src/routes/catalog.ts` and `apps/api/src/storage/repositories.ts` — current authenticated endpoints, exact-year filter, cursor pagination, repository search, and book-detail response.
- `packages/shared/src/domain/records.ts` — book and copy fields; no cover-image field exists.

# LibConnect

LibConnect is an integrated library application for members, librarians, and
librarian managers. Members can search the catalog, borrow and reserve books,
manage loans, fines, notifications, and profiles, and use the bounded Libby
assistant. Librarians manage catalog and circulation workflows, member support,
reservations, fines, notifications, and an advisory review assistant. Managers
also administer librarian accounts.

## Local verification

Install dependencies with `npm install`, then use:

- `npm run build` — compile the API and build the React application.
- `npm test` — run the unified unit, API, client, security, and browser suite.
- `npm run test:coverage` — run the unified suite with coverage gates.
- `npm run emulator` — start Firestore for project `demo-libconnect` at
  `127.0.0.1:8080`.
- `npm run lint` and `npm run format:check` — run static release checks.

The deployment commands and Docker/Firebase configuration are retained for
review, but deployment requires separate approval and production credentials.

## Documentation

- [User Guide](docs/UserGuide.md) — member, librarian, and manager workflows.
- [Developer Guide](docs/DeveloperGuide.md) — architecture, API routes, state
  transitions, security boundaries, and verification.
- [Authentication and Sessions](docs/authentication-and-sessions.md) — local
  setup and authentication verification.
- [Member feature details](docs/feature-details/member-dashboard.md) — member
  dashboard and links to the integrated member capabilities.
- [Deployment reference](docs/feature-details/deployment.md) — retained
  production topology and review-only deployment commands.

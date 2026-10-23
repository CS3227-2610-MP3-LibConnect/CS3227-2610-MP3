# LibConnect MP3 Plan

Status: active implementation baseline for the `jiali-librarian` branch; as of
2026-10-22, manager account administration and librarian password reset have
implementation/review evidence with human merge decisions still pending, the
catalog/inventory implementation and remediation evidence are recorded while a
fresh independent re-review remains pending, order-4 circulation implementation
and remediation evidence are recorded while a fresh independent re-review and
human merge decision remain pending, and order-5 reservations/fines/
notifications has an approved `0.4-approved` specification, `0.2-approved`
checklist, and approved handoff with implementation/review evidence present.
The human accepted the documented residual risks. The application is now
deployed to production (Firebase Hosting + Cloud Run) via team-owned deploy
scripts run manually from a developer machine; CI-automated deployment and the
exact merge and release actions remain separate gates. Order 6 now has an approved
specification/checklist/handoff, completed implementation evidence, and
independent-review evidence, with a final evidence-only re-review and human
merge/residual-risk decision still pending.

## Purpose and source of truth

LibConnect MP3 is a secured, AI-infused web version of the MP2 library
management application. This plan turns the instructor brief, the refined
project overview, and the approved specifications under `workflow/specs/` into an implementation
sequence that can be reviewed before code is written.

The source-of-truth order is:

1. Instructor requirements and submission constraints.
2. [`Overview.md`](../Overview.md) for product scope and domain vocabulary.
3. Approved feature specifications under `workflow/specs/` for testable behavior.
4. This plan for dependency order, delivery evidence, and team coordination.
5. Source code, tests, user guide, developer guide, and reflection documents.

If an implementation decision changes a requirement, update the relevant
specification before changing code.

## Objective

Deliver a public, deployable LibConnect web application with:

- React and TypeScript for the role-specific user interfaces.
- Express and TypeScript for server-side validation, authorization, and
  business workflows.
- Firestore accessed through trusted server code, with separate development
  and production projects.
- Member and librarian account flows, catalog and copy management, loans,
  return/loss verification, reservations, fines, and notifications.
- At least one useful LLM feature for each user role, using the required SoC
  LLM(ask for clarifications when reach here) with explicit rate limits, guardrails, auditability, and human approval
  where an action could change application state.
- Evidence of Spec-Driven Development, basic multi-agent software
  engineering, AI-security testing, deployment separation, and MP2 reuse.

## Capability map

The module ids below are stable identifiers for future `workflow/specs/` features and
task references.

| Module id | Responsibility | Depends on |
|---|---|---|
| `application-storage` | Firestore records, repositories, queries, transactions, emulator setup | — |
| `identity-access` | Registration, login, sessions, profile changes, manager authorization | `application-storage` |
| `catalog-inventory` | Books, synopsis, physical copies, availability, catalog search | `application-storage`, `identity-access` |
| `circulation` | Loans, renewals, return/loss review, reservations, fines, notifications | `application-storage`, `identity-access`, `catalog-inventory` |
| `role-ai-assistance` | Member and librarian AI features, tool boundaries, approvals, AI-security tests | `identity-access`, `catalog-inventory`, `circulation` |
| `secure-delivery-and-agentic-workflow` | CI/CD, dev/prod separation, workflow evidence, logs, documentation, product site | all modules |

Build order: `application-storage` → `identity-access` →
`catalog-inventory` → `circulation` → `role-ai-assistance` →
`secure-delivery-and-agentic-workflow`.

The first two modules may be developed in parallel only after their shared
record and authorization interfaces are agreed. AI work must not bypass the
same service boundaries used by the normal UI.

## Jiali ownership and implementation sequence

This branch implements only the librarian and librarian-manager scope listed
in [`workflow/responsibilities/jiali.md`](./responsibilities/jiali.md).
Member-only UI and workflows remain outside this branch, except where a
librarian action needs a server-side member record or ownership check.

Every feature below must have an approved specification under
`workflow/specs/` before implementation starts. The specification is the
behavioral source of truth; code, tests, and documentation must trace back to
its acceptance criteria.

| Order | Jiali feature | Required specification | Current state |
|---|---|---|---|
| 1 | Manager librarian-account listing, activation/deactivation, and last-manager protection | [`LibrarianAccountManagement.md`](./specs/LibrarianFeatures/ManagerFeatures/LibrarianAccountManagement.md) | Implementation and independent-review evidence present; task-artifact chain remains incomplete; human merge decision pending |
| 2 | Manager reset of librarian passwords | [`ResetLibrarianPassword.md`](./specs/LibrarianFeatures/ManagerFeatures/ResetLibrarianPassword.md) | Implementation and re-review evidence present; human merge decision pending |
| 3 | Librarian books and physical-copy CRUD, status validation, availability, and dashboard data | [`LibrarianCatalogInventory.md`](./specs/LibrarianFeatures/CatalogInventory/LibrarianCatalogInventory.md) | Implementation and remediation evidence present; fresh independent re-review and human merge decision pending |
| 4 | Librarian loan creation and return/loss review with copy disposition | [`LibrarianLoanClosureReview.md`](./specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md) | Specification `0.4-approved`; implementation, remediation, and review evidence present; fresh independent re-review of the corrected commit and human merge decision remain pending |
| 5 | Librarian reservations, fines, and notification management | [`LibrarianReservationsFinesNotifications.md`](./specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md) | Specification `0.4-approved`, task checklist `0.2-approved`, and handoff approved on 2026-10-22; implementation/review evidence present; documented residual risks accepted; exact merge/deployment/release actions remain separate gates |
| 6 | Librarian member-account support and status changes | [`LibrarianMemberAccountSupport.md`](./specs/LibrarianFeatures/MemberSupport/LibrarianMemberAccountSupport.md) | Specification `0.1-approved`, task checklist/handoff approved on 2026-10-22; all six implementation tasks complete; build, lint, full regression, and emulator evidence pass; independent review evidence is present, with final evidence-only re-review and human residual-risk/merge decision pending |
| 7 | Librarian/manager assistant for pending-report summaries and notification drafts | Extend or add a spec under `workflow/specs/LibrarianFeatures/AI/` before coding; also follow `ai-security-review` | Specification required |

### Jiali feature gates

- Before each implementation slice, confirm that its `workflow/specs/`
  document covers the user-visible behavior, server authorization, state
  transitions, error handling, and verification scenarios.
- Implement server authorization and transaction rules before exposing a
  librarian UI for the same action. The authenticated actor loaded by the
  server is authoritative; client-supplied role or manager fields are never
  authorization inputs.
- Add or update librarian, manager, cross-role, and state-transition tests in
  the same slice. Run the relevant tests and `npm run build` before marking a
  task complete.
- If implementation reveals a requirement or data-model change, update the
  relevant specification first and record the decision here before changing
  code.

### Existing baseline to preserve

The branch already contains shared authentication/session handling, role-aware
dashboard routing, typed library records, and a catalog repository/API
baseline. Jiali work must preserve those boundaries and extend them through
the existing Express → domain/storage architecture rather than adding direct
browser access to Firestore.

## Product decisions

### Roles and account activation

The application has two account types: `MEMBER` and `LIBRARIAN`. A librarian
may also have `isManager: true`; this is a privileged librarian capability,
not a public registration choice. This preserves the two-person MP3 role split
while satisfying the manager workflow.

- Members register as `ACTIVE`.
- Librarians register as `INACTIVE`.
- A pre-provisioned master/manager account activates a librarian account.
- Public registration can never set manager privileges.
- Every manager operation is checked on the server against the current
  authenticated account, not against client-provided role fields.
- The bootstrap procedure for the first manager, and the rule preventing the
  last manager from being accidentally deactivated, must be documented before
  production deployment.

### Loan closure and copy states

`PENDING_CLOSE` alone is not enough to tell whether a member reported a
return or a loss. The persisted loan record must therefore include a closure
report type and report/review timestamps.

Required behavior:

| Current state | Member action | Librarian decision | Result |
|---|---|---|---|
| `ACTIVE` / `ON_LOAN` | Report returned | Confirm, with disposition | `CLOSED_RETURNED`; copy becomes `AVAILABLE`, `RESERVED`, or `DAMAGED` |
| `ACTIVE` / `ON_LOAN` | Report returned | Reject report | Loan returns to `ACTIVE`; copy returns to `ON_LOAN` |
| `ACTIVE` / `ON_LOAN` | Report lost | Confirm loss | `CLOSED_LOST`; copy becomes `LOST`; applicable fine is issued |
| `ACTIVE` / `ON_LOAN` | Report lost | Reject report | Loan returns to `ACTIVE`; copy returns to `ON_LOAN` |

While a report is awaiting review, the copy is not lendable. The chosen
representation (`IN_TRANSIT` or separate report-specific copy statuses) must
be used consistently in the domain spec, repository validation, UI, and tests.

### Reservation and notification references

`Notification.referenceId` is polymorphic and must be paired with
`referenceType`:

- `OVERDUE_ALERT` → `LOAN` / `loanId`
- `RESERVATION_READY` → `RESERVATION` / `reservationId`
- `FINE_ISSUED` or `FINE_UPDATED` → `FINE` / `fineId`
- `LIBRARIAN_MESSAGE` → null unless a related entity is intentionally linked

The server validates that the referenced record exists and belongs to the
notification context. The pair is used for navigation and audit context; the
notification message remains a snapshot and is not regenerated from mutable
catalog data.

### Renewal and policy defaults

For the first release, a member may renew an `ACTIVE` loan at most once, only
when no reservation is already assigned or pending for that ISBN and the loan
is not past the chosen renewal cutoff. Renewal extends `dueDate` by the
documented policy period and sets `isRenewed` to true. Librarians may create
loans and process renewals only through the same server-side rules.

The initial borrowing period is 30 days. The exact renewal extension, fine
amounts, currency, and overdue calculation must be recorded in the circulation
spec before implementation.

## AI features and security boundaries

### Member feature: catalog and borrowing assistant

The member assistant answers bounded questions about catalog records,
availability, reservations, borrowing rules, and a member's own current
activity. It can call allowlisted, read-only server tools that return the
minimum data needed for the answer. It cannot create loans, pay fines, change
reservations, or access another member's records.

Book titles, synopses, notification messages, and user-entered questions are
untrusted content. They must never be treated as instructions to the model or
as authorization to call a tool.

### Librarian feature: review and notification assistant

The librarian/manager assistant summarizes pending return and loss reports,
highlights relevant loan/copy/reservation facts, and drafts a notification or
follow-up action. It may not confirm a return, confirm a loss, change a copy
status, activate an account, waive a fine, or send a notification without an
explicit human approval through the normal authorized UI.

### Common AI controls

Apply the project-local [`ai-security-review` skill](../.agents/skills/ai-security-review/SKILL.md) when designing, implementing, testing, or reviewing either role's AI feature or the agentic development workflow.

- Use the SoC LLM only through a server-side adapter; never expose credentials
  to React or to the browser.
- Apply per-user and global rate limits, request size limits, timeouts, retries,
  and a clear unavailable-model fallback.
- Use an allowlist of read-only tools and validate tool arguments against typed
  schemas before execution.
- Minimize personal data sent to the model and redact passwords, session
  identifiers, and unrelated members' records.
- Treat all retrieved application text as untrusted data. Test direct,
  indirect, and tool-result prompt injection attempts.
- Validate model output against a schema, show uncertainty or no-result states,
  and keep a human approval gate for every state-changing action.
- Record safe audit metadata (actor, feature, time, model result category,
  approval outcome) without storing secrets or unnecessary prompt contents.
- Test denial of unauthorized tool calls, cross-member data leakage, prompt
  injection, output manipulation, rate-limit enforcement, and model failure.

## Architecture baseline

```text
React + TypeScript UI
        |
Express routes and session middleware
        |
Domain services and authorization policy
        |
Repositories and transaction services
        |
Firestore (development emulator / production project)
```

The browser never writes application collections directly. Express owns
validation, authorization, transaction boundaries, AI tool access, and audit
events. Firestore rules are deny-by-default for browser access, while trusted
server code uses Firebase Admin credentials stored outside the repository.

Recommended repository structure:

```text
src/
  client/          React pages, components, forms, and API client
  server/          Express routes, middleware, services, and AI adapter
  domain/          Types, status transitions, validation, and policies
  storage/         Firestore repositories and transaction helpers
  shared/          Schemas and constants shared by client/server
tests/              Unit, integration, security, and AI guardrail tests
e2e/                Browser workflows for each role
workflow/           Agent roles, prompts, handoff records, review evidence
docs/               User guide, developer guide, reflections
logs/tasks/         Factual agent execution records
logs/chat/          Verified summaries of development interactions
```

Exact package versions and commands must be established in the bootstrap task
and then recorded in the developer guide. At minimum the project must expose
working `dev`, `build`, `test`, `test:coverage`, `lint`, and `format:check`
scripts.

## Delivery phases and verification gates

### Phase 0 — Specification baseline

- Resolve the overview link/path issue and keep the overview and
  `workflow/specs/` terminology aligned. Generic SDD skills that default to
  `workflow/specdocs/` must use the project adapter in `workflow/README.md`.
- Reconcile email canonicalization across registration, login, and account
  updates.
- Add explicit closure-report, manager-activation, notification-reference,
  renewal, fine-policy, and AI requirements.
- Record open decisions and obtain team agreement before implementation.

Gate: every planned capability has an owner, acceptance scenarios, security
risks, and a test strategy.

### Phase 1 — Web and Firestore foundation

- Bootstrap React/TypeScript, Express/TypeScript, testing, linting, and
  formatting.
- Add Firestore Emulator configuration, seed data, typed records, indexes,
  deny-by-default rules, and separate environment configuration.
- Implement repository interfaces before feature-specific services.

Gate: a clean checkout starts locally, runs tests, and reads emulator data
without production credentials.

### Phase 2 — Identity and account support

- Implement shared user records, canonical identity keys, Argon2id password
  hashing, registration, login, sessions, profile updates, and manager-only
  librarian activation/deactivation/reset flows.
- Verify inactive librarians cannot log in and deactivation invalidates active
  sessions.

Gate: member, librarian, and manager authorization tests pass, including
  cross-role denial, concurrent duplicate registration, and no-JavaScript form
  submission.

### Phase 3 — Catalog and inventory

- Implement books with `synopsis`, physical copies, catalog search, copy
  availability, and librarian CRUD.
- Validate ISBN/copy relationships and prevent invalid status transitions.

Gate: catalog and inventory workflows pass with ownership and librarian role
  checks.

### Phase 4 — Circulation workflows

- Implement borrowing, one-time renewal, member return/loss reporting,
  librarian verification/rejection, copy disposition, reservations, pickup
  expiry, fines, and notifications.
- Use Firestore transactions for every linked state transition and make
  scheduled expiry retry-safe.

Gate: all state-machine scenarios pass under repeated and concurrent requests;
  no loan/copy/reservation inconsistency is observable.

### Phase 5 — Role-specific AI

- Implement the member read-only assistant first, then the librarian review and
  drafting assistant.
- Add server-side tool allowlists, PII minimization, rate limits, audit
  records, approval UI, structured output validation, and adversarial tests.

Gate: each role has a demonstrable AI feature, and security tests show that
  untrusted content cannot cause unauthorized data access or state changes.

### Phase 6 — Deployment and evidence

- Configure development and production Firebase projects and secrets.
- Deployment status: the application is deployed to production (Firebase
  Hosting + Cloud Run, project `libconnect-78904`, region `asia-southeast1`)
  using team-owned deploy scripts (`npm run deploy:firebase` and
  `npm run deploy:gcloud`) run manually from a developer machine. Only the
  GitHub Pages product website is automated through team-owned GitHub Actions
  (`.github/workflows/pages.yml`). No AI build-and-host environment is used.
- CI automation: a team-owned GitHub Actions workflow
  (`.github/workflows/deploy.yml`) now runs `deploy:gcloud` (Cloud Run) and
  `deploy:firebase` (Hosting) to satisfy the "suitable automations (e.g., via
  GitHub Actions)" submission constraint. It is `workflow_dispatch`-triggered
  (with an optional push-to-main trigger) and runs the same scripts used
  manually, so no AI build-and-host environment is involved.
- Outstanding: the workflow requires a `GCP_SA_KEY` repository secret (service
  account with Cloud Run Admin, Artifact Registry Writer, Firebase Hosting
  Admin, and Service Account User roles) and at least one successful verified
  run before the automated path can be considered proven. Optionally configure
  required reviewers on the `production` GitHub Environment to keep a human
  approval gate on releases.
- Complete `docs/UserGuide.md`, `docs/DeveloperGuide.md`,
  `docs/Reflections.md`, `workflow/`, factual `logs/tasks/` records, and
  verified `logs/chat/` summaries.

Gate: a fresh tester can access the deployed app, follow the user guide, and
verify the documented role, AI, and security behavior.

## Testing strategy

- Unit tests: validators, canonicalization, status transitions, fine rules,
  notification-reference validation, AI output schemas, and authorization
  policies.
- Integration tests: Express routes with the Firestore Emulator, repository
  transactions, sessions, manager actions, loan/copy updates, and scheduler
  retry behavior.
- End-to-end tests: no-JavaScript registration/login, role dashboards,
  borrowing, return/loss review, reservation collection/expiry, and AI approval
  flows.
- Security tests: session-cookie flags, HTTPS configuration, authorization
  bypass attempts, direct Firestore denial, input abuse, prompt injection,
  cross-member isolation, secret/log scanning, and rate limits.
- Every acceptance scenario in a `workflow/specs/` feature must map to at least one test
  or a documented manual verification step.

## MP2 reuse and acknowledgement

The MP2 may be reused as a domain reference, implementation reference, and
source of test scenarios for Jiali's librarian and librarian-manager work.
Reuse is allowed only when the result is adapted to the MP3 specifications and
architecture.

### Allowed reuse

- entity vocabulary and relationships for books, copies, loans, reservations,
  fines, and notifications;
- user-facing librarian workflows and validation expectations;
- service/repository separation ideas;
- selected domain tests, edge cases, service behavior, and controller behavior,
  rewritten for TypeScript, Express, Firestore, and the MP3 state machine;
- UI content and terminology where it remains accurate.

### Required adaptation

- Java source must be rewritten as TypeScript rather than copied as the MP3
  implementation.
- JavaFX screens and interaction code must be redesigned as React pages and
  components.
- File repositories and `StorageManager` logic must be replaced by Firestore
  repositories, transactions, and emulator-backed tests.
- MP2 authorization assumptions must be replaced by server-side Express
  authorization based on the authenticated actor.
- MP2 behavior must be reconciled with MP3-specific requirements, including
  `IN_TRANSIT` and closure reports, manager-controlled librarian activation,
  notification reference validation, and human approval for AI state changes.

### Prohibited direct reuse

The JavaFX UI, Java classes as runtime code, file-backed persistence, MP2
runtime setup, and MP2 security model are not the MP3 architecture and must
not be copied directly into the application.

Every reused feature must have a specification under `workflow/specs/` before
implementation. Reused material must be quantified and acknowledged in
`docs/DeveloperGuide.md`, including the MP2 source file or feature, the MP3
adaptation, and what was newly designed. The same attribution requirement
applies to reused tests or substantial code fragments.

## Boundaries

- Always: update specs before scope-changing code; validate on the server;
  enforce authorization at every route/service boundary; run tests and secret
  scans; keep dev/prod credentials separate; preserve auditable human approval
  for AI state changes.
- Ask first: changing the data model or status machine; adding a dependency;
  changing CI/CD or deployment topology; changing the LLM provider or its
  limits; removing an acceptance scenario; changing the team ownership split.
- Never: commit secrets; expose Firebase Admin or SoC LLM credentials to the
  client; trust model output as authorization; let AI directly mutate library
  state; log passwords, session identifiers, or unnecessary personal data; use
  an AI build-and-host environment for the required deployment.

## Open decisions before implementation

1. Confirm the exact SoC LLM endpoint, per-minute quota, model limits, and
   approved deployment location.
2. Resolved 2026-10-21 for order 5: overdue fines are one fixed SGD 5.00
   (`500` minor units) per active loan after 72 hours, with one alert and no
   accrual; lost-fine and waiver notifications are atomic; minimum-PII
   reservation lists, inactive-recipient retention, Cloud Scheduler worker
   limits, Jun Hong's API `v1` member ownership, and seven-day message
   idempotency are approved. The order-4 lost-book policy remains SGD 20.00
   (`2000` minor units).
3. Choose whether pending closure uses `IN_TRANSIT` or separate
   `RETURN_REPORTED` / `LOSS_REPORTED` copy statuses.
4. Confirm the first manager bootstrap method and last-manager protection.
5. Resolved: the Express API runs on Cloud Run (`libconnect`,
   `asia-southeast1`), the client is served from Firebase Hosting
   (`libconnect-78904`), Firestore is the production Firebase project, and the
   GitHub Pages product website builds from `docs/` via GitHub Actions.
   Deployment is performed through team-owned `npm run deploy:*` scripts run
   manually; CI automation of the application deploy is still open (see
   Phase 6).
6. Confirm the final package versions and the team’s branch/PR convention.

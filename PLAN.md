# LibConnect MP3 Plan

Status: approved planning baseline; implementation has not started.

## Purpose and source of truth

LibConnect MP3 is a secured, AI-infused web version of the MP2 library
management application. This plan turns the instructor brief, the refined
project overview, and the existing OpenSpec drafts into an implementation
sequence that can be reviewed before code is written.

The source-of-truth order is:

1. Instructor requirements and submission constraints.
2. [`Overview.md`](./Overview.md) for product scope and domain vocabulary.
3. OpenSpec change artifacts under `openspec/changes/` for testable behavior.
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

The module ids below are stable identifiers for future OpenSpec changes and
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

The initial borrowing period is 30 days. Fine currency is SGD. When a loss is
confirmed, the librarian enters the positive fine amount; storage records it
as integer cents. The renewal extension, overdue fine calculation, and overdue
cutoff must be recorded in the circulation spec before those policies are
implemented.

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

Apply the project-local [`ai-security-review` skill](.agents/skills/ai-security-review/SKILL.md) when designing, implementing, testing, or reviewing either role's AI feature or the agentic development workflow.

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
logs/               Verified summaries of development interactions
```

Exact package versions and commands must be established in the bootstrap task
and then recorded in the developer guide. At minimum the project must expose
working `dev`, `build`, `test`, `test:coverage`, `lint`, and `format:check`
scripts.

## Delivery phases and verification gates

### Phase 0 — Specification baseline

- Resolve the overview link/path issue and keep the overview, PlanDraft, and
  OpenSpec terminology aligned.
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
- Deploy the application through team-owned GitHub Actions; use GitHub Pages
  for the product website, not a hosted build environment supplied by an AI
  tool.
- Complete `docs/UserGuide.md`, `docs/DeveloperGuide.md`,
  `docs/Reflections.md`, `workflow/`, and verified `logs/` summaries.

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
- Every acceptance scenario in an OpenSpec file must map to at least one test
  or a documented manual verification step.

## MP2 reuse and acknowledgement

The MP2 may be reused as a domain reference and as evidence of prior design
work. Candidate reuse includes:

- entity vocabulary and relationships for books, copies, loans, reservations,
  fines, and notifications;
- user-facing library workflows and validation expectations;
- service/repository separation ideas;
- selected domain tests and edge cases, rewritten for TypeScript, Express,
  Firestore, and the MP3 state machine;
- UI content and terminology where it remains accurate.

The JavaFX UI, Java classes, file-backed persistence, and MP2 runtime setup are
not the MP3 architecture. Reused material must be quantified and acknowledged
in `docs/DeveloperGuide.md`, including the original file/feature, the MP3
adaptation, and what was newly designed.

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
2. Confirm overdue fine calculation, renewal extension, and overdue cutoff. The
   currency is SGD, and the librarian supplies the fine amount when confirming
   a loss.
3. Choose whether pending closure uses `IN_TRANSIT` or separate
   `RETURN_REPORTED` / `LOSS_REPORTED` copy statuses.
4. Confirm the first manager bootstrap method and last-manager protection.
5. Confirm the concrete hosting arrangement for the Express server, Firestore,
   scheduled expiry job, and GitHub Pages website.
6. Confirm the final package versions and the team’s branch/PR convention.

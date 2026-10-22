# FEATURE: Member–Librarian Branch Integration

**Task ID:** `member-librarian-integration`
**Status:** `0.1-approved — human approval recorded in task conversation on 2026-10-22`
**Source branches:** `jiali-librarian` at `b7270e7` and `junhong` at `8988a26`
**Target branch:** `integration`

## Summary

Integrate the completed member implementation from `junhong` with the
librarian and librarian-manager implementation already present on
`integration`/`jiali-librarian`. The result must be one coherent LibConnect
application containing both role surfaces, both bounded AI assistants, and a
single set of shared authentication, domain, storage, API, client,
configuration, and verification contracts.

This change composes and reconciles existing capabilities. It does not create
new product behavior or weaken any approved member, librarian, manager,
ownership, transaction, privacy, or AI-security requirement.

## Why this change is required

The two feature branches implement complementary parts of the product:

- `jiali-librarian` owns librarian, librarian-manager, librarian-facing
  circulation, member support, and librarian AI behavior.
- `junhong` owns the member dashboard, catalog, borrowing, reservations,
  renewals, fines, notifications, profile, and member AI behavior.

The branches share a common ancestor but independently changed central files
such as `apps/api/src/server.ts`, authentication and session handling,
repositories, workflows, shared records, client routing, styles, package
scripts, Firebase configuration, Firestore indexes, tests, and generated
`dist/` output. A direct merge therefore cannot establish a reliable final
contract without explicit reconciliation and cross-role verification.

The integration closes that gap while preserving the independently completed
feature behavior from both branches.

## Sources and approved decisions

### Sources reviewed

- `AGENTS.md`, `workflow/README.md`, and
  `workflow/agents/spec-analyst.md` for workflow and approval rules.
- `Overview.md` for product scope, roles, domain vocabulary, and AI
  boundaries.
- `PLAN.md` for architecture, capability dependencies, and delivery gates.
- Approved librarian specifications under
  `PlanDraft/Specs/LibrarianFeatures/` and their task evidence under
  `workflow/tasks/`.
- Completed member specifications under
  `PlanDraft/Specs/Member/completed/` on `junhong`.
- Current source, configuration, and tests on both source branches as evidence
  of implemented behavior.
- `workflow/tasks/librarian-reservations-fines-notifications/member-integration-contract.md`
  for the existing member-facing reservation, fine, and notification boundary.

### Decisions approved on 2026-10-22

1. The integration target is the existing `integration` branch.
2. The canonical session cookie name is `__session` so Firebase Hosting
   forwards it to the Cloud Run rewrite.
3. The canonical local Firestore emulator port is `8080`.
4. Junhong's deployment scripts, Docker configuration, Firebase Hosting
   configuration, and related documentation are retained for integration
   review. Their execution remains a separate deployment approval gate.
5. Existing `specdocs/` artifacts remain intact as historical member-task
   evidence. `PlanDraft/Specs/` remains the canonical specification tree; no
   specification is moved, deleted, or archived by this task.
6. Jiali's hardened origin validation, session-revocation worker, librarian
   authorization, and circulation transaction behavior form the integration
   baseline.
7. Junhong's `authVersion` compatibility and disabled-member authentication
   behavior are preserved and composed with the revocation worker.
8. Tracked `dist/` output is regenerated from the reconciled source after the
   source build succeeds; generated files are not manually reconciled as the
   source of truth.

## Purpose

Produce a release-candidate integration state in which member, librarian, and
manager workflows operate against one shared application and data model. The
integration must provide reproducible evidence that combining the branches did
not introduce role confusion, ownership bypasses, invalid state transitions,
session weaknesses, AI privilege escalation, or regressions in either branch.

## Capability map

| Module ID | Responsibility | Depends on |
|---|---|---|
| `branch-baseline` | Combine source, configuration, documentation, tests, and retained deployment artifacts | — |
| `identity-session` | Reconcile authentication, account status, password changes, session versions, and revocation | `branch-baseline` |
| `domain-storage` | Unite shared records, repositories, workflows, seed data, and indexes | `identity-session` |
| `api-composition` | Compose member, librarian, manager, catalog, circulation, notification, and AI routes | `domain-storage` |
| `client-composition` | Compose role routing, dashboards, pages, navigation, API clients, providers, and styles | `api-composition` |
| `verification-evidence` | Run cross-role regression, emulator, security, build, and configuration checks | all modules |

Build order: `branch-baseline` → `identity-session` → `domain-storage` →
`api-composition` → `client-composition` → `verification-evidence`.

## Product specification

### Actors and retained capabilities

#### Member

An active member can:

- register and authenticate;
- browse and search the catalog and view book/copy availability;
- borrow eligible copies;
- create and cancel eligible reservations;
- view and renew eligible loans;
- report an active loan as returned or lost;
- view and pay eligible fines;
- view and mark owned notifications as read;
- view and update the permitted profile fields and password; and
- use the bounded, read-only member assistant.

#### Librarian

An active librarian can:

- manage books and physical copies;
- create loans and review return/loss reports;
- manage reservations, fines, and in-app notifications;
- list members, view safe member details, and change member account status;
- use the bounded librarian review and notification-drafting assistant; and
- access ordinary librarian functions regardless of manager status.

#### Manager

An active librarian with `isManager: true` can additionally:

- list librarian accounts;
- activate or deactivate eligible librarian accounts, subject to last-manager
  protection; and
- reset another eligible librarian's password and revoke the target's
  sessions.

### Product invariants

1. Member and librarian functionality must coexist without one role acquiring
   another role's access.
2. Member ownership, librarian role, and manager privilege are established
   from the authenticated server actor, never request fields.
3. Existing state transitions and transactional side effects remain the
   authority for loans, copies, reservations, fines, notifications, and
   account status.
4. Both AI assistants remain advisory. Model output cannot authorize or
   directly perform an application write.
5. No new product capability is intended. Any discovered requirement change
   must return to specification review before production code changes.

### User-visible failure behavior

- Signed-out requests return the existing unauthenticated response.
- Inactive or revoked accounts cannot restore or use protected sessions.
- Cross-role and cross-member requests are denied without leaking protected
  data.
- Invalid, stale, repeated, or conflicting state transitions return the
  existing bounded validation or conflict response without partial writes.
- AI configuration, timeout, provider, rate-limit, or output-validation
  failures disable only the affected assistant request and return a bounded
  safe error.
- Missing indexes or configuration fail visibly during verification; they are
  not bypassed by weakening queries or tests.

## Technical specification

### Branch and source integration

- Integrate `junhong` into `integration`, whose starting state matches
  `jiali-librarian` at `b7270e7`.
- Resolve source conflicts semantically against the approved specifications;
  neither branch wins a shared file merely because it is the merge base or
  current target.
- Preserve branch-specific source files unless they conflict with an approved
  shared contract.
- Reconcile shared files before regenerating `dist/`.
- Preserve factual logs and task evidence from both branches. Do not rewrite
  or remove evidence to make the merge appear clean.

### Authentication and session contract

The integrated server must:

- configure the session cookie as `__session` with the existing
  `httpOnly`, `sameSite`, environment-appropriate `secure`, path, and bounded
  lifetime settings;
- preserve strict `CLIENT_ORIGIN` validation and production `API_ORIGIN` HTTPS
  validation;
- store `userId`, `accountType`, and non-negative `authVersion` in
  authenticated server sessions;
- treat legacy users and sessions without `authVersion` as version `0`;
- reject sessions whose user no longer exists, is inactive, has a mismatched
  account type, or has a mismatched authorization version;
- preserve targeted session deletion and the bounded revocation-job worker;
- increment and validate `authVersion` for member password changes while
  retaining the current authenticated session according to the approved member
  profile behavior;
- revoke target sessions after librarian password reset or account
  deactivation; and
- omit passwords, password hashes, session IDs, `authVersion`, and internal
  session metadata from client responses and logs.

The disabled-member login response may remain distinct from generic invalid
credentials as approved by the member implementation, but it must not reveal
whether arbitrary unknown email addresses exist. Inactive-librarian handling
must preserve the approved librarian authentication behavior.

### Domain model and compatibility

The final `packages/shared/src/domain/records.ts` contract must be a compatible
union of the two branches and include:

- member and librarian account fields, including optional manager capability
  and backward-compatible `authVersion`;
- all approved copy, loan, closure-report, reservation, fine, and notification
  states and references;
- strict timestamp and identifier validation; and
- compatibility defaults only where already approved, without accepting
  client-controlled authorization fields.

Any schema incompatibility discovered during integration is a specification
issue. It must not be resolved by silently dropping a field, weakening
validation, or rewriting production data.

### Repositories, workflows, and transactions

The final repositories and workflows must compose both branch behaviors:

- bounded catalog reads and librarian catalog mutations;
- member-owned loan, reservation, fine, notification, and profile operations;
- librarian loan creation and closure review;
- reservation assignment/expiry, fine issuance/payment/waiver, and
  notification creation/read behavior;
- librarian member-support and manager account operations;
- retry-safe idempotency and scheduled worker behavior; and
- server-owned policy values and generated identifiers.

Linked state changes must retain their existing Firestore transaction
boundaries. Integration must not replace a transactional workflow with a
sequence of independent writes.

### API composition

`apps/api/src/server.ts` must instantiate one shared set of repositories and
workflows, then mount:

- authentication routes;
- shared catalog routes;
- member borrow, reservation, loan, fine, notification, profile, and assistant
  routes;
- librarian catalog, circulation, reservations/fines, member-support, and
  assistant routes; and
- manager account-administration routes.

The shared active-actor middleware must protect all non-authentication
business routes. Route-specific member, librarian, manager, ownership, strict
schema, and safe-DTO controls remain required behind that boundary.

### AI integration

- Preserve separate member and librarian assistant route and service
  contracts.
- Keep provider credentials and model selection server-side.
- Reconcile shared provider code without broadening either assistant's data
  access or tool permissions.
- Preserve request/output limits, timeouts, retries, circuit behavior,
  rate limits, plain-text/structured validation, privacy minimization, and safe
  failure handling.
- Member assistant context is restricted to public catalog/rules and the
  authenticated member's permitted records.
- Librarian assistant context is restricted to approved pending-report and
  drafting facts.
- Neither assistant may create, send, approve, or authorize a state change.

### Client composition

The final React application must:

- retain shared login, registration, session restoration, and protected-route
  behavior;
- redirect members and librarians to their role-specific dashboards;
- include every approved member, librarian, and manager route;
- show member navigation and the member assistant only in the member surface;
- show librarian navigation and the librarian assistant only in the librarian
  surface;
- expose manager navigation only when the authenticated server summary has
  `isManager: true`;
- preserve accessible loading, empty, error, validation, confirmation,
  conflict, and success states; and
- use API clients only, with no browser import of Firebase Admin or direct
  application-collection writes.

### Configuration and indexes

- Use `127.0.0.1:8080` as the canonical local Firestore emulator endpoint and
  update scripts, tests, and documentation consistently.
- Merge and deduplicate `package.json` scripts so the unified build, full
  regression, coverage, focused emulator, browser, and deployment-review
  commands remain available.
- Retain Junhong's Playwright development dependency only because the approved
  member browser verification requires it; no other dependency addition is
  authorized by this specification.
- Union and deduplicate `firestore.indexes.json` entries. Every retained index
  must correspond to an implemented bounded query or approved worker.
- Preserve Firebase Hosting, Docker, and deployment scripts for review, using
  the canonical integrated ports, paths, and API routing. Do not execute them
  under this task.
- Preserve the deny-by-default browser Firestore boundary.

### Documentation and evidence

- Preserve both developers' existing feature documentation, reflections,
  specifications, logs, handoffs, implementation reports, security reviews,
  and review reports.
- Update integration-facing setup and verification documentation only through
  a later approved implementation checklist.
- Record the exact source commits, resolved conflicts, changed shared
  contracts, files changed, commands run, results, and unresolved risks in
  `workflow/tasks/member-librarian-integration/` and
  `logs/member-librarian-integration/` during implementation.

## Integration flows

### Session restoration

1. The browser sends the `__session` cookie.
2. The server restores the hashed session record from Firestore.
3. Active-actor middleware loads the user record by server-held `userId`.
4. The server verifies account status, account type, and `authVersion`.
5. The route applies member ownership, librarian role, or manager privilege as
   applicable.
6. Any failed check rejects the request and clears or invalidates the session
   where required.

### Member-to-librarian circulation

1. A member borrows, reserves, renews, or reports a loan through member routes.
2. The server derives member ownership and performs the approved transactional
   state change.
3. A pending return/loss report appears in the librarian queue.
4. A librarian confirms or rejects the report through the approved review
   workflow.
5. The transaction updates loan/copy state and, where applicable, reservation,
   fine, and notification records atomically or retry-safely as specified.
6. The member sees the resulting state only through member-owned reads.

### AI requests

1. Active-actor and role/ownership checks run before context retrieval.
2. The server gathers only allowlisted context.
3. Untrusted questions, catalog text, notifications, and stored content are
   treated as data rather than instructions.
4. The server calls the configured SoC LLM through the bounded adapter.
5. The response is validated and returned as advisory content.
6. Any later application mutation requires the ordinary authorized UI and
   service path with explicit human confirmation.

## Acceptance criteria

### Composition

1. The integration branch contains all approved member, librarian, manager,
   and role-specific AI source files from the source branches.
2. Shared files contain a coherent union of behavior with no unresolved merge
   markers or silently discarded branch capability.
3. `dist/` is regenerated successfully from reconciled source.

### Authentication and authorization

4. Member, librarian, and manager login/session restoration succeeds for
   active accounts using `__session`.
5. Legacy versionless user/session records behave as version `0`.
6. Password changes, password resets, and deactivations invalidate or update
   sessions according to the approved role-specific contract.
7. Signed-out, inactive, wrong-role, non-manager, forged-role, and stale
   session requests are denied.
8. Members cannot access another member's loans, reservations, fines,
   notifications, profile, or assistant context.

### Functional integration

9. Member catalog, borrow, reservation, renewal, return/loss report, fine,
   notification, profile, dashboard, and assistant scenarios pass.
10. Librarian catalog, inventory, loan creation/review, reservation/fine,
    notification, member-support, dashboard, and assistant scenarios pass.
11. Manager listing, status-change, last-manager protection, and password-reset
    scenarios pass.
12. Member-generated circulation state is visible and actionable through the
    corresponding librarian workflow without data-shape conversion errors.
13. Librarian-generated fines, reservation updates, and notifications are
    visible through the owning member's routes and UI.

### Storage and reliability

14. Shared state transitions remain transactional and retry-safe under the
    existing concurrent and repeated-request test cases.
15. The final Firestore index manifest covers every query exercised by both
    branches and contains no conflicting duplicate definitions.
16. The unified seed data parses against the final shared schemas and supports
    both role surfaces.
17. The revocation worker, reservation-expiry worker, and overdue processing
    retain bounded retries, deadlines, idempotency, and sanitized failure logs.

### AI and security

18. Both assistants pass role isolation, ownership isolation, prompt-injection,
    output-validation, provider-failure, timeout, retry, circuit, rate-limit,
    and data-minimization tests.
19. No assistant endpoint can directly change library state or authorize a
    later state change.
20. No password material, raw session identifier, credential, provider secret,
    raw prompt/response, or unnecessary personal data is added to source,
    fixtures, logs, or generated evidence.
21. Browser code contains no direct Firestore application-data write path.

### Verification and evidence

22. `npm run build`, `npm run lint`, `npm run format:check`, and `npm test`
    pass on the integrated source.
23. All applicable member and librarian Firestore emulator suites pass using
    port `8080` and the `demo-libconnect` project.
24. Browser verification required by the retained member tests passes.
25. The integration implementation report records reproducible commands,
    results, conflict decisions, and residual risks.
26. An independent reviewer verifies the exact integration result from a
    separate worktree or clean checkout before the human merge decision.

## Test matrix

| ID | Level | Required evidence |
|---|---|---|
| T-1 | Build | TypeScript and Vite production build pass; `dist/` matches source |
| T-2 | Static | Type checking, whitespace/format, merge-marker, secret-shape, and direct-client-Firestore checks pass |
| T-3 | Auth unit/route | Active/inactive/disabled, role, manager, cookie, `authVersion`, legacy, logout, password-change/reset, and revocation cases pass |
| T-4 | Member route/storage | Ownership, strict-body, stale/repeated request, and member workflow suites pass |
| T-5 | Librarian/manager route/storage | Role, privilege, safe DTO, status transition, and concurrency suites pass |
| T-6 | Cross-role integration | Member-created circulation records flow through librarian review and back to member-visible results |
| T-7 | Firestore emulator | Catalog, sessions, accounts, loans, reservations, fines, notifications, workers, and indexes pass on the unified schema |
| T-8 | Client | Protected routes, navigation, dialogs, loading/error states, accessibility contracts, and browser workflows pass |
| T-9 | AI/security | Both assistants pass isolation, injection, privacy, bounded-output, provider-failure, and no-write tests |
| T-10 | Deployment review | Docker/Firebase/hosting/deploy configuration parses and points at the integrated build without executing a deployment |
| T-11 | Full regression | Unified `npm test` passes after all focused and emulator checks |
| T-12 | Independent review | Reviewer confirms acceptance criteria against the exact integration commit or immutable working-tree snapshot |

## Verification commands

The implementation checklist must preserve or normalize the exact scripts
needed to run at least:

```text
npm run build
npm run lint
npm run format:check
npm test
npm run test:coverage
```

It must also run every applicable retained `test:*:emulator`,
`verify:*:emulator`, and browser verification command against the unified
configuration. Production deployment commands are review-only and must not be
executed without separate human approval.

## Boundaries

### Always

- Preserve approved behavior from both source branches.
- Resolve conflicts using canonical specifications and server-side security
  invariants.
- Add or update integration tests for every reconciled shared contract.
- Keep actor identity, role, ownership, manager privilege, and state decisions
  in trusted server code.
- Record implementation and review evidence without secrets.

### Ask first

- Change a product requirement, role policy, data model, state machine, or
  error contract.
- Add or remove a dependency beyond retaining the approved Playwright
  dependency.
- Change CI, production hosting topology, credentials, index deployment, or
  migration policy.
- Delete, move, or archive specifications, evidence, or branch history.
- Commit, push, create or merge a pull request, deploy, or publish.

### Never

- Resolve a conflict by weakening an authorization or security test.
- Trust client-provided role, manager, owner, member, recipient, or state
  fields for authorization.
- Let AI output authorize a write or bypass normal service validation.
- Commit secrets, raw sessions, password material, or unnecessary personal
  data.
- Rewrite evidence to hide a failure or unresolved risk.

## Out of scope

- New member, librarian, manager, or AI product features.
- Changes to approved borrowing, reservation, renewal, fine, notification,
  account, or AI policies.
- Production data migration unless a newly discovered schema incompatibility
  is separately specified and approved.
- Deployment, production index creation, scheduler provisioning, service
  identity creation, secret provisioning, or release.
- Branch-history rewriting, source-branch deletion, specification archival,
  or evidence deletion.
- Commit, push, pull-request, merge, or public communication actions.

## Risks and tradeoffs

- Shared storage and workflow files require semantic reconciliation; an
  automatic conflict resolution could preserve compilation while losing a
  transaction or authorization rule.
- Composing `authVersion` with asynchronous revocation adds complexity but
  preserves immediate request-time invalidation and durable cleanup behavior.
- Retaining one cookie name invalidates cookies created by the other branch's
  local build; this is acceptable before release and must be documented for
  testers.
- Unifying on emulator port `8080` requires Junhong's scripts and tests to be
  updated consistently.
- Combining both index manifests may retain redundant indexes. Deduplication
  must be based on implemented query shapes, not deletion for convenience.
- Both assistants share provider infrastructure but have different context and
  policy boundaries; over-generalizing the adapter could create cross-role
  leakage.
- Tracked generated output increases merge noise. Source and successful build
  evidence remain authoritative.
- Existing branch-level passing tests do not prove integrated correctness;
  cross-role, shared-schema, and emulator verification are mandatory.

## Open decisions

None. The integration target, emulator port, deployment-artifact retention,
canonical specification tree, compatibility behavior, and generated output
strategy were approved by the human on 2026-10-22. The cookie name was amended
to `__session` with human approval on 2026-10-23.

## amendments

- 2026-10-23 — Changed the canonical session cookie name from `libconnect.sid`
  to `__session` so Firebase Hosting forwards the cookie on requests rewritten
  to Cloud Run. Preserved the existing session contents, authorization checks,
  cookie security attributes, and lifetime requirements. Approved by the human
  on 2026-10-23.

## Approval and next gate

This specification was approved by the human on 2026-10-22. It authorizes
creation of this specification document only. The next workflow stage is a
separately reviewed acceptance-based checklist and analyst handoff under
`workflow/tasks/member-librarian-integration/` using the repository's
`sdd-propose` procedure. Implementation, commit, merge, push, deployment, and
release remain unapproved.

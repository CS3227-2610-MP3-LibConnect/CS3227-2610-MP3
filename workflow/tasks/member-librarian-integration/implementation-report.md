# Implementation Report: member-librarian-integration

## Inputs and authority

- Specification: `PlanDraft/Specs/Integration/MemberLibrarianBranchIntegration.md`
  (`0.1-approved`).
- Checklist: `workflow/tasks/member-librarian-integration/tasks.md`
  (`0.1-approved`).
- Handoff: `workflow/tasks/member-librarian-integration/handoff.md`
  (`APPROVED` by the human on 2026-10-22).
- Source revisions: `integration`/`jiali-librarian` at
  `b7270e76b29b0bbddf0f71bccec7aa5f62adb1a5`; `junhong` at
  `8988a26f008c58f295c9461e3c267074741b222a`; common ancestor
  `c91b417b4340499e72ac590ea29fd7f77a8b9e17`.
- Human authority: implementation of Tasks 2–10 was explicitly authorized on
  2026-10-22. Task 11 independent review, commit, push, pull request, merge,
  deployment, index creation, scheduler provisioning, and release were not
  authorized.
- Skills used: repository-local `sdd-apply` and `ai-security-review`.
- Result identity: an uncommitted, staged merge snapshot on `integration` with
  `MERGE_HEAD` at the approved `junhong` revision. No commit was created.

## Preflight and merge baseline

- The specification, checklist, and handoff agreed on the exact revisions,
  `libconnect.sid`, Firestore `127.0.0.1:8080`/`demo-libconnect`, preservation
  of deployment-review files and historical `specdocs/`, legacy
  `authVersion: 0`, the hardened librarian baseline, and regenerated `dist/`.
- The original tree contained only the approved untracked integration spec and
  task artifacts; no unrelated user changes were present.
- The target changed 260 paths from the common ancestor, `junhong` changed 332,
  and 45 paths overlapped. Sixteen overlaps were authored shared paths and the
  remainder generated `dist/` output.
- A no-commit merge of `junhong` into `integration` established the combined
  tree. Role-specific source, tests, documentation, reflections,
  deployment-review files, and historical specifications were retained.
- The current `AGENTS.md` remained authoritative. Incoming `.agents/`,
  `.codex/`, and `.gitignore` changes were outside the approved implementation
  scope and excluded. Original root tests and `specdocs/` paths were retained
  beside Junhong's grouped/completed copies.
- Shared source was reconciled semantically under Tasks 3–8. Generated files
  were regenerated only after source verification. No unresolved Git path or
  merge marker remains.

## Implemented changes

### Task 3 — Identity and sessions

- Standardized active code, tests, and integration-facing documentation on
  `libconnect.sid` while preserving strict origin and production API-origin
  validation.
- Combined account/session `authVersion` compatibility with bounded session
  revocation. Versionless legacy records normalize to zero; new records start
  at zero; active-actor restoration denies missing users, inactive accounts,
  wrong types, and version mismatches.
- Member password changes atomically advance the account and approved current
  session. Librarian resets and member/librarian deactivations advance the
  account before bounded deletion/queued cleanup.
- Safe account values strip password hashes and internal version metadata.

### Task 4 — Shared storage and domain behavior

- Unified member, librarian, manager, catalog, copy, loan, closure,
  reservation, fine, notification, timestamp, identifier, and account schemas
  in `packages/shared/src/domain/records.ts`.
- Combined repository APIs and all member/librarian transaction workflows,
  including member renewal, reservation, borrow capacity/eligibility, and
  borrow confirmation. Active/member guards reject absent and whitespace IDs.
- Unified Firestore indexes by implemented member and librarian query shape.
- Updated seed data to parse active member and librarian records, create
  identity keys, use a generated Argon2 credential hash without logging the
  credential, and create coherent copy/loan/closure relationships.
- Corrected signed catalog cursor binding so publication-year range filters are
  included in the filter identity.

### Task 5 — Protected API composition

- `apps/api/src/server.ts` now creates one shared repository/workflow graph and
  mounts all member, librarian, manager, circulation, profile, notification,
  catalog, authentication, and assistant routes.
- Business routes continue through active-actor enforcement. Member ownership,
  librarian role, and manager privilege are derived from current server state;
  client-supplied authority fields are not trusted.
- Strict bodies, safe DTOs, bounded error behavior, and cross-role workflow
  visibility are retained.

### Task 6 — AI assistants

- Reconciled the shared SoCLaaS adapter while preserving the hardened
  librarian client and the bounded member client factory.
- Member and librarian services retain separate context retrieval, limits,
  typed validation, rate limits, timeout/retry/circuit handling, and safe
  provider errors.
- Stored and retrieved text remains untrusted data. Neither assistant receives
  write tools or authority over account, circulation, reservation, fine,
  notification, repository, or external actions.

### Task 7 — Role-specific client

- Composed member pages, navigation, dialogs, typed clients, profile hub, and
  assistant with the existing librarian/manager application and shared session
  restoration.
- The dashboard and protected routes select the server-reported role and
  manager flag. Member and librarian assistant/navigation surfaces remain
  separate.
- Combined both style sets and fixed the missing React Router `Link` import and
  duplicate catalog `getBook` client definition.
- Browser source has no Firebase Admin import or direct application-collection
  access.

### Task 8 — Scripts and configuration

- Unified build, lint, format, regression, coverage, focused emulator, browser,
  seed, start, and deployment-review scripts in `package.json`.
- Retained Playwright and installed its local Chromium runtime for the approved
  browser checks. `npm install` updated the lockfile and reported eight moderate
  dependency-audit findings; no automated audit fix or unapproved dependency
  was introduced.
- Standardized active Firebase, tests, scripts, and documentation on
  `127.0.0.1:8080` and `demo-libconnect`. Firestore browser access remains
  deny-by-default.
- Docker, Firebase Hosting, and deployment scripts were retained for review but
  not executed.

### Tasks 9–10 — Integrated verification and release-candidate evidence

- Retained and ran both role suites plus cross-role authentication, catalog,
  circulation, manager, storage, AI, client, emulator, and browser coverage.
- Updated a browser test to assert a post-conflict read relative to its baseline
  instead of depending on development-only React StrictMode double mounting.
- Updated two catalog tests to exercise the approved signed-cursor contract
  with a test-only secret of sufficient length; no secret value is recorded in
  evidence.
- Rebuilt all tracked `dist/` output from the reconciled source.
- Updated the README and active feature documentation for the unified roles,
  canonical cookie/port, verification workflow, and review-only deployment
  boundary.

## Changed-file groups

| Group | Main paths | Purpose |
|---|---|---|
| Domain/storage | `packages/shared/src/domain/records.ts`, `apps/api/src/storage/`, `firestore.indexes.json` | Compatible records, repositories, transactions, seed, and query indexes. |
| Identity/API | `apps/api/src/http/`, `apps/api/src/routes/`, `apps/api/src/server.ts` | Unified sessions, active actors, routes, roles, ownership, and safe DTOs. |
| AI | `apps/api/src/assistant/`, `apps/api/src/ai/`, `apps/api/src/integrations/soclaas/` | Separate bounded member/librarian assistants over shared provider infrastructure. |
| Client | `apps/client/src/` | Member/librarian/manager routes, pages, navigation, assistants, API clients, and styles. |
| Configuration | `package.json`, `package-lock.json`, `firebase.json`, `firestore.indexes.json`, `Dockerfile`, `.dockerignore`, `scripts/`, `vite.config.ts` | Unified local/review commands and retained deployment artifacts. |
| Tests | `tests/` and grouped member test directories | Retained branch tests, cross-role coverage, emulator checks, and browser checks. |
| Generated output | `dist/` | Clean output rebuilt from integrated source. |
| Documentation/evidence | `README.md`, `docs/feature-details/`, `PlanDraft/`, `specdocs/`, `workflow/tasks/member-librarian-integration/`, `logs/member-librarian-integration/` | Unified setup/behavior documentation, preserved history, and implementation evidence. |

## Verification results

| Check | Result | Evidence |
|---|---|---|
| Focused auth/routes | Pass | 56/56 tests. |
| Focused storage/session | Pass | 18/18 tests. |
| Member/librarian AI | Pass | 51/51 tests, including injection, isolation, malformed output, no-write, failure, timeout, retry, circuit, and rate-limit cases. |
| Unified role routes | Pass | 128/128 member, librarian, and manager route tests. |
| Browser-focused tests | Pass | 11/11 after the robust baseline-relative read assertion. |
| `npm test` | Pass | 447/447 tests; zero failures. |
| `npm run test:coverage` | Pass | 447/447; 65.51% lines, 79.58% branches, 62.72% functions; configured gates are 50/70/45. |
| Firestore emulator checks | Pass | Catalog repository; circulation negative/workflow; manager concurrency; member account; reservations/fines; auth; catalog acceptance/year range; borrow eligibility/confirmation; fines; loan closure; notifications; profile; renewal; reservation create/cancel/list indexes. All used port 8080. |
| `npm run build` | Pass | TypeScript and Vite build completed; 87 client modules transformed. |
| `npm run lint` | Pass | TypeScript no-emit check completed. |
| `npm run format:check` and staged whitespace check | Pass | No whitespace errors in the final staged snapshot. |
| Static boundary scans | Pass | No merge markers; no active `8081`/`__session`; no client Firebase Admin/direct collection access; configuration JSON parses. |
| Deployment commands | Not run | Explicitly outside implementation authority. |

The factual command history, including non-passing attempts and their fixes, is
in `logs/member-librarian-integration/implementation-2026-10-22.md`.

## Corrected failures

- A sandboxed focused route batch could not open local listeners; it was
  interrupted and rerun with narrow approved permission.
- The initial full suite had two unsigned-cursor test calls inconsistent with
  the hardened signed-cursor contract. The tests were corrected; the product
  security contract was not weakened.
- Initial browser verification exposed one assertion coupled to StrictMode's
  development-only double render. It now proves a new read occurred after the
  conflict relative to the observed baseline.
- The year-range emulator verifier exposed a real cursor filter-binding gap.
  `publicationYearFrom` and `publicationYearTo` were added to the signed filter
  identity and the full relevant suite reran successfully.
- The first API-dependent auth emulator attempt had no API process and is not
  counted. The corrected integrated auth verifier ran with the API and passed.
- A staged whitespace check initially reported trailing/EOF whitespace inherited
  from incoming files. The working files were corrected, staged, and the check
  rerun successfully.

## Security and behavior conclusions

- Authentication, role, manager privilege, ownership, and state transitions are
  enforced in server code using current stored state.
- Member-created circulation records interoperate with librarian return/loss,
  reservation, fine, notification, and worker workflows, with owning-member
  visibility enforced.
- Sensitive password/session/version/provider data is excluded from responses,
  client bundles, logs, and task evidence.
- Both AI assistants are advisory-only and role-isolated; model output cannot
  authorize protected writes or repository/external actions.
- Firestore browser rules remain deny-by-default, and the React client has no
  direct application-data access.

## Deviations and residual risks

- Approved specification deviations: None.
- Open design decisions: None.
- Residual dependency risk: `npm install` reported eight moderate audit
  findings. They require separate dependency/security triage; no potentially
  breaking automated remediation was authorized or attempted.
- Workflow risk: The result is an uncommitted staged merge snapshot. Independent
  review must identify and inspect this exact snapshot from a separate clean
  checkout/worktree or record an approved equivalent. A commit remains a
  separate human approval gate.
- External/runtime risk: No live provider, production Firebase, deployment,
  index creation, scheduler provisioning, push, or release action was run.

## Current gate

Tasks 1–10 are complete. Work is stopped before Task 11. The next action is an
independent review of the exact staged integration snapshot, which requires
explicit human authorization. Final merge approval remains human-owned.

## Review remediation — 2026-10-22

The human authorized remediation of independent-review Findings 1–2 under the
canonical all-or-none member checkout specification and authorized a fresh
Task 11 review. The original failed review is preserved unchanged.

- `confirmMemberBorrow` now validates the complete batch and the combined
  `ACTIVE` plus `PENDING_CLOSE` open-loan count in one Firestore transaction.
  Any invalid copy, stale state, or capacity violation aborts before all
  writes; a successful request creates every loan and updates every copy.
- Capacity, API, client, assistant, documentation, generated output, and test
  contracts now use the canonical open-loan definition and one success or one
  error for the complete batch. Historical lower-priority `specdocs` copies
  contain a dated superseding amendment; the failed-review history remains.
- Unit and API tests cover mixed stale batches, over-capacity batches,
  `PENDING_CLOSE`, replay, successful multi-copy commits, and concurrent final
  capacity. Firestore emulator checks independently exercised eligibility,
  conflict races, zero-write rejection, and complete commits.

Remediation verification passed: `npm run build`; `npm run lint`;
`npm run format:check`; `npm test` (450/450); `npm run test:coverage`
(450/450, 65.62% lines, 79.76% branches, 63.22% functions); and
`npm run verify:member-borrow:emulator`. JSON parsing and conflict-marker and
stale-contract scans also passed. The first emulator-launch attempt did not
start because `npx` encountered a user-cache permission error; a second launch
found port 8080 already occupied. The acceptance scripts then connected to the
existing local emulator and passed. Neither failed launch is counted as a
verification pass.

Task 11 remains reviewer-owned and incomplete until the fresh independent
review examines the exact remediated snapshot. No commit, push, merge,
deployment, index creation, scheduler provisioning, or release occurred.

## Independent re-review — 2026-10-23

The required fresh independent Task 11 review has now run against commit
`a016fd3` on `integration` (which includes this remediation plus the `junhong`
merge and one unrelated `local-manager-bootstrap` commit). Full detail is in
`review-report.md`'s "Re-review addendum — 2026-10-23" and
`security-review.md`'s "Independent re-review — 2026-10-23". Result: `PASS
WITH RESIDUAL RISK`. Findings 1 and 2 are confirmed resolved; one new MEDIUM
finding (Finding 3) was identified — `tests/emulator/verify-member-reservation-storage-emulator.mjs`
was not updated for the corrected `confirmMemberBorrow` return contract and
failed on a stale assertion, with no production impact.

Human approved the Finding 3 fix. The assertion was corrected to check the
array shape and content `confirmMemberBorrow` actually returns;
`npm run verify:member-reservations:emulator` now passes cleanly, and the
full suite was re-confirmed at 453/453. `review-report.md` and
`security-review.md` record Finding 3 as resolved. No further follow-up
task remains open for this task; human merge approval is still required and
was not granted by any review in this history.

## Firebase Hosting session cookie amendment — 2026-10-23

Following the human-approved specification and checklist amendments, the API
now uses the Firebase Hosting forwarded cookie name `__session`. The Express
session middleware and auth logout/clear-cookie path share the exported
`sessionCookieName` constant. Auth route and emulator test fixtures, plus the
authentication and deployment guides, now expect/document `__session`. Existing
`libconnect.sid` browser cookies are not migrated; users must sign in again.

TypeScript lint (`npm run lint`) and scoped whitespace checks passed. Tests were
not run. Existing dirty generated `dist/` artifacts were preserved and not
regenerated. No deployment or external action was performed.

## Cloud Run proxy verification follow-up — 2026-10-23

Restored `app.set('trust proxy', 1)` before Express session middleware so the
production API recognizes Cloud Run's forwarded HTTPS scheme and can emit its
Secure session cookie. Auth-route test fixtures now simulate that proxy path
with a Secure `__session` cookie and verify cookie issuance. The first targeted
test run caught one stale clear-cookie assertion; that assertion was updated,
and the rerun passed 16/16 tests. The client auth suite passed 6/6. `npm run
lint` and scoped `git diff --check` passed. The Firestore auth emulator and live
Cloud Run revision were not verified. Generated `dist/` changes remain
untouched; no deployment occurred.

# Task Checklist: member-librarian-integration

## Inputs

- Approved specification path and version:
  `PlanDraft/Specs/Integration/MemberLibrarianBranchIntegration.md`
  (`0.1-approved`)
- Specification approval record: Human approval recorded in the task
  conversation on 2026-10-22; all specification decisions were approved.
- Source revisions: `jiali-librarian`/`integration` at `b7270e7` and `junhong`
  at `8988a26`.
- Target branch: `integration`.
- Task checklist status: `APPROVED`
- Task checklist approver (human only): Human user, explicit approval in the
  task conversation.
- Task checklist approval date: 2026-10-22.

## Repository grounding

- The server composes trusted routes, repositories, workflows, and active-actor
  enforcement in `apps/api/src/server.ts`; authorization remains server-side.
- Shared persisted records and parsers live in
  `packages/shared/src/domain/records.ts`; Firestore access and transactional
  state changes live under `apps/api/src/storage/`.
- The React application composes protected role routes in
  `apps/client/src/App.tsx`, with typed HTTP clients under
  `apps/client/src/api/`; browser code must not write application collections.
- Existing librarian tests are rooted under `tests/`. The member branch adds
  grouped suites under `tests/shared/`, `tests/member-api/`,
  `tests/member-storage/`, `tests/client/`, and `tests/emulator/`.
- The unified project retains tracked generated `dist/` output, Firestore
  configuration in `firebase.json` and `firestore.indexes.json`, and scripts in
  `package.json`; source is reconciled before generated output is rebuilt.
- Workflow evidence belongs under
  `workflow/tasks/member-librarian-integration/` and factual execution logs
  under `logs/member-librarian-integration/`.

## Ordered implementation tasks

- [x] **1. Perform the SDD apply preflight and freeze the integration baseline**
  — Read the approved specification, this checklist, the approved handoff, both
  source revisions, and the branch-level evidence before changing source.
  Record the common ancestor, exact source commits, dirty-worktree state,
  conflict inventory, generated-file policy, and allowed implementation paths.
  - Acceptance criteria: The implementer confirms the specification, checklist,
    and handoff agree; the target is `integration`; source revisions are
    `b7270e7` and `8988a26`; shared conflicts and branch-only files are recorded;
    no requirement, schema, authorization, dependency, deployment, or evidence
    deletion decision is guessed; no production edit occurs before preflight is
    complete.
  - Verification: `git status --short --branch`, `git merge-base integration
    junhong`, branch/file diff inspection, and an implementation-report preflight
    entry.
  - References: Specification §§ Sources and approved decisions, Capability
    map, Branch and source integration, Boundaries; `AGENTS.md`;
    `workflow/README.md`; `workflow/agents/implementer.md`.
  - Dependencies: None.

- [x] **2. Establish the combined branch baseline without discarding evidence**
  — Integrate the `junhong` tree into `integration`, preserve branch-specific
  member and librarian files and historical artifacts, and defer semantic shared
  contracts to the tasks below instead of accepting either side wholesale.
  - Acceptance criteria: All approved role-specific source, tests,
    documentation, deployment-review files, and historical `specdocs/` evidence
    are present; no merge marker remains; every overlapping shared file has a
    recorded resolution owner; tracked `dist/` files are not used to decide
    source behavior and are left for regeneration after source verification.
  - Verification: Compare the integrated file inventory with both source
    revisions; scan for unresolved merge markers; record every conflict and its
    governing specification in the implementation report.
  - References: Acceptance criteria 1–3 and 20; T-1, T-2, T-10;
    specification §§ Branch and source integration, Documentation and evidence,
    Out of scope.
  - Dependencies: Task 1.

- [x] **3. Reconcile identity, account, origin, and session behavior** — Compose
  the hardened origin/session-revocation baseline with member `authVersion`,
  disabled-member behavior, profile password changes, and librarian/manager
  reset and deactivation semantics.
  - Acceptance criteria: The cookie is `libconnect.sid` with the approved
    attributes; active-actor checks reject missing, inactive, wrong-type, stale,
    and missing-user sessions; versionless users/sessions normalize to version
    `0`; member password changes preserve only the approved current session;
    target reset/deactivation revokes sessions; strict origin checks remain;
    client responses and logs omit password material, raw sessions,
    `authVersion`, and internal metadata.
  - Verification: Unified auth, active-actor, origin, legacy-version,
    password-change/reset, deactivation, revocation-worker, forged-role, and
    no-JavaScript route tests, plus the auth emulator suite.
  - References: Acceptance criteria 4–8 and 20; T-3;
    `apps/api/src/http/auth.ts`, `apps/api/src/routes/auth.ts`,
    `apps/api/src/storage/accounts.ts`,
    `apps/api/src/storage/firestore-session-store.ts`,
    `apps/client/src/auth/`.
  - Dependencies: Task 2.

- [x] **4. Unite shared records, repositories, workflows, seed data, and indexes**
  — Build the compatible member/librarian domain union and compose all bounded
  repository and transactional workflow behavior against one Firestore schema.
  - Acceptance criteria: Shared records retain approved account, manager,
    `authVersion`, copy, loan, closure-report, reservation, fine, notification,
    timestamp, and identifier contracts; member ownership and server-owned
    fields cannot be supplied as authority; catalog, circulation, member
    support, manager, reservation, fine, notification, and worker paths retain
    transaction/idempotency boundaries; the unified seed parses and supports
    both roles; indexes are deduplicated by implemented query shape without
    weakening a query or test.
  - Verification: Shared parser/DTO tests, repository and workflow unit tests,
    seed parse/load checks, index-manifest assertions, and applicable Firestore
    concurrency and repeated-request suites.
  - References: Acceptance criteria 12–17; T-4, T-5, T-7;
    `packages/shared/src/domain/records.ts`, `apps/api/src/storage/`,
    `firestore.indexes.json`.
  - Dependencies: Task 3.

- [x] **5. Compose the complete protected API surface** — Instantiate one
  shared repository/workflow graph in `apps/api/src/server.ts` and mount all
  authentication, catalog, member, librarian, manager, notification, profile,
  circulation, and assistant routes behind the appropriate controls.
  - Acceptance criteria: Every approved route from both branches is mounted;
    all non-authentication business routes pass through active-actor checks;
    member routes derive ownership from the session actor; librarian and manager
    routes enforce server-loaded role and privilege; request bodies are strict,
    responses use safe DTOs, and invalid/stale/conflicting operations preserve
    bounded errors with no partial writes; member-created circulation records
    can be consumed by librarian workflows and resulting librarian state is
    visible only to the owning member.
  - Verification: Member API/storage suites, librarian and manager route suites,
    safe-DTO and strict-body canaries, and new cross-role tests for borrow,
    reservation, return/loss review, fines, and notifications.
  - References: Acceptance criteria 7–14; T-3–T-7;
    `apps/api/src/server.ts`, `apps/api/src/routes/`, existing member integration
    contract under `workflow/tasks/librarian-reservations-fines-notifications/`.
  - Dependencies: Tasks 3–4.

- [x] **6. Preserve separate, bounded member and librarian AI assistants** —
  Reconcile shared SoCLaaS/provider infrastructure while keeping each role's
  context retrieval, schemas, limits, validation, and advisory-only boundary
  separate.
  - Acceptance criteria: Member context includes only public catalog/rules and
    the authenticated member's allowed records; librarian context includes only
    approved pending-report/drafting facts; request/output limits, rate limits,
    timeout/retry/circuit behavior, privacy minimization, output validation, and
    safe provider failures remain effective; untrusted stored text is treated as
    data; neither assistant can perform, approve, or authorize a write; secrets,
    raw prompts/responses, and unnecessary personal data are absent from logs and
    evidence.
  - Verification: Both branches' provider, service, route, client, isolation,
    injection, malformed-output, failure, timeout, retry, circuit, rate-limit,
    privacy, and no-write suites; update the task security review with findings
    and residual risks.
  - References: Acceptance criteria 18–20; T-9;
    `apps/api/src/integrations/soclaas/client.ts`,
    `apps/api/src/assistant/`, `apps/api/src/ai/`, assistant routes and clients;
    project `ai-security-review` skill.
  - Dependencies: Task 5.

- [x] **7. Compose the role-specific React application and typed clients** —
  Integrate shared authentication/session restoration with complete member,
  librarian, and manager routes, navigation, pages, dialogs, and API clients.
  - Acceptance criteria: Active members and librarians reach their own
    dashboards; all approved pages are routable and protected; member and
    librarian navigation/assistants are isolated to their surfaces; manager
    controls appear only for a server-reported `isManager: true`; loading,
    empty, validation, confirmation, conflict, error, and success states remain
    accessible; styles from both branches coexist without hiding functionality;
    browser code has no Firebase Admin import or direct application-data write.
  - Verification: Unified client auth, protected-route, role-routing,
    navigation, page/API, dialog, accessibility-contract, and direct-Firestore
    boundary tests, followed by required Playwright/browser checks.
  - References: Acceptance criteria 9–13, 21, and 24; T-8;
    `apps/client/src/App.tsx`, `apps/client/src/auth/`,
    `apps/client/src/api/`, `apps/client/src/pages/`,
    `apps/client/src/components/`, `apps/client/src/styles.css`.
  - Dependencies: Tasks 5–6.

- [x] **8. Normalize integrated scripts, emulator settings, and deployment-review configuration**
  — Merge project scripts and retained dependencies, standardize Firestore on
  `127.0.0.1:8080`/`demo-libconnect`, and retain Docker/Firebase Hosting and
  deployment scripts for static review only.
  - Acceptance criteria: `package.json` exposes unified build, lint, format,
    regression, coverage, focused emulator, browser, seed, start, and
    deployment-review commands; Playwright is retained and no unapproved
    dependency is introduced; tests, scripts, docs, Firebase config, and Docker
    config use the canonical integrated paths/ports; Firestore browser access
    remains deny-by-default; deployment commands are not executed.
  - Verification: Parse `package.json`, `firebase.json`,
    `firestore.indexes.json`, Docker, Vite, and deploy scripts; run non-deploying
    configuration/static checks; search for stale `8081` and conflicting cookie
    configuration and justify any fixture-only occurrence.
  - References: Acceptance criteria 15 and 22–24; T-1, T-2, T-7, T-8, T-10;
    specification §§ Configuration and indexes, approved decisions 2–4.
  - Dependencies: Tasks 2–7.

- [x] **9. Add and run end-to-end cross-role integration verification** — Add
  only the missing integration coverage needed to prove the reconciled shared
  contracts and run both branches' retained focused suites on the unified app.
  - Acceptance criteria: Tests prove member-to-librarian return/loss handling,
    reservation assignment/expiry visibility, fine issue/pay/waive visibility,
    notification ownership/read behavior, profile/session invalidation, manager
    protections, worker deadline/retry/idempotency behavior, role and ownership
    isolation, and both AI boundaries; emulator suites use port `8080`; browser
    verification passes; failures are fixed within scope or recorded without
    weakening tests.
  - Verification: T-3 through T-9 using all applicable retained `test:*`,
    `test:*:emulator`, `verify:*:emulator`, and browser commands, with exact
    commands/results recorded.
  - References: Acceptance criteria 4–24; Integration flows; Test matrix T-3–T-9;
    `tests/` and the member test directories imported from `junhong`.
  - Dependencies: Tasks 3–8.

- [x] **10. Regenerate output, run the full release-candidate checks, and complete implementation evidence**
  — Rebuild tracked output only from reconciled source, execute the complete
  non-deployment verification set, update integration-facing documentation,
  and prepare an exact implementation handoff for independent review.
  - Acceptance criteria: `npm run build`, `npm run lint`,
    `npm run format:check`, `npm test`, and `npm run test:coverage` pass;
    `dist/` matches the integrated source; no merge marker, secret shape, raw
    session, or direct-client-write regression remains; the implementation
    report records changed files, conflict decisions, commands, results,
    unavailable checks, and residual risks; setup/verification docs describe
    the unified app and canonical emulator port; no commit, push, merge,
    deployment, index creation, scheduler provisioning, or release occurs.
  - Verification: T-1, T-2, T-10, and T-11; inspect `git status`, generated
    diffs, full command output, documentation links, implementation report, and
    security review.
  - References: Acceptance criteria 1–3 and 20–25; specification §§
    Verification commands, Documentation and evidence, Boundaries;
    `workflow/templates/implementation-report.md`.
  - Dependencies: Tasks 1–9.

- [ ] **11. Complete the independent review gate on the exact integration result**
  — A separate reviewer inspects the immutable implementation commit or recorded
  working-tree snapshot from a separate worktree or clean checkout and records
  the review without relying on implementer self-attestation.
  - Acceptance criteria: The reviewer traces all 26 acceptance criteria, reruns
    proportionate build/static/regression/emulator/browser/security checks,
    records findings and residual risks in `review-report.md` and
    `security-review.md`, and identifies the exact revision reviewed; all
    blocking findings are remediated and re-reviewed or presented to the human;
    the final merge decision remains human-owned.
  - Verification: Test matrix T-12; reviewer evidence from a separate worktree
    or documented clean-checkout exception; human review/merge decision record.
  - References: Acceptance criterion 26; specification §§ Test matrix,
    Boundaries; `workflow/agents/reviewer-tester.md`;
    `workflow/templates/review-report.md`.
  - Dependencies: Task 10 and explicit human authorization to begin independent
    review.

## Checklist rules

- Tasks are completed in order unless the approved handoff records a justified
  dependency-safe exception.
- This checklist is human-approved and cannot be re-approved or changed by an
  agent outside the required revision procedure. The implementation handoff is
  a separate approval gate before Task 1 or any source change begins.
- The implementer performs Tasks 1–10 and records evidence task by task. Task 11
  is reviewer-owned and cannot be self-approved by the implementer.
- A checkbox is marked complete only after its acceptance criteria and listed
  verification pass; unavailable checks are recorded as blocked or unverified,
  never silently treated as passing.
- Requirement, schema, authorization, dependency, state-machine, or error-
  contract changes use `sdd-revise` and separate human approval before source
  changes.
- Commit, push, pull-request, merge, deployment, index creation, scheduler
  provisioning, release, destructive, and public actions remain separate exact-
  action approval gates.

## Amendments

- 2026-10-22 — Initial draft created from canonical specification
  `0.1-approved` using `sdd-propose`. No application source, tests, generated
  output, dependencies, configuration, or deployment state was changed. Human
  checklist and handoff approval remain pending.
- 2026-10-22 — Human explicitly approved the checklist and authorized creation
  of the analyst handoff. Checklist status advanced to `APPROVED`; source
  integration and all later workflow gates remain unapproved until the handoff
  is separately approved.
- 2026-10-22 — Human separately approved the handoff and authorized the
  read-only implementation preflight. Task 1 completed: specification,
  checklist, and handoff agree; source refs remain `b7270e7` and `8988a26` with
  common ancestor `c91b417b4340499e72ac590ea29fd7f77a8b9e17`; the working tree
  contains only the approved untracked analyst artifacts; 45 paths changed on
  both branches were inventoried, including 16 authored shared paths and
  generated `dist/` output; textual conflicts in `AGENTS.md` and `README.md`
  plus three moved/delete test-path conflicts were identified. No application
  source, tests, generated output, dependencies, or configuration was changed,
  and Tasks 2–11 remain unstarted pending explicit implementation authority.
- 2026-10-22 — Human authorized implementation of Tasks 2–10. Task 2 completed
  with a no-commit merge of `junhong` into `integration`: all branch-specific
  member/librarian source, tests, docs, reflections, deployment-review files,
  and historical specs are retained; current repository instructions and all
  original `specdocs/` paths were preserved; Junhong's out-of-scope `.agents`,
  `.codex`, and `.gitignore` changes were excluded. Shared authored conflicts
  were resolved to the target baseline and assigned to Tasks 3–8; generated
  `dist/` conflicts were assigned to Task 10. Existing root tests were retained
  alongside Junhong's grouped suites. No merge marker remains and no commit was
  created.
- 2026-10-22 — Task 3 completed. Unified authentication uses
  `libconnect.sid`; legacy user/session versions default to zero; active-actor
  enforcement rejects stale versions; new accounts start at version zero;
  member password changes atomically advance the user and current session;
  librarian resets and member/librarian deactivations advance `authVersion`
  before bounded session revocation; safe account values strip password and
  version metadata. Build and lint passed. Focused route/auth tests passed
  56/56 with approved localhost-listener permission; focused storage/session
  tests passed 18/18. The initial sandboxed route batch was interrupted after
  local-listener denial and is not counted as a pass.
- 2026-10-22 — Tasks 4–5 completed. Shared records, repositories, workflows,
  seed data, indexes, and the Express composition now contain the compatible
  member/librarian/manager union. Ownership and authority remain server-derived;
  workflow mutations retain transactional checks; the seed parses both roles
  and uses coherent loan/copy data. Unified role route tests passed 128/128,
  and all retained storage tests passed in the full suite.
- 2026-10-22 — Tasks 6–7 completed. Member and librarian assistants share only
  the bounded provider infrastructure while retaining separate context,
  validation, limit, failure, and no-write controls. Their focused security and
  provider tests passed 51/51. Member, librarian, and manager React routes,
  navigation, typed clients, pages, dialogs, assistants, and styles coexist;
  browser scenarios passed 11/11 after one brittle StrictMode read-count
  assertion was changed to verify a new request relative to its baseline.
- 2026-10-22 — Task 8 completed. Scripts and retained dependencies were
  unified; Firestore uses `127.0.0.1:8080` and `demo-libconnect`; the approved
  `libconnect.sid` cookie is the only active cookie name; browser Firestore
  access remains deny-by-default; Docker, Firebase Hosting, and deployment
  scripts remain review-only and were not executed. Playwright's local Chromium
  runtime was installed for authorized browser verification. `npm install`
  reported eight moderate dependency-audit findings; no automated audit fix or
  dependency expansion was performed.
- 2026-10-22 — Task 9 completed. The unified test command passed 447/447. The
  full coverage command also passed 447/447 with 65.51% line, 79.58% branch,
  and 62.72% function coverage, exceeding the configured 50/70/45 gates. All
  applicable auth, catalog, circulation, manager, member account, borrow,
  fines, closure, notification, profile, renewal, reservation, and index
  emulator checks passed on port 8080. Verification exposed and corrected a
  catalog cursor-binding omission for publication-year filters and stale
  unsigned-cursor test calls; failed attempts are recorded in the factual log
  and are not counted as passes.
- 2026-10-22 — Task 10 completed. Source was rebuilt into tracked `dist/`;
  build, lint, formatting, whitespace, JSON parsing, conflict-marker, stale
  port/cookie, and direct-client-Firestore checks passed. Integration-facing
  documentation and implementation/security evidence were updated. The exact
  result is staged as an uncommitted merge snapshot; no commit, push, pull
  request, deployment, index creation, scheduler provisioning, or release was
  performed. Task 11 remains unchecked and requires separate explicit human
  authorization and independent review.
- 2026-10-22 — The first independent Task 11 review returned `FAIL` with a
  blocker: member multi-copy checkout committed per copy and counted only
  `ACTIVE` loans, contradicting the canonical all-or-none and
  `ACTIVE`-plus-`PENDING_CLOSE` contract. The failed review and security report
  are preserved. The human explicitly authorized remediation of Findings 1–2
  according to the canonical specification and a fresh Task 11 review.
  Production, API, client, assistant, documentation, generated output, and
  tests were reconciled to one-transaction batch semantics and the open-loan
  definition. Build, lint, format, the 450-test regression suite, coverage
  (65.62% lines, 79.76% branches, 63.22% functions), and focused Firestore
  emulator acceptance checks passed. Task 11 remains unchecked pending the
  new independent verdict on the exact remediated snapshot.

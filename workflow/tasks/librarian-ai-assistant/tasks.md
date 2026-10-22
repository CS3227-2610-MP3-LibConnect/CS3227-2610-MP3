# Task Checklist: librarian-ai-assistant

## Inputs

- Specification path and version:
  `PlanDraft/Specs/LibrarianFeatures/AI/LibrarianAssistant.md`
  (`0.2-approved`)
- Specification approval record: Human user explicitly approved the
  specification and recommendations in the task conversation on 2026-10-22.
- Task checklist status: `APPROVED`
- Task checklist approver (human only): Human user, explicit approval in task conversation
- Task checklist approval date: 2026-10-22.

## Ordered implementation tasks

- [x] **1. Perform the SDD apply preflight and record approved AI policy** -
  Read the approved specification, this checklist, the handoff, the shared
  SoCLaaS design, and the order-4/order-5 contracts. Record the approved
  `gemma4:26b`, limits, no-tool/server-prefetch boundary, pending-report-only
  draft scope, safe operational metadata policy, and inactive-member rule
  before source edits.
  - Acceptance criteria: The human-approved specification is read; checklist
    and handoff approvals are separately recorded; all approved AI policy
    values are copied into the implementation report; no source changes occur
    during preflight.
  - Verification: Evidence review against the approval conversation and
    `git diff --check`.
  - References: Canonical spec §§ Sources, Technical, approved decisions; shared
    `specdocs/soc-llm-usage/design.md`; `workflow/README.md`.
  - Dependencies: None

- [x] **2. Add the server-only `gemma4:26b` SoCLaaS adapter and operational controls** -
  Implement the provider-neutral adapter, approved-model configuration,
  request-size/rate/time/retry/circuit controls, safe error mapping, and the
  approved audit-metadata boundary without exposing credentials.
  - Acceptance criteria: A-10, A-14, and A-15 pass; `gemma4:26b` is the only
    accepted model; provider HTTP details are isolated from routes;
    non-retryable failures are not retried; 5/user and 60/global limits,
    8-second timeout, one 250 ms transient retry, bounded circuit behavior,
    and AI-only `AI_UNAVAILABLE` fallback are enforced; the safe operational
    metadata policy is obeyed.
  - Verification: T-5, T-6, T-14, T-17, T-20 with a controlled provider mock
    and `npm run build`.
  - References: Canonical spec §§ Technical, Security, A-10, A-14–A-15;
    shared SoCLaaS design §§ Five-layer architecture, Error handling, Audit.
  - Dependencies: Task 1

- [x] **3. Define strict assistant contracts and server-authorized context** -
  Add request/response schemas, safe serialization, bounded report/source
  retrieval, current-state checks, and minimum-context construction.
  - Acceptance criteria: A-1–A-4 and A-18 pass; foreign/stale/invalid sources
    fail safely; context excludes credentials, sessions, unrelated records,
    and unapproved PII; only `PENDING_REPORT` with
    `RETURN_FOLLOW_UP`/`LOSS_FOLLOW_UP` is accepted by typed server policy;
    inactive-member drafts are rejected.
  - Verification: T-1–T-4 and T-18, including route/storage contract tests.
  - References: Canonical spec §§ Actors, Product behavior, Data contracts,
    A-1–A-4; order-4/order-5 safe DTO and state contracts.
  - Dependencies: Task 1

- [x] **4. Implement validated summary and draft services** - Compose the
  bounded untrusted context, call the adapter, parse structured output, apply
  server-side business validation, and return advisory results only.
  - Acceptance criteria: A-5–A-7 and A-11–A-13 pass; no model field selects a
    recipient, reference, action, status, tool, provider, or approval; no
    assistant service performs a library-state write.
  - Verification: T-6–T-13 with mocked provider responses, including malformed
    and adversarial outputs.
  - References: Canonical spec §§ Product behavior, Model-output schemas,
    Approval boundary, A-5–A-7, A-11–A-13.
  - Dependencies: Tasks 2–3

- [x] **5. Expose protected assistant routes and client API** - Add the two
  approved Express endpoints and typed client calls under existing auth,
  Origin, error-envelope, and API conventions.
  - Acceptance criteria: A-1–A-3, A-9, and A-17 pass; routes revalidate the
    active actor; request failures do not call the provider; no browser code
    imports Firestore/provider credentials or sends authority fields.
  - Verification: T-1–T-3, T-7–T-8, T-18, T-19, and `npm run lint`.
  - References: Canonical spec §§ API contracts, Server architecture,
    Compatibility; existing `apps/api/src/routes/circulation.ts`,
    `apps/api/src/routes/reservations-fines.ts`, and `apps/api/src/server.ts`.
  - Dependencies: Tasks 3–4

- [x] **6. Add advisory UI and explicit approval/send boundary** - Add a
  protected librarian panel/page that labels AI output, supports review/edit,
  safely renders text, handles failures, and invokes the existing notification
  command only after confirmation.
  - Acceptance criteria: A-8 and A-16 pass; drafts are not persisted as
    notifications; stale, duplicate, rejected, and confirmed sends use the
    existing server-side idempotency and active-member rules.
  - Verification: T-15–T-16 and focused UI/source-boundary tests.
  - References: Canonical spec §§ Notification draft, Client behavior,
    Approval boundary, A-8–A-9, A-16; order-5 notification contract.
  - Dependencies: Task 5

- [x] **7. Add AI-security, privacy, failure, and isolation verification** -
  Add deterministic canary tests and safe evidence for direct/indirect,
  multi-turn, obfuscated, multilingual/delimited, tool-call, cross-role,
  cross-member, secret-disclosure, malformed-output, rate-limit, timeout, and
  provider-failure cases.
  - Acceptance criteria: A-11–A-15 and A-18 pass; all release-gate findings
    are fixed or explicitly recorded as human-accepted residual risk; tests
    contain no real secrets or destructive payloads; no test assumes a model
    tool dispatcher or deferred source type outside the approved scope.
  - Verification: T-9–T-14, T-17–T-18; security review updated with findings.
  - References: `workflow/tasks/librarian-ai-assistant/security-review.md`,
    repository `ai-security-review` skill, canonical Test matrix.
  - Dependencies: Tasks 2–6

- [x] **8. Complete regression, documentation, and implementation evidence** -
  Run the full verification set, document changed files and unresolved risks,
  and prepare the implementation report for independent review.
  - Acceptance criteria: A-17 and all applicable T-1–T-20 results are
    recorded; unavailable environment checks are reported as blocks rather
    than passes; no deployment, provider provisioning, commit, merge, or
    release action is performed by the implementer.
  - Verification: `npm run build`, `npm test`, `npm run lint`,
    `npm run format:check`, focused AI tests, and any approved emulator/manual
    smoke evidence.
  - References: Canonical spec §§ Verification, A-17–A-18; workflow templates
    and `workflow/agents/reviewer-tester.md`.
  - Dependencies: Tasks 2–7

## Checklist rules

- This checklist is human-approved and cannot be changed by an agent without
  the `sdd-revise` procedure and separate human approval.
- Human approval of the canonical specification is recorded; this checklist
  remains a separate approval gate before it becomes an implementation
  contract.
- Human approval of this checklist and the implementation handoff is recorded;
  implementation may begin only within this approved scope and after the
  implementer performs the required preflight.
- Requirement changes use `sdd-revise` and a canonical amendments entry; they
  are not silently edited into this checklist.

## Amendments

- 2026-10-22 — Initial draft created from canonical specification `0.1-draft`.
  No application source or tests were modified. Human approval was pending.
- 2026-10-22 — Updated for approved specification `0.2-approved`: fixed model
  `gemma4:26b`, conservative limits/failure behavior, server-prefetched
  no-tool context, pending-report-only drafts, safe operational metadata, and
  inactive-member rejection. Checklist approval remains pending.
- 2026-10-22 — Human approved this checklist in the task conversation. Version
  advanced to `0.1-approved`; implementation, review, residual-risk, merge,
  deployment, and release gates remain separate.
- 2026-10-22 — Implementation agent completed the SDD apply preflight and
  recorded the approved AI policy in `implementation-report.md`; no
  application source or tests were changed during preflight.
- 2026-10-22 — Implementation agent completed Task 2 with the server-only
  adapter, approved-model enforcement, bounded limits/retry/circuit controls,
  safe error mapping, and six passing focused provider tests.
- 2026-10-22 — Implementation agent completed Task 3 with strict request and
  model-output schemas, server-side pending-report revalidation, relationship
  checks, minimum context serialization, and four passing focused contract/
  context tests.
- 2026-10-22 — Implementation agent completed Task 4 with delimited
  server-prefetched context, structured-output and business validation,
  server-owned draft metadata, advisory-only responses, and five passing
  focused service tests.
- 2026-10-22 — Implementation agent completed Task 5 with protected summary
  and draft routes, server-loaded actor authorization, typed client calls, and
  four passing focused route/client tests (the route suite required elevated
  local-listener permission because the sandbox denied TCP listeners).
- 2026-10-22 — Implementation agent completed Task 6 with a protected
  advisory panel, safe text rendering, editable ephemeral drafts, explicit
  confirmation, fresh idempotency keys, and one passing focused UI test.
- 2026-10-22 — Implementation agent completed Task 7 with deterministic
  injection, tool/approval forgery, privacy, safe-audit, provider-body, and
  browser-boundary checks; five focused security tests passed and the security
  review was updated with implemented controls and residual risks.
- 2026-10-22 — Implementation agent completed Task 8: the full regression
  suite (133 tests), build, lint, format check, focused AI suites, evidence,
  and safe secret-pattern scan passed. Live provider smoke/emulator evidence
  was not available and is recorded as unverified; implementation handoff is
  now awaiting explicit human approval before independent review.

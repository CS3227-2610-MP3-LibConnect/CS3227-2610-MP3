# Implementation Report: librarian-ai-assistant

## Status

Implementation complete, including remediation for the independent review
findings. Tasks 1–8 are complete. The human approved the implementation
handoff on 2026-10-22 and explicitly instructed that no new independent review
be started by this implementation agent.

## Approved inputs

- Canonical specification: `PlanDraft/Specs/LibrarianFeatures/AI/LibrarianAssistant.md`, version `0.2-approved`.
- Task-local specification: `workflow/tasks/librarian-ai-assistant/spec.md`, version `0.2-approved`.
- Checklist: `workflow/tasks/librarian-ai-assistant/tasks.md`, version `0.1-approved`.
- Handoff: `workflow/tasks/librarian-ai-assistant/handoff.md`, approved by the human on 2026-10-22.
- Security review: `workflow/tasks/librarian-ai-assistant/security-review.md`.
- Shared provider reference: `specdocs/soc-llm-usage/design.md`.
- Existing order-4/order-5 contracts reviewed: circulation pending-close/review and librarian notification/idempotency contracts.

## Skills, permissions, and deviations

- Selected skills: repository-local `sdd-apply` for preflight/sequential
  implementation and repository-local `ai-security-review` for the LLM,
  authorization, stored-content, and workflow threat boundaries.
- Permissions used: workspace source/test/evidence edits and normal local
  verification. The focused route suite and full regression suite used the
  approved elevated local-listener permission because the default sandbox
  rejected temporary TCP listeners; no external service or credential was
  accessed.
- Deviations: none from the approved product scope, model, limits, source
  types, approval boundary, or retention policy. Generated `dist/` output was
  produced by the repository build. Live provider and emulator smoke checks
  were unavailable and are explicitly recorded as unverified.

## SDD apply preflight

The canonical specification and approved checklist were compared before source
edits. The checklist covers the approved scope, acceptance criteria A-1–A-18,
test matrix T-1–T-20, dependencies, and final evidence requirements. No
contradiction, omitted required scope, or unresolved implementation decision
was found. Existing source mismatches are implementation gaps covered by the
approved tasks: there is currently no assistant route, provider adapter,
assistant contract, feature service, or assistant UI.

The separately approved handoff records human approval for the specification,
checklist, and handoff. No application source, test, dependency, provider,
deployment, commit, merge, or release action was performed during preflight.

## Approved AI policy recorded before source edits

- Server-only approved model: `gemma4:26b`; the client cannot select a model or provider.
- Server-prefetched, read-only context; no model-initiated tool dispatcher.
- Summary input: 1–20 unique server-valid pending return/loss report loan IDs.
- Draft input: one `PENDING_REPORT` source with only `RETURN_FOLLOW_UP` or `LOSS_FOLLOW_UP` purpose.
- Drafts are ephemeral; sending uses the existing librarian notification route after visible review and explicit confirmation.
- Active librarians and active managers have the same assistant access; manager status is not an AI bypass.
- Drafts for inactive members are rejected.
- Limits: 5 requests per user per minute, 60 requests globally per minute, and at most 20 reports per summary.
- Provider controls: 8-second timeout, one 250 ms retry only for safe transient failures, and a bounded circuit that opens after 5 retryable failures in 60 seconds and cools down for 30 seconds.
- Missing provider configuration disables only the assistant routes and returns generic `AI_UNAVAILABLE` behavior.
- Provider failures, malformed output, unsafe output, and circuit-open states return generic bounded failures with no provider body or secret disclosure.
- Operational metadata is safe structured metadata only: actor reference, feature, model, timestamp, correlation ID, result category, retry count, and approval outcome where applicable. No raw prompts/responses, credentials, sessions, passwords, unrelated records, or unnecessary PII are retained.
- Output bounds: summaries 4,000 characters; drafts 2,000 characters; plain text only; uncertainty/no-result states are required.
- No assistant route may write library state, create/send notifications, or authorize a state change.

## Verification so far

| Check | Result |
|---|---|
| `git diff --check` during preflight | Passed |
| Preflight source-change check | Passed; no application source or tests changed by preflight |
| `npm run build` | Passed |
| `node --test tests/librarian-ai-provider.test.mjs` | Passed; 8 tests |
| `node --test tests/librarian-ai-contracts.test.mjs` | Passed; 4 tests |
| `node --test tests/librarian-ai-service.test.mjs` | Passed; 5 tests |
| `npm run build && node --test tests/librarian-ai-routes.test.mjs` | Passed with elevated local-listener permission; 3 tests |
| `node --test tests/librarian-ai-client.test.mjs` | Passed; 1 test |
| `node --test tests/librarian-ai-ui.test.mjs` | Passed; 1 test |
| `node --test tests/librarian-ai-security.test.mjs` | Passed; 5 tests |
| `npm test` | Passed; full regression suite, 135 tests |
| `npm run lint` | Passed |
| `npm run format:check` | Passed |
| provider-key/bearer-token-shaped-value scan across implementation/evidence paths | Passed; no matches |
| Controlled live SoCLaaS smoke with `.env` credential | Passed; approved model `gemma4:26b`, bounded response metadata only |

## Review remediation (2026-10-22)

The independent review report identified two provider-adapter hardening items.
Both were fixed in the working tree without changing the approved policy:

- Retryable failure timestamps are no longer cleared after a successful
  request. They remain in the rolling 60-second window, so five retryable
  failures interleaved with successful requests open the circuit as approved.
- Provider response bodies are checked against `Content-Length` when present
  and otherwise read through a bounded streaming reader. The reader cancels
  as soon as the 16 KB cap is crossed, before JSON parsing or full buffering.

New provider regressions cover both behaviors. The focused provider suite now
passes 8/8 and the full regression suite passes 135/135. The original
`review-report.md` remains unchanged as the historical independent finding;
no follow-up review has been dispatched by this agent.

## Task progress

| Task | Status | Evidence |
|---|---|---|
| 1. SDD apply preflight and approved AI policy | Complete | This report and `logs/librarian-ai-assistant/2026-10-22-preflight.md` |
| 2. Server-only adapter and operational controls | Complete | `apps/api/src/integrations/soclaas/client.ts`, `tests/librarian-ai-provider.test.mjs` |
| 3. Strict contracts and authorized context | Complete | `apps/api/src/ai/librarian-assistant-contracts.ts`, `apps/api/src/storage/librarian-assistant-context.ts`, `tests/librarian-ai-contracts.test.mjs` |
| 4. Validated summary and draft services | Complete | `apps/api/src/ai/librarian-assistant-service.ts`, `apps/api/src/http/errors.ts`, `tests/librarian-ai-service.test.mjs` |
| 5. Protected routes and client API | Complete | `apps/api/src/routes/librarian-assistant.ts`, `apps/api/src/server.ts`, `apps/client/src/api/librarian-assistant.ts`, route/client tests |
| 6. Advisory UI and approval/send boundary | Complete | `apps/client/src/pages/LibrarianAssistantPage.tsx`, `apps/client/src/App.tsx`, `tests/librarian-ai-ui.test.mjs` |
| 7. AI-security/privacy/failure/isolation verification | Complete | `tests/librarian-ai-security.test.mjs`, updated `security-review.md` |
| 8. Regression, documentation, and evidence | Complete | This report, task amendments, factual logs, full verification set |

## Changed files

Current implementation and evidence files:

- `apps/api/src/integrations/soclaas/client.ts`
- `apps/api/src/ai/librarian-assistant-contracts.ts`
- `apps/api/src/storage/librarian-assistant-context.ts`
- `apps/api/src/ai/librarian-assistant-service.ts`
- `apps/api/src/http/errors.ts`
- `apps/api/src/routes/librarian-assistant.ts`
- `apps/api/src/server.ts`
- `apps/client/src/api/librarian-assistant.ts`
- `apps/client/src/pages/LibrarianAssistantPage.tsx`
- `apps/client/src/App.tsx`
- `tests/librarian-ai-provider.test.mjs`
- `tests/librarian-ai-contracts.test.mjs`
- `tests/librarian-ai-service.test.mjs`
- `tests/librarian-ai-routes.test.mjs`
- `tests/librarian-ai-client.test.mjs`
- `tests/librarian-ai-ui.test.mjs`
- `tests/librarian-ai-security.test.mjs`
- `workflow/tasks/librarian-ai-assistant/security-review.md`
- `workflow/tasks/librarian-ai-assistant/implementation-report.md`
- `logs/librarian-ai-assistant/2026-10-22-preflight.md`

## Unresolved risks

The two review findings addressed by this remediation are no longer open in
the implementation: retryable failures retain their rolling-window accounting
and provider bodies are bounded before parsing. A follow-up independent review
has not been run, so the review disposition and merge decision remain open.
Other approved residual risks remain: prompt injection in stored text despite
defensive delimiters, cross-member leakage, provider failure/quota abuse,
unsafe or misleading model output, stale report state, and librarian
over-trust in drafts. The controlled live provider smoke passed, but it does
not replace independent review or broader operational testing. No
specification decision is unresolved.

No emulator smoke evidence was approved or available for this implementation
run; it remains unverified rather than passed.

## Human approval gate

All approved tasks and required automated verification are complete, including
the review remediation. Human approval of the implementation handoff was
granted on 2026-10-22. Per the human instruction, no new independent review is
started by this agent. The remediation changes are currently uncommitted; no
push, merge, deployment, release, provider provisioning, or external
communication has been performed for this remediation.

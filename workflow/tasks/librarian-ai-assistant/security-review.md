# AI Security Review: librarian-ai-assistant

## Scope and assumptions

- Feature and roles: server-mediated assistant for active librarians and
  managers acting as active librarians.
- Intended capabilities: summarize bounded pending return/loss reports and
  produce an ephemeral plain-text notification draft from an approved source.
- Sensitive data: session identity, member IDs, loan/copy/fine/reservation
  ownership, member/account data, catalog/notification text, provider key,
  prompts, model responses, and safe audit metadata.
- Irreversible or externally visible actions: later report review and in-app
  notification sending. Both remain separate normal server commands requiring
  explicit human approval; the AI routes themselves are read-only.
- Approved design: server-prefetched context and no model-initiated tools;
  `gemma4:26b`; pending-report-only drafts; 5/user and 60/global request
  limits; 8-second timeout; one 250 ms transient retry; bounded circuit
  behavior; AI-only unavailable fallback; safe structured operational metadata;
  and inactive-member draft rejection.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Browser → Express | body fields, IDs, source/purpose, stale UI, role/manager/approval fields | unauthorized context, provider spend, forged draft authority | active-actor middleware, strict schemas, bounded inputs, server-loaded records, Origin/session protection | A-1–A-3; T-1–T-3, T-18 |
| Express → Firestore | referenced IDs, stale state, concurrent records | cross-member disclosure, stale summary, inconsistent source selection | re-read current records, ownership/state checks, safe serializers, no assistant writes | A-3–A-7, A-13; T-3–T-4, T-13 |
| Server context → model | catalog titles, synopsis, messages, member/loan text, user-provided strings | direct/indirect prompt injection, PII leakage, role hijack | minimum context, provenance delimiters, untrusted-data treatment, no raw docs/secrets, no session reuse | A-4, A-10, A-12; T-4, T-9–T-11, T-17 |
| Model output → application | text, IDs, action-like fields, tool-call requests, malformed JSON | hallucinated facts, unauthorized recipient/action, XSS, confused deputy | strict structured parsing, server-owned metadata, semantic validation, text-only response, reject action/tool fields | A-5–A-7, A-11–A-12; T-6, T-8, T-11–T-12 |
| Server → SoCLaaS | prompt/body, model/config selection, auth header | key leakage, arbitrary model use, quota exhaustion, provider error disclosure | server-only adapter, approved model allowlist, bounded payload/rate/timeout/retry, generic errors | A-10, A-14; T-5, T-14, T-17, T-20 |
| Draft UI → notification command | edited text, confirmation, idempotency key, stale source | unreviewed send, duplicate message, inactive recipient message | separate normal message route, explicit confirmation, active-member revalidation, 2,000-char bound, idempotency | A-8, A-16; T-15–T-16 |
| Workflow/evidence context | repository text, specs, skills, handoffs, logs, tool output | instruction laundering, scope escalation, secret/PII persistence | treat context as data, human-only approvals, allowed-path writes, safe evidence, independent review | A-15, A-18; T-17 and artifact review |

## Findings

### [S1] Model output must not become an authorization or mutation channel

- Severity: `MUST-FIX`
- Boundary: Model output → application; draft UI → notification command.
- Attack path or precondition: A model response or edited draft includes an
  approval, recipient, status, route, or send instruction, and the application
  trusts it or sends automatically.
- Impact: unauthorized return/loss confirmation, account/fine/reservation
  changes, or notification delivery.
- Enforcement location: typed output schema, server-owned metadata, separate
  existing review/message routes, explicit human confirmation, and server
  authorization on the final command.
- Regression test or verification: T-6, T-8, T-12, T-15.
- Human decision: The separate send/review boundary is approved; an agent
  cannot treat a preview or model field as approval.

### [S2] Indirect prompt injection in library content can hijack the assistant

- Severity: `MUST-FIX BEFORE RELEASE`
- Boundary: Server context → model.
- Attack path or precondition: A book title/synopsis, notification, or other
  stored text contains instructions to ignore the role, reveal records, call a
  tool, or approve a report.
- Impact: unauthorized disclosure, unsafe recommendation, or attempted
  confused-deputy action.
- Enforcement location: minimum-context selection, explicit untrusted-data
  delimiters, no model tool dispatcher, structured output validation, and
  business validation outside the model.
- Regression test or verification: T-9–T-12 with benign canary payloads.
- Human decision: The no-model-tool and pending-report-only source scope is
  approved; implementation must preserve it.

### [S3] Cross-member context leakage or confused deputy

- Severity: `MUST-FIX BEFORE RELEASE`
- Boundary: Browser/source IDs → Firestore/context and concurrent requests.
- Attack path or precondition: A librarian submits another member's ID/source,
  a stale cached context is reused, or a model-selected ID escapes the source
  authorization check.
- Impact: exposure of member activity/fines/reservations and incorrect draft
  recipient.
- Enforcement location: current server actor, source re-read, source-to-member
  relationship checks, request-scoped context, and no client-supplied
  recipient authority.
- Regression test or verification: T-2–T-4, T-13, T-15.
- Human decision: Approve the minimum fields exposed to the librarian/model.

### [S4] Provider secret, raw context, or unnecessary PII leakage

- Severity: `MUST-FIX BEFORE RELEASE`
- Boundary: Server → SoCLaaS and logs/evidence.
- Attack path or precondition: Provider calls are made from the client, raw
  prompts/responses are logged, or error handling forwards provider bodies.
- Impact: credential compromise, member privacy breach, or evidence leakage.
- Enforcement location: server-only adapter, redaction, minimum context,
  generic error mapping, secret scans, and approved audit metadata policy.
- Regression test or verification: T-4, T-5, T-14, T-17, T-18, T-20.
- Human decision: Structured operational metadata only is approved; no new
  persisted AI audit collection or raw prompt/response retention is allowed.

### [S5] Provider failure and quota behavior can become an availability or cost
attack

- Severity: `MUST-FIX BEFORE RELEASE`
- Boundary: Browser → provider adapter → SoCLaaS.
- Attack path or precondition: Unbounded request size/retries, concurrent spam,
  retrying non-retryable errors, or arbitrary model selection.
- Impact: quota exhaustion, excess cost/latency, leaked provider details, or
  denial of assistant service.
- Enforcement location: per-user/global limits, shared 90/minute cap,
  bounded timeout/retry/backoff, circuit behavior, approved-model allowlist,
  and generic unavailable fallback.
- Regression test or verification: T-5 and T-14.
- Human decision: Exact limits and retry/circuit configuration are approved as
  recorded above; implementation must enforce and test them.

### [S6] Malformed or unsafe model output can create misleading librarian UX

- Severity: `SHOULD-FIX BEFORE RELEASE`
- Boundary: Model output → response/UI.
- Attack path or precondition: Model returns unsupported IDs, invented facts,
  HTML/script text, an overlong draft, or a confident action suggestion.
- Impact: librarian makes an incorrect decision, unsafe content is rendered, or
  a downstream command receives invalid data.
- Enforcement location: schema and semantic validation, bounded plain text,
  uncertainty/no-result states, text-only rendering, and advisory labels.
- Regression test or verification: T-6, T-8, T-11, T-16.
- Human decision: Approved output bounds remain 4,000 characters for summaries
  and 2,000 characters for drafts; uncertainty/no-result states are required.

### [S7] Approval and workflow evidence can be laundered

- Severity: `SHOULD-FIX`
- Boundary: Workflow/evidence context.
- Attack path or precondition: A skill, prompt, generated summary, handoff, or
  passing test is treated as human authorization, or logs contain secrets.
- Impact: implementation begins before approval or sensitive data persists in
  task artifacts.
- Enforcement location: draft approval fields, separate human gates, allowed
  file boundaries, safe factual logs, and independent review.
- Regression test or verification: artifact review, T-17, and workflow checks.
- Human decision: Human must separately approve specification, checklist,
  handoff, implementation/review disposition, and release actions.

## Test plan

- Direct injection: ignore-role, reveal-context, approve-action, and persona
  switching canaries; expected result is advisory refusal/no-result.
- Indirect injection from stored or retrieved content: poisoned title,
  synopsis, notification, member text, and tool-like context; expected result
  is no instruction execution or scope expansion.
- Multi-turn or obfuscated escalation: staged requests, encoded/delimited,
  multilingual, and field-manipulation canaries; expected result is stable
  schema and authorization behavior.
- Cross-role and cross-user denial: signed-out/inactive/member/foreign-source
  requests, forged roles, stale source, and concurrent request isolation.
- Malformed output and tool arguments: invalid JSON/schema, unsupported IDs,
  HTML, overlong content, mutation/tool-call fields; expected safe fallback
  and no write. No model tool dispatcher is exposed in the initial design.
- Rate limits, timeout, and provider failure: 400/401/403/429/5xx, network,
  timeout, missing config, circuit-open, retry exhaustion, and body limits;
  expected bounded generic errors and no secret leakage.
- Safe logging and secret scanning: source, bundle, response, error, test
  fixture, and workflow artifact scans for provider keys, session material,
  password data, raw prompts/responses, and unnecessary PII.

## Release gates

- Model cannot authorize protected writes or external side effects: `Pending —
  human approval and implementation evidence required`.
- Tools are allowlisted, schema-validated, authenticated, authorized, and
  logged: `Pending — initial design exposes no model-initiated tools`.
- Human approval is required for consequential actions: `Pending — must use
  existing review/message commands and explicit UI confirmation`.
- Data minimization and cross-member isolation tests pass: `Pending`.
- Rate, timeout, provider-failure, malformed-output, and safe-log tests pass:
  `Pending`.
- Residual risks are accepted by: Human acceptance remains required after
  implementation and independent review; specification policy decisions were
  approved on 2026-10-22.

## Implementation verification

The implementation preserves the approved trust boundaries:

- Active actor and librarian authorization remain in Express middleware and
  are rechecked by the feature service; manager status does not add access.
- The adapter is server-only, fixes `gemma4:26b`, bounds payloads and quotas,
  applies timeout/retry/circuit controls, and emits only safe structured
  metadata.
- Context is request-scoped and re-read from current loan, copy, and member
  records. Passwords, emails, sessions, credentials, raw Firestore documents,
  and unrelated records are not serialized into model context.
- The model has no tool dispatcher. Strict schemas and server-side matching
  reject extra authority fields, hallucinated IDs, incompatible actions,
  unsafe text, malformed JSON, and approval/send attempts.
- Drafts remain ephemeral. The UI requires visible review/edit and explicit
  confirmation before calling the existing idempotent librarian-message route.

Focused deterministic verification added by the implementation includes direct
and indirect injection canaries, tool/approval forgery rejection, client
boundary scans, safe audit metadata checks, and upstream-body non-disclosure.

A controlled live SoCLaaS smoke request also passed using the configured
credential outside source control. It selected only `gemma4:26b` and recorded
bounded response metadata; no credential, prompt, or response content was
retained in evidence.

Residual risks remain: model-generated wording may still be misleading within
the bounded advisory fields; a librarian may over-trust a valid-looking draft;
stored content can continue to influence model quality despite delimiters; and
provider availability/model behavior can change. These are not treated as
authorization paths. Independent review and human residual-risk acceptance
remain required before release.

## Independent review addendum (2026-10-22)

The independent reviewer verified the implementation commit `81a8566` from a
separate clean worktree. Focused AI tests passed 22/22, assistant route tests
passed 3/3 with local-listener permission, and the full regression suite passed
133/133 with the same permission. Build, lint, format, diff, and secret-pattern
checks passed.

One release-blocking control gap was found: `SoCLlmClient` clears the rolling
retryable-failure list after any successful provider call. Therefore five
retryable failures within 60 seconds do not necessarily open the approved
circuit when successes are interleaved. The required regression is an
interleaved-failure/success sequence, and the implementation must retain the
approved rolling-window semantics or receive a separately approved policy
amendment. The independent report records this as S1 and the verdict is
`FAIL` pending correction and re-review.

A secondary hardening item remains: the adapter parses the complete provider
JSON body before applying its 16 KB content check, so response buffering is not
bounded. Add a pre-parse body cap and provider test before release if the
residual memory/availability risk is not explicitly accepted.

## Remediation addendum (2026-10-22)

The implementation agent addressed both findings without changing the approved
AI policy or trust boundaries:

- `SoCLlmClient` now retains retryable-failure timestamps after successful
  requests and continues to prune them only by the approved 60-second rolling
  window. Five retryable failures therefore open the circuit even when
  successful requests are interleaved. A deterministic regression covers that
  sequence.
- Provider response bodies now use a `Content-Length` pre-check when available
  and a bounded streaming reader otherwise. The reader cancels as soon as the
  16 KB limit is exceeded, before JSON parsing and without fully buffering the
  response. A deterministic reader regression verifies cancellation after the
  cap is crossed.

The provider suite passes 8/8, the full regression suite passes 135/135, and
build, lint, formatting, and secret scans pass. This addendum records
implementation evidence only; the original independent review disposition is
preserved above and a follow-up independent review has not been dispatched.

## Independent follow-up review (2026-10-22)

The reviewer re-reviewed remediation commit `677b9b8` from a fresh clean
worktree. The rolling-window circuit regression and bounded response-body
regression both pass. Focused AI tests pass 24/24, assistant route tests pass
3/3 with local-listener permission, and the full regression suite passes
135/135. Build, lint, formatting, and secret-pattern checks pass.

The follow-up found no new must-fix or should-fix issue. The disposition is
`PASS WITH RESIDUAL RISK`, subject to human acceptance of the approved
advisory-model, stored-content, log-retention, and unavailable-emulator risks.
This is not merge approval.

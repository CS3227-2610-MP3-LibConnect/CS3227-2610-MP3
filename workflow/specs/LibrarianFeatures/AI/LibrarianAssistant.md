# FEATURE: Librarian/Manager Review and Notification Assistant

**Task ID:** `librarian-ai-assistant`  
**PLAN order:** 7  
**Status:** `0.2-approved — human approval recorded in task conversation on 2026-10-22`  
**Owner:** Jiali, subject to the approval gates in `AGENTS.md` and `workflow/README.md`

## Objective

Provide an authenticated librarian-facing assistant that can:

1. summarize a bounded set of pending return/loss reports; and
2. prepare a bounded plain-text notification draft for a librarian to review.

The assistant is advisory. It must not confirm a return or loss, change a
loan/copy/account/fine/reservation state, create a notification, or send an
external message. A librarian must use the existing authorized workflow and
explicitly approve any consequential action.

An active manager is included because a manager is an active librarian. This
feature does not grant a manager privilege beyond the ordinary active-
librarian policy.

## Why this change is required

PLAN order 7 is the remaining Jiali feature and Overview.md requires a
librarian LLM feature. The approved order-4 and order-5 specifications expose
bounded pending-report, loan, reservation, fine, and in-app notification
contracts, but explicitly leave AI summaries and drafting out of scope. The
current source has no assistant route, provider adapter, structured AI-output
contract, or approval boundary for this feature.

This specification connects those existing server-owned facts to one bounded
SoC LLM feature without allowing model output to become authorization.

## Sources and assumptions

### Authoritative sources reviewed

- `AGENTS.md`, `workflow/README.md`, and `workflow/agents/spec-analyst.md`.
- `Overview.md` for product roles, entities, AI constraints, and domain terms.
- `workflow/PLAN.md`, especially order 7 and the common AI-security boundary.
- `workflow/responsibilities/jiali.md`.
- `workflow/specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md`
  (`0.4-approved` boundary) for pending report states and safe queue fields.
- `workflow/specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md`
  (`0.4-approved` boundary) for notification types, recipient validation,
  message limits, and idempotent send behavior.
- `workflow/specdocs/soc-llm-usage/design.md` for the shared SoCLaaS adapter contract,
  provider failure behavior, data minimization, and AI test requirements.
- Current source as evidence only: `apps/api/src/server.ts`, the circulation
  and reservations/fines routes/contracts, `apps/api/src/storage/workflows.ts`,
  `packages/shared/src/domain/records.ts`, and the corresponding tests.

### Observed constraints

- Express resolves the current actor from the session and Firestore record;
  `requireActiveActor` and `requireLibrarian` are the existing authorization
  boundary.
- The current pending report state is `Loan.status = PENDING_CLOSE` with
  `closureReportType = RETURNED | LOST`; the copy is `IN_TRANSIT`.
- Existing librarian messages are bounded to 2,000 characters, resolve the
  recipient from `memberId`, require an `Idempotency-Key`, and are allowed only
  for active members.
- The repository has no existing AI route, SoCLaaS client, model-output
  schema, or persisted AI audit-record abstraction.
- `npm run build`, `npm test`, `npm run lint`, and `npm run format:check` are
  the repository verification commands. The current `npm test` script does not
  yet include AI-specific tests.

### Decisions approved by the human

1. The approved SoCLaaS model is `gemma4:26b`, selected server-side and never
   supplied by the client.
2. The initial assistant uses server-side prefetch of read-only context; the
   model does not receive a general-purpose tool dispatcher. This is the
   narrowest design for the first release.
3. Drafts are ephemeral response objects. Sending remains the existing
   `POST /api/v1/librarian/notifications` command after the librarian reviews
   and optionally edits the text.
4. The assistant drafts only pending-report follow-ups in the first release:
   `RETURN_FOLLOW_UP` and `LOSS_FOLLOW_UP`. Overdue, fine, and reservation
   drafting are deferred extensions.
5. Manager and non-manager active librarians have the same assistant access;
   no manager-only AI operation is introduced.
6. AI limits are five requests per user per minute, 60 requests globally per
   minute, at most 20 reports per summary, the existing 16 KB request bound,
   an 8-second provider timeout, and one 250 ms retry only for safe transient
   failures. The circuit opens after five retryable failures in 60 seconds and
   cools down for 30 seconds.
7. Missing provider configuration disables only the assistant routes. The API
   remains available and returns the generic `AI_UNAVAILABLE` response.
8. AI operational records use safe structured metadata only; no new persisted
   AI audit collection and no raw prompt/response retention are authorized.
9. Draft generation for inactive members is rejected, matching the existing
   manual librarian-message rule.

## Scope

### In scope

- Active-librarian authentication and authorization for assistant routes.
- A bounded pending-report summary request for 1–20 unique server-valid loan
  IDs.
- A notification-draft request based on one server-valid `PENDING_REPORT`
  source, with strict `RETURN_FOLLOW_UP` or `LOSS_FOLLOW_UP` purpose.
- Server-side retrieval of minimum necessary facts from current records.
- A server-only SoCLaaS adapter using one configured approved model.
- Typed input, prompt-context, model-output, and response schemas.
- Safe fallback behavior for rate limits, timeouts, malformed output, missing
  configuration, and unavailable provider responses.
- Explicit review and approval UI for any later send or state-changing action.
- Safe operational/audit metadata without raw prompts, raw model responses,
  credentials, session material, or unnecessary personal data.
- Unit, route, emulator/integration, client, adversarial, and regression tests.

### Out of scope

- Member assistant functionality; it belongs to the other role owner.
- Automatic confirmation/rejection of return or loss reports.
- Any loan, copy, account, fine, reservation, or notification write by the
  assistant or the model.
- Sending, editing, or deleting a notification through the AI route.
- External email, SMS, push, payment, or other delivery.
- Streaming, long-term conversation memory, free-form agent loops, browsing,
  arbitrary model-selected tools, or provider/model fallback to an unapproved
  model.
- New domain state machines or changes to the order-4/order-5 contracts.
- Persistent raw prompt/response storage.
- Deployment, production credentials, provider-key provisioning, or release.

## Actors and authorization

| Actor | Allowed behavior | Denied behavior |
|---|---|---|
| Active librarian | Request bounded summaries and drafts for server-authorized records; review/edit a returned draft; use existing authorized send/review commands after confirmation | Supplying a role, manager flag, target record, or approval field to gain authority; bypassing current state or ownership checks |
| Active manager | Same assistant behavior as an active librarian | Treating manager status as permission to bypass report, recipient, or state rules |
| Active member | None in this task | Calling librarian assistant routes or receiving another member's context |
| Inactive or signed-out account | None | Reading context, invoking the model, or sending through the assistant |
| SoC LLM | Produce advisory structured text only | Authorizing tools, writes, approvals, notifications, or external effects |

The server reloads the authenticated actor and all referenced records. Client
roles, `isManager`, member IDs, loan IDs, fine IDs, reservation IDs,
notification fields, approval flags, and target objects are untrusted input.

## Product behavior

### Pending-report summary

1. The librarian selects 1–20 pending report IDs from the existing bounded
   pending-close queue.
2. The server validates the request, re-reads every loan and copy, and keeps
   only reports that are still `PENDING_CLOSE` with a valid `RETURNED` or
   `LOST` report and `IN_TRANSIT` copy.
3. The server supplies the model with minimum facts: report type, loan/copy
   IDs, ISBN, book-title snapshot, member ID, report time, due date, and
   approved current-state facts. Passwords, emails, sessions, credentials,
   unrelated members, and raw Firestore documents are excluded.
4. The response contains a validated advisory summary, per-report facts, an
   allowed review suggestion, and an uncertainty/no-result state when needed.
5. No Firestore record, session, notification, or state transition is written.
   If any selected report is no longer eligible, the server returns a bounded
   conflict response or refreshable per-item conflict; it must not summarize a
   stale or unauthorized record as current.

### Notification draft

1. The librarian selects one eligible pending report and a strict purpose:

   | Source | Allowed purpose | Required current state |
   |---|---|---|
   | `PENDING_REPORT` | `RETURN_FOLLOW_UP` or `LOSS_FOLLOW_UP` | Pending close report |

2. The server resolves the member from the source record, confirms the source
   belongs to that member, and applies the existing active-member rule for a
   draft intended for manual `LIBRARIAN_MESSAGE` delivery.
3. The model returns only a bounded plain-text draft. The server response
   includes the server-selected `memberId`, source identity, intended purpose,
   `notificationType: LIBRARIAN_MESSAGE`, null notification reference fields,
   `requiresHumanApproval: true`, and any warning/uncertainty.
4. The draft is not persisted as a notification. The UI must show the draft as
   editable text and clearly label it as AI-generated and untrusted.
5. If the librarian chooses to send it, the UI requires explicit confirmation
   and calls the existing server-owned message route with a fresh bounded
   idempotency key. The normal message route revalidates active membership,
   recipient, message bounds, and authorization. The AI route is never a
   shortcut to that command.

### Failure behavior

- Invalid or unknown fields, IDs, purposes, source types, or limits return the
  existing `400` validation envelope before any provider call.
- Missing session returns `401`; inactive/non-librarian/foreign access returns
  `403`; missing source returns `404`; stale source state returns `409`.
- Per-user/global quota exhaustion returns a generic `429` or configured
  unavailable response without calling the provider.
- Missing configuration, provider authentication failure, timeout, retry
  exhaustion, malformed provider response, unsafe output, and circuit-open
  state return a generic `503`/configured AI-unavailable response. Raw provider
  bodies, prompts, keys, stack traces, and private record contents are not
  returned.
- A failed request never claims that a summary was generated or a message was
  sent. No AI-route failure may partially write a notification or domain record.

## Data and output contracts

### Proposed request contracts

The exact route names may follow existing conventions, but the following
payload boundaries are required:

| Operation | Request | Success | Authorization |
|---|---|---|---|
| `POST /api/v1/librarian/assistant/pending-reports/summary` | Strict `{ loanIds: string[] }`, 1–20 unique bounded IDs | `200` validated summary response | Active librarian |
| `POST /api/v1/librarian/assistant/notification-draft` | Strict `{ sourceType, sourceId, purpose }` with approved combinations | `200` validated ephemeral draft | Active librarian |

Unknown fields and client-supplied actor, recipient-user, notification,
approval, timestamp, model, provider, or state fields are rejected. The
request body remains within the existing 16 KB JSON limit and has a stricter
feature-level bound.

### Proposed model-output schemas

The server must parse structured output and reject anything outside the schema.
The summary schema contains:

- `summary`: plain text, bounded to 4,000 characters;
- `items`: one item for each authorized requested report, with server-matched
  `loanId`, report type, bounded facts, and one of
  `VERIFY_RETURN`, `VERIFY_LOSS`, `CONTACT_MEMBER`, `REVIEW_MANUALLY`, or
  `NO_ACTION`;
- `uncertainty`: bounded nullable plain text.

The draft schema contains a bounded plain-text `message`, a short bounded
`rationale`, and a bounded nullable `warning`. Server-owned source/member IDs
and notification fields are attached after validation, not accepted from the
model. The model cannot select a recipient, reference, amount, status, route,
tool, or approval outcome.

## Technical and integration specifications

### Server architecture

Use the existing React → Express → domain/storage architecture:

```text
React assistant UI
  -> authenticated Express assistant route
  -> strict schema + current actor/source authorization
  -> bounded server-side read context
  -> SoCLaaS adapter
  -> structured output validation + business validation
  -> advisory response
```

The first implementation should add a feature service that receives typed
context and calls the shared provider-neutral adapter described in
`workflow/specdocs/soc-llm-usage/design.md`. Provider HTTP details must not appear in
routes, React code, or repositories. The feature must not expose model-
initiated tools; if a later change requires tools, it needs a separate
specification amendment with an allowlist, schemas, actor checks, and tests.

### Prompt and data handling

- The system instruction must define the narrow librarian-assistant role,
  advisory-only output, refusal/no-result behavior, and the structured schema.
- User-entered request fields and all catalog, notification, member, and loan
  text are delimited as untrusted data, never as instructions.
- Context is minimized per request and is not reused across actors or sessions.
- The provider adapter uses the approved `gemma4:26b` model only. Limits are
  five requests per user per minute, 60 globally per minute, an 8-second
  timeout, one 250 ms retry only for safe transient failures, and the approved
  bounded circuit behavior. The global limit remains below the shared provider
  cap of 90 requests/minute.
- Prompts and responses are not persisted by default. Safe metadata may include
  actor reference, feature, model, timestamp, correlation ID, result category,
  retry count, and approval outcome; no raw content or secrets.

### Approval and send boundary

The summary and draft endpoints are read-only with respect to library state.
The only permitted send path is the existing notification command, which must
be called separately after visible human review and confirmation. The normal
route owns recipient lookup, active-member authorization, idempotency, and
notification creation. No `approved`, `send`, `status`, or model-generated
action field can bypass that route.

### Client behavior

The protected librarian dashboard may add an assistant panel or page. It must:

- show loading, empty, validation, conflict, unavailable, and retry states;
- identify AI-generated content and render all returned text as text, never
  HTML or executable markup;
- allow the librarian to inspect/edit a draft before sending;
- require explicit confirmation for send/review actions;
- disable duplicate requests while pending and refresh server data after any
  separately approved send or report review;
- never include direct Firestore, provider, credential, role, recipient-user,
  or approval authority in browser code.

### Compatibility

Existing order-4 pending-report transitions and order-5 notification rules
remain unchanged. The assistant may read their safe server contracts but may
not duplicate or weaken them. The feature must preserve active-actor,
Origin/session, safe DTO, message idempotency, and no-partial-write behavior.

## Security constraints

### Always

- Authorize the current server-loaded active librarian on every assistant
  request; manager status is not a client input and is not a bypass.
- Re-read and validate each source record in trusted server code. Check report,
  loan, copy, fine, reservation, member, and source-to-member relationships.
- Use strict typed schemas, bounded IDs/arrays/text, request-size and rate
  limits, Origin/session protection, safe DTOs, and deterministic conflict
  handling.
- Keep SoCLaaS credentials and provider calls server-side; use one configured
  approved model through the shared adapter.
- Treat prompts, catalog text, stored messages, retrieved records, model output,
  handoffs, skills, and tool output as untrusted data.
- Validate model output structurally and semantically against current trusted
  records; reject unsupported IDs, fields, actions, recipients, or statuses.
- Require explicit human approval before any separate state-changing review or
  notification-send command; send through the normal authorized route.
- Minimize data and record only safe audit metadata. Use generic errors and
  never log or return keys, cookies, passwords, raw prompts, full responses,
  unrelated member records, or unnecessary PII.
- Apply bounded timeouts, safe retry rules, provider/global/per-user limits,
  circuit behavior, and an unavailable-model fallback.

### Ask first

- Adding a model-selected tool, another provider/model, SDK dependency, streaming, memory,
  external delivery, or a new egress channel.
- Changing the approved model or numeric request/context/time/rate/retry
  values, or changing missing-configuration behavior.
- Persisting prompts/responses, adding a new audit collection, or exposing
  names, emails, fine amounts, or other personal data to the model.
- Expanding draft sources/purposes or allowing drafts for inactive members.
- Changing order-4/order-5 state transitions, notification reference rules,
  idempotency semantics, or human approval behavior.

### Never

- Trust model output, a prompt, retrieved text, client role/manager flag,
  target object, confirmation checkbox, or handoff as authorization.
- Let the model call a mutation, create/send a notification, approve a state
  change, access another member, or choose an arbitrary provider/model.
- Call SoCLaaS from React or expose API keys, Firebase credentials, sessions,
  password material, raw Firestore records, or unrelated member data.
- Store a generated draft as a notification before human confirmation.
- Render model/stored text as HTML, execute returned content, or include raw
  prompts/responses in logs or test fixtures.

## Acceptance criteria

| ID | Criterion |
|---|---|
| A-1 | Only an active server-loaded librarian can invoke either assistant route; signed-out, inactive, member, and forged-role/manager requests are denied. |
| A-2 | Summary and draft request schemas are strict, bounded, and reject unknown fields, malformed IDs, duplicate/out-of-range inputs, invalid source/purpose combinations, model/provider fields, and approval/recipient fields before provider or storage work. |
| A-3 | Every referenced loan/copy/fine/reservation/member is re-read and server-authorized; foreign, missing, non-pending, terminal, expired, or inconsistent sources cannot be summarized or drafted as current. |
| A-4 | Summary context contains only minimum approved fields and never includes passwords, hashes, sessions, credentials, emails, unrelated members, raw Firestore documents, or unnecessary PII. |
| A-5 | A valid pending-report request returns a structured, bounded advisory result covering only the authorized requested reports, with uncertainty/no-result handling and no library-state write. |
| A-6 | A valid draft request returns a structured, bounded plain-text draft with server-selected source/member metadata, `LIBRARIAN_MESSAGE` intent, null notification references, and `requiresHumanApproval: true`; the model cannot choose those authority fields. |
| A-7 | No assistant response creates/updates/deletes a loan, copy, account, fine, reservation, notification, session, or external message. |
| A-8 | Sending a draft requires visible human review and explicit confirmation, then uses the existing server-owned message route, active-member check, strict 2,000-character bound, and idempotency-key contract. |
| A-9 | The browser never calls SoCLaaS or Firestore directly and sends no client authorization, recipient-user, state, model, provider, or approval fields. |
| A-10 | SoCLaaS is called only through a server adapter with a configured approved model; credentials never reach the client, prompts, logs, responses, or evidence. |
| A-11 | Malformed, incomplete, unsafe, hallucinated, or unsupported model output is rejected or converted to a safe unavailable/uncertain result and cannot authorize any action. |
| A-12 | Direct, indirect, multi-turn, obfuscated, multilingual/delimited, and tool-result prompt-injection attempts cannot expand data access, alter the schema, invoke tools, or authorize a write. |
| A-13 | Cross-role and cross-member isolation holds for summary context, draft source, responses, cached state, and concurrent requests. |
| A-14 | Request/body/context limits, per-user/global rate limits, timeouts, bounded safe retries, circuit behavior, 429/5xx/network handling, missing configuration, and model-unavailable fallbacks are enforced without leaking provider details. |
| A-15 | Safe audit/operational metadata records the feature outcome, actor reference, timing/correlation data, and approval outcome as approved, without raw prompts/responses, secrets, session material, or unnecessary PII. |
| A-16 | The UI labels AI output as advisory, renders text safely, exposes loading/empty/error/conflict/unavailable states, prevents duplicate actions, supports review/edit, and never shows false send or state-change success. |
| A-17 | Existing order-4/order-5 transitions, notification references, active-actor, Origin/session, build, lint, format, and regression behavior remain passing. |
| A-18 | Any unresolved provider, data-retention, audit, scope, or policy decision is recorded in task evidence and is not guessed in implementation. |

## Test matrix

| ID | Level | Scenario | Expected evidence |
|---|---|---|---|
| T-1 | Unit | Strict summary/draft schemas, bounds, enum combinations, unknown fields, forged authority fields | Invalid requests fail before provider/storage calls |
| T-2 | Route | Signed-out, inactive, member, active librarian, manager, and forged actor/session fields | Correct `401`/`403`/success outcomes; no unauthorized call or write |
| T-3 | Integration | Missing, foreign, duplicate, stale, non-pending, expired, mismatched loan/copy/source records | Approved `404`/`403`/`409`; no model call with unauthorized context and no write |
| T-4 | Unit | Context minimization and safe serialization | Only approved IDs/status/timestamps/snapshots reach adapter; secrets/PII/raw records excluded |
| T-5 | Provider unit | Approved model selection, request headers/body, timeout, retry and error mapping | Client cannot select model; 401/403/400 are not retried; safe 429/5xx/network handling |
| T-6 | Provider unit | Malformed, missing, oversized, schema-invalid, unsafe, or action-bearing model output | Safe fallback; no downstream action or false success |
| T-7 | Route/provider | Valid pending-report summary | Bounded structured advisory response; no Firestore mutation |
| T-8 | Route/provider | Valid draft for each approved source/purpose combination | Plain-text draft, server-owned metadata, explicit approval flag, no notification record |
| T-9 | Security | Direct role-play/ignore-instruction and multi-turn escalation canaries | Model remains advisory; no scope or tool expansion |
| T-10 | Security | Indirect injection in book title, synopsis, notification/message, member text, and tool-like returned text | Content is treated as data; no instruction execution or unauthorized data access |
| T-11 | Security | Obfuscated, multilingual, delimiter, encoded, and output-field manipulation canaries | Schema/business validation rejects unsafe or unsupported results |
| T-12 | Security | Attempted model tool call, mutation request, arbitrary model/provider selection, or approval forgery | No tool dispatcher/mutation path; request/output rejected and safely logged |
| T-13 | Integration | Two librarians/members and concurrent/cached requests | No cross-actor or cross-member context bleed; request scope is isolated |
| T-14 | Operational | Per-user/global limits, request/context limits, timeout, circuit-open, missing config, 429, 5xx, network failure | Bounded work, generic errors, no secret/provider-body leakage |
| T-15 | Approval boundary | Edit/reject/send draft, duplicate click, stale source before send, idempotency replay/mismatch | Only explicit confirmation reaches normal message route; stale/duplicate behavior is safe |
| T-16 | Client | Protected assistant UI, advisory labels, safe text rendering, loading/empty/error/conflict/unavailable/retry | Accessible states; no HTML execution, false success, or duplicate request |
| T-17 | Privacy/evidence | Source/log/response/test-fixture/secret scans | No keys, cookies, passwords, raw prompts/responses, or unnecessary PII |
| T-18 | Boundary | Browser source scan and Firestore/provider import assertions | No direct browser database/provider access or client authority fields |
| T-19 | Regression | Existing auth, catalog, circulation, reservations/fines, manager/member routes, Origin, build, lint, format | Existing behavior remains green |
| T-20 | Manual smoke | Controlled environment with credentials supplied outside repository | One approved-model summary/draft succeeds; credentials and raw content absent from evidence |

## Verification commands

The implementer must record exact results for:

```text
npm run build
npm test
npm run lint
npm run format:check
```

The task must also record focused AI contract/security tests and any emulator
or controlled-provider test. Automated tests must use a mock/provider double;
real credentials are not required. A manual provider smoke check, if approved,
must use credentials outside the repository and must not print them.

## Risks and trade-offs

- A server-prefetched, no-tool design reduces confused-deputy risk but may
  produce less flexible answers; tool dispatch is intentionally deferred.
- The repository has no established AI audit sink. Choosing safe structured
  logs versus a persisted audit record affects privacy, retention, and schema
  scope and requires a human decision.
- Strict data minimization can reduce draft quality; uncertainty is preferable
  to exposing unrelated member data.
- Provider quotas and model availability can change. The adapter must fail
  clearly rather than silently selecting an unapproved model.
- Drafts are ephemeral, so an unsent draft is not an audit record. A sent
  message is auditable through the existing notification/idempotency contract;
  the AI-generation event still needs the approved safe-metadata policy.

## Open decisions requiring human approval

There are no unresolved specification decisions after the human approval
recorded on 2026-10-22. The approved values are recorded above. Any change to
the model, limits, provider behavior, source/purpose scope, audit retention, or
inactive-member policy requires `sdd-revise`, a dated amendment, and separate
human approval.

## Out-of-scope release gates

- This specification was approved by the human on 2026-10-22. The checklist
  and implementation handoff remain separate approval gates before source
  changes.
- Independent review, residual-risk acceptance, exact commit/merge approval,
  provider credential provisioning, deployment, external notification, and
  release remain separate human gates.
- No application source, tests, dependencies, provider calls, or deployment
  configuration are authorized by this draft.

## Amendments

- 2026-10-22 — Initial analyst draft created from PLAN order 7, Overview.md,
  the approved order-4/order-5 boundaries, the shared SoCLaaS design, current
  source contracts, and repository workflow instructions. No application
  source or tests were modified. Human approval is pending.
- 2026-10-22 — Human approved the analyst recommendations and selected
  `gemma4:26b`: server-prefetched context with no model tools; 5/user and
  60/global requests per minute; max 20 reports; 8-second timeout; one 250 ms
  transient retry; bounded circuit behavior; AI-only unavailable fallback;
  pending-report-only drafts; safe structured operational metadata; and
  rejection of drafts for inactive members. Specification advanced to
  `0.2-approved`; checklist and handoff approval remain separate gates.

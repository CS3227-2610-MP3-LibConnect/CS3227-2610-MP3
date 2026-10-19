# SoC LLM Usage

## Description

Define the server-side contract and development rules for calling SoCLaaS from
LibConnect's bounded member and librarian AI features. This document is the
shared reference for agents implementing, testing, or reviewing SoC LLM usage.

It covers the integration boundary, reliability, privacy, and approval rules;
it does not define either assistant's detailed UX or prompt wording.

## Product requirements and acceptance criteria

1. No browser or client bundle contains the SoC LLM API key or calls the
  SoCLaaS endpoint directly.
2. Every application model request passes through one server-side adapter that
  validates configuration, model selection, request size, timeout, and the
   upstream response shape.
3. The adapter uses only a configured approved model; a client cannot select an
  arbitrary provider model by supplying a request field.
4. A valid completion request includes the configured base URL, a Bearer API
  key, `Content-Type: application/json`, a model, and a `messages` array.
5. The adapter handles upstream `401`, `403`, `429`, `5xx`, malformed
  responses, network failures, and timeouts without exposing credentials,
   upstream internals, or raw sensitive content.
6. Retry behavior is bounded and is used only for safe retryable failures.
  Authentication, authorization, validation, and model-configuration errors
   are not retried.
7. Member requests cannot supply another member's records or invoke a
  state-changing tool. Librarian suggestions remain subject to explicit
   approval.
8. Prompts and retrieved application text are treated as untrusted data and
  cannot authorize tool calls, override server policy, or change user scope.
9. Automated tests cover request construction, response validation, error
  mapping, timeout/retry behavior, secret non-disclosure, prompt injection,
   unauthorized tool calls, and cross-member isolation.
10. Local verification uses mocks or a controlled test double; real API keys
  are never committed, placed in test fixtures, or printed in output.



## Five-layer reliability architecture

LLMs are unreliable: they may return invalid formats, hallucinated data,
partial answers, refusals, or inconsistent results. Every feature must sandwich
the provider between application-controlled layers:

```text
Input Validation
    -> Prompt Construction
    -> SoCLaaS LLM Call
    -> Output Parsing
    -> Business Logic Validation
    -> Application
```

1. **Input validation:** validate types, required fields, ownership, length,
  rate limits, and basic content signals before spending tokens. Content
   filters are only a supplemental signal, not an authorization boundary.
2. **Prompt construction:** define the role, allowed task, forbidden authority,
  expected format, and uncertainty behavior. Delimit user and retrieved text
   as untrusted data. For structured output, request only the required JSON.
3. **LLM call:** use the server adapter with a timeout, bounded exponential
  backoff, retry policy, and circuit breaker. The adapter never mutates state.
4. **Output parsing:** validate the response shape and schema. A bounded repair
  attempt may ask the model to correct malformed structured output, but the
   repaired result must be parsed and validated again.
5. **Business validation:** check identifiers, ownership, permissions, allowed
  statuses, and domain rules against trusted server state. Reject hallucinated
   or unsupported results before application use.

Malformed or unsafe output must produce a safe fallback, uncertainty state, or
unavailable response. It must never crash the application or authorize a
mutation. Regex extraction is allowed only as a bounded parsing convenience
followed by schema validation.

## Technical specifications



### Implementation baseline and style

- Use the existing React/TypeScript client, Express/TypeScript server, and
Firestore architecture. Keep provider access in a server integration module
such as `apps/api/src/integrations/soclaas/client.ts`.
- Keep configuration, transport, parsing, prompt construction, validation, and
authorization independently testable. Use typed interfaces/schemas rather
than `any` or prompt-only checks.
- Do not place provider calls in React components, browser API modules, or
persistence repositories.

Verification commands:

```text
npm run build
npm test
```



### Architecture boundary

Required call path:

```text
React client
    -> authenticated Express route
    -> domain service and authorization policy
    -> SoCLaaS adapter
    -> SoCLaaS API
```

The browser never calls SoCLaaS. Express owns authentication, authorization,
limits, tool allowlists, prompt assembly, approval gates, audit metadata, and
provider-error translation. Provider HTTP details are not duplicated in routes
or UI code.

### Configuration and secrets

The adapter requires the following server-side configuration:


| Configuration                | Required behavior                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SOCLAAS_API_KEY`            | Secret Bearer credential. Read only by the server runtime.                                                                         |
| `SOCLAAS_BASE_URL`           | SoCLaaS API base URL including the `/v1` path. The supplied service URL is `https://soclaas-api.comp.nus.edu.sg/v1`.               |
| Approved model configuration | One or more model names approved for this application and API key. The client must not accept an arbitrary model from the browser. |


The runtime must fail closed when the API key or base URL is missing or
malformed. A deployment may choose to disable the AI feature instead of
failing the whole server, but that choice must be explicit and must produce a
clear unavailable-model response to users.

API keys must be supplied through environment configuration or a secret
manager. They must not be committed to Git, embedded in React or mobile code,
included in prompts, written to audit records, or included in error messages.

Development and production credentials and provider configuration remain
separate, consistent with `Overview.md`.

The confirmed SoCLaaS provider limit is **90 requests per minute**. Treat this
as a shared cap for application traffic using the credential, not as a
per-user allowance. The application-level global limiter must be configurable
at or below this cap, with a separate lower per-user limit where needed.

### Provider API contract

The provider base URL is the configured `SOCLAAS_BASE_URL`. The adapter uses
these endpoints:


| Method | Path                | Purpose                                   |
| ------ | ------------------- | ----------------------------------------- |
| `GET`  | `/models`           | Discover models available to the API key. |
| `POST` | `/chat/completions` | Request a chat completion.                |


Every request includes:

```http
Authorization: Bearer <SOCLAAS_API_KEY>
Content-Type: application/json
```

The minimum completion body is:

```json
{
  "model": "<configured-approved-model>",
  "messages": [
    { "role": "user", "content": "Say hello in one sentence." }
  ],
  "reasoning_effort": "none"
}
```

The example model name is illustrative only. Implementations must use a model
name approved for the current key and deployment. Approved names may be
verified with `GET /models` during setup or an operational health check; model
selection for a user request remains server-controlled.

Streaming is not part of this initial contract. If streaming is required, it
must be added as a separately reviewed extension with response framing,
timeout, cancellation, moderation, and partial-output rules.

### Adapter interface

The application-facing adapter should expose a provider-neutral interface
similar to the following. Names may be adapted to the project's conventions,
but callers must not construct provider HTTP requests themselves.

```ts
export type SoCLlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type SoCLlmRequest = {
  feature: "member-assistant" | "librarian-assistant";
  messages: SoCLlmMessage[];
  model?: never; // model selection is server configuration
};

export type SoCLlmResult = {
  content: string;
  model: string;
};

export interface SoCLlmClient {
  complete(request: SoCLlmRequest): Promise<SoCLlmResult>;
}
```

The adapter should build the provider body from validated server inputs, set
`reasoning_effort` to `"none"` unless a separately approved feature requires
another value, and parse the first assistant message from the completion
response. It must reject a missing, non-string, or otherwise malformed content
field rather than passing malformed output to the UI or a downstream action.

An implementation may use the server runtime's `fetch` because the current
repository does not depend on the OpenAI client library. Adding a provider SDK
is an Ask-first change under this specification.

### Error handling

The adapter must normalize provider and transport failures into internal error
categories without forwarding raw provider bodies:


| Condition                                | Adapter behavior                                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Missing or malformed local configuration | Fail closed; emit a safe configuration error and do not call the provider.                                                   |
| `400 Bad Request`                        | Treat as an adapter/request contract failure; do not blindly retry.                                                          |
| `401 Unauthorized`                       | Treat the key as invalid, missing, or revoked; do not retry.                                                                 |
| `403 Forbidden`                          | Treat as an access or model-approval failure; do not retry.                                                                  |
| `429 Too Many Requests`                  | Retry only according to the bounded policy and valid provider guidance; otherwise return an unavailable/rate-limited result. |
| `5xx` provider response                  | Retry only when the operation is safe and the retry budget remains; otherwise return an unavailable result.                  |
| Network error or timeout                 | Retry only when safe and within the retry budget; otherwise return an unavailable result.                                    |
| Malformed success response               | Reject it as an upstream contract failure; do not pass it downstream.                                                        |


The user-facing API should return the existing application error envelope and a
generic actionable message such as AI unavailable or AI configuration error.
It must not reveal the API key, authorization header, raw prompt, raw provider
response, stack trace, or sensitive record contents.

Exact timeout, retry-count, backoff, and application rate-limit values must be
configured and documented before implementation. The global application limit
must not exceed the confirmed provider cap of 90 requests per minute.

### Output and approval boundary

Model output is untrusted. The server must validate structured output against a
schema and safely reject malformed, incomplete, or unsupported results.

For librarian workflows, the model may summarize facts and draft a notification
or follow-up action, but it must not:

- confirm a return or loss;
- change copy/account status, issue or waive a fine, or send a notification;
- create, modify, or delete a loan, reservation, or catalog record.

Those actions require a separately authorized server request and explicit human
approval. A system prompt or model field is not an authorization boundary.

## Integration specifications



### Member assistant flow

1. An authenticated route resolves the actor from the server-side session;
  client-supplied identity or role fields are ignored.
2. The service retrieves only the minimum authorized data, validates any
  read-only tool arguments, and calls `SoCLlmClient.complete` with untrusted
   text clearly delimited.
3. The five-layer pipeline returns an advisory answer or safe fallback. No
  library state is changed.

The member assistant must not access another member's account, loans, fines,
reservations, notifications, password data, or session data.

### Librarian assistant flow

1. An authenticated route authorizes the selected pending reports and related
  records using the server-loaded actor.
2. The service sends only the minimum necessary context and labels the
  validated result as a suggestion.
3. A separate authorized server request performs a consequential action only
  after explicit librarian approval.



### Audit metadata

Record only safe metadata needed for operations and accountability:

- actor reference, feature, model, timestamps, and correlation ID;
- success/failure category, retry count, and approval outcome where applicable.

Never store keys, authorization headers, passwords, session identifiers,
unrelated personal data, or raw prompts/responses by default. Retention of raw
content requires a separate privacy decision.

### Testing and verification

Use a mocked provider for automated tests; real credentials are not required.
Cover:

- **Unit:** configuration, request construction, model allowlisting, parsing,
schemas, error mapping, retries, circuit breaking, and redaction.
- **Integration:** authenticated role routes, fallbacks, server authorization,
and no direct browser/provider call.
- **Security:** direct/indirect prompt injection, obfuscation, unauthorized
tools, cross-member access, secret disclosure, and mutation attempts.
- **Operations:** request/rate limits, `429`/`5xx`, safe logs, and missing
configuration.
- **Manual smoke:** with credentials supplied outside the repository, list
models and send one minimal completion using an approved model.

Repository verification commands are:

```text
npm run build
npm test
```

The automated suite must not depend on the availability of the external SoC
LLM service.

## Boundaries

- **Always:** call SoCLaaS only from the server; use configured approved
models; validate inputs and outputs; enforce actor and record authorization;
minimize data; apply bounded timeouts/retries/rate limits; keep secrets out
of logs and source control; require human approval for consequential actions;
run build, tests, and secret scans.
- **Ask first:** add or change provider SDK dependencies; change the provider,
endpoint, model policy, or data-retention policy; enable streaming; change
timeout/retry/rate-limit defaults; add a tool that can mutate state; expose
new personal data to the model; change audit metadata or deployment
topology.
- **Never:** expose the API key to the browser; commit or print credentials;
put secrets in prompts; trust model output as authorization; let untrusted
text authorize tools; access unrelated members' records; log raw sensitive
prompts/responses by default; retry mutations because a completion was
retried; use an unapproved model silently.



## Out of scope

- The detailed UX, prompt wording, or domain behavior of the member assistant.
- The detailed UX, prompt wording, or approval UI of the librarian assistant.
- New library entities, Firestore schema changes, or state-machine changes.
- Direct browser-to-SoCLaaS access.
- Streaming completions.
- Automatic model fallback to an unapproved model.
- Persistent storage of raw prompts or model responses.
- Provider-specific privacy, quota, or operational details beyond the supplied
API contract.



## Risks and tradeoffs

- A server-side adapter adds a boundary and test surface, but prevents provider
credentials and provider-specific behavior from spreading through the client
and route code.
- Strict data minimization may reduce answer quality; the service should prefer
an explicit no-result or uncertainty response over sending unrelated data.
- Bounded retries improve resilience against transient provider failures but can
increase latency and quota usage; values must be measured and configured.
- Provider model availability and quotas may change. Configuration and health
checks must fail clearly rather than silently selecting a different model.
- Prompt-injection defenses reduce risk but cannot make model text trusted;
authorization must remain in typed server code and normal approval flows.



## Open decisions

1. Select the exact approved model name or feature-to-model mapping for each
  deployment.
2. Set numeric values for request/context limits, timeout, retry count,
  backoff, and per-user rate limit; keep the global application limit at or
  below the confirmed 90 requests/minute provider cap.
3. Decide whether missing provider configuration disables only AI routes or
  prevents the API server from starting.
4. Confirm the final application error codes used for provider-unavailable and
  provider-configuration failures.
5. Confirm whether any non-sensitive completion metadata beyond the fields in
  this design must be retained for operations or assessment.



## Amendments



### 2026-10-17 — Add reliability architecture and reduce redundancy

- Added the five-layer pipeline: input validation, prompt construction, LLM
call, output parsing, and business-logic validation.
- Added bounded output repair, graceful degradation, exponential backoff, and
circuit-breaker guidance.
- Consolidated duplicate model-selection, retry-safety, and implementation
structure guidance while preserving the provider contract and security rules.
- Clarified that observability must use safe metadata rather than raw prompts,
responses, credentials, or private records.

### 2026-10-17 — Record provider rate limit

- Recorded the confirmed SoCLaaS limit of 90 requests per minute.
- Clarified that the limit is shared application traffic and that the
  application limiter must not exceed it.



## Context reviewed

- `Overview.md` — product scope, account types, bounded AI features, data
minimization, approval requirements, and deployment constraints.
- `PLAN.md` — server-side adapter requirement, role-specific AI boundaries,
common AI controls, testing strategy, and implementation boundaries.
- `package.json` — current React/Express/TypeScript stack and absence of an
OpenAI client dependency.
- `AGENTS.md` — repository instruction to use `Overview.md` for application
details.
- User-provided SoCLaaS API reference — access requirements, public base URL,
model discovery, chat-completion request shape, environment variables, and
provider error categories.

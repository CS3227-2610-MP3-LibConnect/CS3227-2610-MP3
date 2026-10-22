# Independent Review Report: librarian-ai-assistant

## Current follow-up verdict

`PASS WITH RESIDUAL RISK` for remediation commit `677b9b8`. The two prior
provider-adapter findings are fixed and independently verified. No new
release-blocking finding was identified.

This is a review disposition, not merge approval. A human must decide whether
to merge, request further changes, or accept the remaining documented risks.

## Historical initial review verdict

The initial review of `81a8566` was `FAIL` because the circuit breaker did not
retain retryable failures across successful requests and provider response
bodies were fully buffered before the size check.

The historical findings and original verification evidence remain below for
traceability.

## Scope and provenance

- Approved specification: `PlanDraft/Specs/LibrarianFeatures/AI/LibrarianAssistant.md` `0.2-approved`.
- Approved checklist: `workflow/tasks/librarian-ai-assistant/tasks.md` `0.1-approved`.
- Handoff and implementation evidence: `workflow/tasks/librarian-ai-assistant/{handoff.md,implementation-report.md,security-review.md}`.
- Initial implementation reviewed: commit `81a8566` (`feat: add librarian AI review assistant`).
- Follow-up implementation reviewed: commit `677b9b8` (`fix: harden librarian AI provider failure handling`).
- Follow-up review worktree: `/Users/camelliaaa/.codex/worktrees/librarian-ai-rereview/CS3227-2610-MP3`, clean and pinned to `677b9b8`.
- Evidence/report worktree: `/Users/camelliaaa/Desktop/NUS/Courses/Y4S1/CS3227/CS3227-2610-MP3`; production source remains unchanged, with only review/evidence artifacts staged.
- Review skill: `ai-security-review`.
- Review permissions: source/evidence read access; review report, security addendum, and factual log writes only. No production source, tests, dependencies, deployment, external service, commit, push, or merge action was performed.

The managed follow-up worktree did not have dependencies and its generated
files were read-only, so its direct build attempt was not used for execution.
As a compensating control, executable checks ran in the primary checkout whose
production source is the reviewed commit; only review/evidence artifacts were
present as staged changes.

## Acceptance trace

| Criteria | Independent result |
|---|---|
| A-1–A-4 | Pass by inspection and focused contract/context/route tests: server-loaded active librarian, strict schemas, current loan/copy/member reads, and minimum context. |
| A-5–A-8 | Pass by inspection and service/UI tests: server-matched advisory output, server-owned draft metadata, no assistant write path, explicit reviewed send through the normal notification route. |
| A-9–A-10 | Pass: browser code has no provider/Firestore access; adapter fixes `gemma4:26b` and keeps credentials server-side. |
| A-11–A-13 | Pass for tested paths: malformed/tool-like/model-authority output is rejected; action/report matching and request-scoped context prevent tested cross-boundary paths. |
| A-14 | Pass after remediation: rate, timeout, retry, rolling-window circuit, bounded response-body, and generic failure controls are present and tested. |
| A-15 | Partial: provider-call metadata is bounded and secret-free; no durable feature-level audit sink is authorized or demonstrated, so safe console metadata remains an operational residual risk. |
| A-16–A-18 | Pass for implemented UI, regression, and evidence behavior after remediation. |

## Follow-up findings

No new must-fix or should-fix finding was identified in `677b9b8`.

### Remediation verification

- S1 fixed: retryable failure timestamps are retained across successful calls
  and pruned only by the approved 60-second window. The independent probe
  observed `providerCallsBeforeFinal=14`, `providerCallsAfterFinal=14`, and
  `circuitSuppressed=true` after five interleaved failures.
- S2 fixed: response `Content-Length` is rejected before parsing when too
  large; otherwise the streaming reader stops and cancels when the 16 KB cap
  is crossed. The provider regression verified two reads and cancellation.

## Historical initial findings

### [S1] Circuit breaker resets the approved rolling failure window

- Severity: `MUST-FIX BEFORE RELEASE`
- Boundary: provider adapter availability/cost control.
- Location: `apps/api/src/integrations/soclaas/client.ts:149` and `182–186`.
- Attack path: cause retryable provider failures separated by successful
  requests, for example five failed requests within 60 seconds with a success
  between failures.
- Impact: the approved circuit never opens in this pattern, so a degraded
  provider can continue receiving requests and the assistant can consume
  latency/quota beyond the approved circuit policy. This is an operational
  availability/cost-control failure, not a model authorization bypass.
- Reproduction: an independent deterministic probe issued five retryable
  failures interleaved with successful requests using unique actor IDs; the
  following request still made a provider call (`providerCallsBeforeFinal=20`,
  `providerCallsAfterFinal=22`, `circuitSuppressed=false`).
- Required fix: retain all retryable failure timestamps in the approved
  60-second rolling window and open after five, or obtain a separately
  approved specification amendment changing the policy to consecutive
  failures. Add a regression test with interleaved failures and successes.
- Residual risk: until fixed, intermittent provider degradation is not bounded
  by the approved circuit threshold.

### [S2] Provider response parsing is not bounded before buffering

- Severity: `SHOULD-FIX BEFORE RELEASE`
- Boundary: SoCLaaS response → server process.
- Location: `apps/api/src/integrations/soclaas/client.ts:200–203`.
- Attack path: a provider or intermediary returns a very large JSON body. The
  implementation calls `response.json()` before checking the returned content
  length.
- Impact: a malformed/oversized provider response can consume memory before
  the existing 16 KB content check rejects it, creating avoidable process
  pressure or denial of service.
- Required fix: enforce a bounded response body before JSON parsing (for
  example with a validated content-length plus a streaming byte cap), and add
  a provider test for an oversized body rather than only oversized parsed
  content.
- Residual risk: the current post-parse length check still prevents oversized
  model content from reaching the service, but it does not bound buffering.

## Security controls confirmed

- Assistant routes use the existing server-loaded active-actor and librarian
  middleware; client role, manager, recipient, approval, model, and provider
  fields are not trusted.
- Context retrieval is server-side and request-scoped. It validates pending
  close state, `IN_TRANSIT` copy state, ISBN relationship, and member
  relationship, and serializes only the approved minimum fields.
- The model has no tool dispatcher. Structured output is strict, matched to
  current report IDs/types, and attached to server-owned notification fields
  only after validation.
- The UI labels output advisory/untrusted, renders it as text, supports edit,
  requires confirmation, and calls the existing idempotent message route.
- Provider errors are mapped without upstream bodies, prompts, credentials, or
  raw responses in returned errors or audit metadata.

## Verification

Commands run independently:

- `npm run build` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `node --test tests/librarian-ai-provider.test.mjs tests/librarian-ai-contracts.test.mjs tests/librarian-ai-service.test.mjs tests/librarian-ai-client.test.mjs tests/librarian-ai-ui.test.mjs tests/librarian-ai-security.test.mjs` — passed, 22/22.
- `node --test tests/librarian-ai-routes.test.mjs` — passed, 3/3, with approved elevated local-listener permission.
- `npm test` — passed, 133/133, with approved elevated local-listener permission.
- `git diff --check 81a8566^ 81a8566` — passed.
- Secret-pattern scan — no real provider/API/private-key/bearer-token material found; the only matching test text is the synthetic provider-key sentinel used by the provider test.
- Independent circuit probe — reproduced S1.

Follow-up verification for `677b9b8`:

- `node --test tests/librarian-ai-provider.test.mjs` — passed, 8/8.
- All focused AI suites — passed, 24/24.
- `node --test tests/librarian-ai-routes.test.mjs` — passed, 3/3, with
  approved elevated local-listener permission.
- `npm test` — passed, 135/135, with approved elevated local-listener
  permission.
- `git diff --check e7bdb05 677b9b8` — passed for the remediation diff.
- Independent circuit probe — confirmed circuit suppression after the
  interleaved-failure threshold.
- Secret-pattern scan — no real provider/API/private-key/bearer-token material
  found; the only matching test text is the synthetic provider-key sentinel.

The first non-elevated full-suite attempt was stopped after route tests
remained pending for the sandbox listener restriction; it reported 87 passes
and nine cancelled route-test files. The elevated rerun completed successfully.

## Residual risks and human gate

- The implementer’s controlled live provider smoke and unavailable emulator
  evidence remain evidence claims, not substitutes for this review.
- Stored catalog text can still influence model wording despite delimiters,
  generated wording may be misleading, and librarians may over-trust a valid-
  looking draft. These remain advisory risks and cannot authorize writes.
- The approved design has no durable AI audit collection; provider calls emit
  safe structured operational metadata only. Retention/access for those logs
  remains an operational decision.
- Emulator smoke evidence remains unavailable/unverified; this does not alter
  the passing deterministic suite results.
- A human must decide whether to merge, request changes, or accept these
  residual risks. The reviewer does not approve or merge the implementation.

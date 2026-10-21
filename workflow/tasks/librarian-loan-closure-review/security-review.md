# Security Review: librarian-loan-closure-review

## Scope and assumptions

- Feature and roles: active members report their own active loans; active
  librarians create loans and review pending return/loss reports.
- Intended capabilities: transactional loan/copy transitions, minimal
  reservation handoff, and server-owned lost-book fine creation.
- Sensitive data: password hashes, session data, account authorization fields,
  member ownership, fines, and notification recipients.
- Irreversible or externally visible actions: closing a loan, marking a copy
  lost or reserved, creating a fine, and creating a reservation-ready
  notification.
- No AI model, prompt, tool, retrieved external content, or external side
  effect is introduced by this task. AI-specific prompt-injection tests are
  therefore not applicable to this implementation.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Browser to Express | IDs, report type, decision, disposition, forged role/status fields | Unauthorized transition or data exposure | Strict schemas; server-loaded active actor; safe DTOs | `apps/api/src/routes/circulation.ts`, `apps/api/src/http/circulation-contracts.ts`; route and contract tests pass |
| Session to authorization | Session user ID and stale session role | Confused-deputy or inactive-account access | Reload the user from Firestore and compare the stored role/status | `apps/api/src/http/auth.ts`; full route regression passes |
| Express to Firestore | Current loan, copy, reservation, member, and side-effect records | Partial writes or duplicate fine/notification | Firestore transactions and deterministic side-effect IDs | `apps/api/src/storage/workflows.ts`; Java 21 emulator workflow passes |
| Stored catalog/member text | Book title and member identifiers | Response injection or unintended instruction handling | Treat stored values as data; allowlisted response fields | Safe DTO tests and client source scan pass |
| Deployment configuration | Fine environment value and Firestore indexes | Wrong fine policy or production query failures | Explicit production policy and reviewed index manifest | Findings R-1 and R-2 in the review report |

## Findings

No AI-specific security finding was identified because no AI boundary is part
of this task. The server authorization and browser-to-server controls were
verified by source inspection and passing denial/contract tests. Operational
release findings are recorded in the review report rather than treated as
prompt or model risks.

## Test plan

- Direct injection: N/A; no model or prompt boundary was added.
- Indirect injection from stored or retrieved content: N/A for this feature;
  stored titles are serialized as data and are not interpreted as instructions.
- Multi-turn or obfuscated escalation: N/A; no agent or model action exists.
- Cross-role and cross-user denial: passed through circulation route tests and
  active-actor regression tests.
- Malformed output and tool arguments: strict request schemas and safe DTO
  tests passed; no tools are exposed.
- Rate limits, timeout, and provider failure: N/A; no model provider is used.
- Safe logging and secret scanning: source/tests contain no production
  credentials or session material; response canaries exclude password hashes
  and session IDs.

## Release gates

- Model cannot authorize protected writes or external side effects: N/A; no
  model is present.
- Tools are allowlisted, schema-validated, authenticated, authorized, and
  logged: N/A; no tools are present.
- Human approval is required for consequential actions: satisfied for this
  independent review; merge, deployment, and residual-risk acceptance remain
  human decisions.
- Residual risks are accepted by: not yet accepted; see review findings.

## Independent reviewer update — 2026-10-21

The reviewer applied this procedure to the captured implementation snapshot.
Server-side actor reload, librarian/member role checks, member ownership,
current-state transaction guards, strict request schemas, safe DTOs, Origin
protection, and the absence of client Firestore access or client fine/role
authority were confirmed by source inspection and passing tests.

The following security-relevant findings remain open and are recorded in the
review report:

- The implementation has no immutable commit, so the reviewed authorization
  state cannot yet be reproduced as a merge target.
- The pending queue and pending-reservation selection paths load unbounded
  Firestore result sets before applying response limits, creating a resource
  exhaustion and transaction-size risk.
- The required negative and race test matrix is incomplete despite the
  implementation evidence marking all tasks complete.

No AI/model/prompt/tool boundary exists in this feature, so injection-specific
AI tests remain not applicable. Human merge, deployment, production fine
configuration, and residual-risk acceptance remain outstanding.

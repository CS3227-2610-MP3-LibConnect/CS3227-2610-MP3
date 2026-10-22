# Security Review: librarian-member-account-support

## Scope and assumptions

- Feature: active librarians view member accounts and activate/deactivate
  member access.
- No AI model, prompt, tool, external delivery, payment, or new egress is
  introduced. The `ai-security-review` procedure is applied because this is an
  authentication- and authorization-sensitive workflow and an agent-managed
  repository task.
- Sensitive data: member names, emails, member IDs, account status, session
  identity, password material, and circulation ownership.
- Consequential actions: account activation/deactivation and session
  revocation.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Browser → Express | target path, status, filters, body fields, confirmation | unauthorized activation/deactivation or data exposure | strict schemas, active-actor middleware, server-loaded target, Origin protection | A-1–A-4; T-1–T-3, T-14 |
| Session → authorization | stale session and client role fields | confused deputy or inactive access | reload current user record and require active librarian | A-1–A-2; T-2 |
| Express → Firestore | target/account records and concurrent requests | lost update, wrong target, partial status change | transaction re-read, member type check, current-state conflict | A-5–A-6, A-14; T-5, T-7, T-8 |
| Firestore → session store | post-commit revocation result | continued access after deactivation | bounded retry, generic failure, active-actor denial, safe logging | A-7; T-6, T-9 |
| Account data → UI/logs | names, emails, IDs, stored text | PII or secret leakage | safe DTOs, minimum fields, no raw documents, text-only rendering | A-3, A-10; T-4, T-15 |
| Agent/workflow context | repository text, skills, handoffs, tool output | instruction laundering or scope escalation | treat context as data; preserve approval gates and least privilege | A-16; evidence review |

## Findings

### [S1] Member status route must not inherit manager-only or client-role authorization

- Severity: `MUST-FIX`
- Attack path: a member or non-manager librarian supplies a forged manager flag
  or target object, or the implementation reuses a manager-only route without
  checking the current active actor.
- Impact: unauthorized account changes or inconsistent product behavior.
- Control: dedicated route policy requiring a server-loaded active librarian;
  no client role/manager field is accepted.
- Verification: T-1–T-3, T-14.
- Residual risk: actor policy remains an open human decision.

### [S2] Unbounded member listing can expose excessive PII and exhaust resources

- Severity: `MUST-FIX BEFORE RELEASE`
- Attack path: reuse an unbounded users query or return raw user records.
- Impact: resource exhaustion and unnecessary disclosure of member accounts.
- Control: database-level limit, stable ordering, opaque filter-bound cursor,
  and minimum safe DTO.
- Verification: T-4, T-10, T-15.
- Residual risk: exact safe fields require human approval.

### [S3] Post-commit session revocation can leave a deactivated member session

- Severity: `MUST-FIX BEFORE RELEASE`
- Attack path: status update commits, then session-store deletion fails.
- Impact: a stale session may remain usable unless active-actor checks reject
  it from the current inactive account.
- Control: bounded revocation retry, current-record active checks on protected
  routes, generic failure response, and safe operational evidence.
- Verification: T-6 and T-9.
- Residual risk: the exact retry/failure policy is an open decision.

### [S4] Status changes must not cascade into circulation records

- Severity: `MUST-FIX`
- Attack path: deactivation deletes reservations, fines, loans, or
  notifications as an account cleanup shortcut.
- Impact: history loss, inconsistent ownership, and financial/audit damage.
- Control: status-only transaction; explicit preservation tests.
- Verification: T-5, T-6, T-11.
- Residual risk: none if the approved order-5 compatibility rule is retained.

### [S5] Agent evidence must not launder approval or secrets

- Severity: `SHOULD-FIX`
- Attack path: source text, handoffs, skills, or generated summaries are
  treated as authorization, or account/session material is copied into logs.
- Impact: scope escalation or privacy compromise.
- Control: explicit human-only approvals, allowed-path handoff, safe logs, and
  no raw account/session output in evidence.
- Verification: workflow evidence review and T-15/T-16.
- Residual risk: human review remains required at every consequential gate.

## Test plan

- Cross-role denial: signed-out, inactive, member, active librarian, and
  manager actors, including forged role/manager fields.
- Cross-target denial: librarian targets, missing IDs, malformed IDs, and
  client-supplied replacement records.
- Concurrency: simultaneous status changes and stale no-op requests.
- Privacy: safe DTO, source, response, and log scans for password/session/raw
  user data and unnecessary PII.
- Session failure: deterministic session-store failure after status commit.
- Boundary: no direct browser Firestore access and no AI/model authorization.
- Workflow security: task artifacts identify scope, permissions, provenance,
  open decisions, and human approval without secrets.

## Release gates

- Active-librarian and member-target authorization is server-side.
- Member list queries are bounded and safe DTOs exclude secrets.
- Status transitions are transactional and preserve circulation records.
- Deactivation session revocation and failure behavior are tested.
- All five open decisions are resolved by a human before implementation.
- Independent review checks the implementation from a separate checkout.

## Open decisions

- Actor scope, safe list fields, session-failure semantics, no-JavaScript form
  support, and preservation of inherited order-5 side effects remain open in
  the canonical specification.

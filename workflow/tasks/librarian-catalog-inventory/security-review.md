# Security Review: librarian-catalog-inventory

This feature is authorization- and state-integrity-sensitive. It introduces no
LLM, model prompt, model tool, external egress, payment, notification, or
AI-authorized action.

## Scope and assumptions

- Feature and roles: active librarians manage books and physical-copy metadata;
  active members and librarians read catalog/availability data according to the
  approved authenticated-read policy.
- Intended capabilities: validated catalog search, safe book/copy CRUD,
  server-computed availability and inventory summary, and protected UI flows.
- Sensitive data: Firebase Admin access, account/session material, and any
  unrelated user data accidentally returned by a repository or response.
- Irreversible or externally visible actions: deleting a book/copy and
  changing catalog metadata; circulation status and history remain outside
  this feature.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Browser/API request | Path IDs, filters, body fields, Origin, stale UI state | Unauthorized mutation, target substitution, parser abuse | Origin/session checks, strict schemas, server-loaded actor | T-1/T-2/T-3 |
| Session/identity | Session cookie and stored user ID | Inactive or wrong-role access | Reload current account and enforce active/role policy | T-1 |
| Firestore relationship/state | Concurrent book/copy/reservation/status changes | Dangling references or unsafe deletion | Transactional parent/reference guards and current-status read | T-5/T-6/T-9/T-10 |
| Response/client boundary | Catalog text and stored record fields | Credential/private-data disclosure or false UI state | Safe DTOs, no direct Firestore client, generic errors | T-12/T-16 |
| Search/pagination | Large filters, forged cursors, repeated scans | Excessive reads or inconsistent pages | Bounded input, max page size, opaque same-filter cursor | T-11 |
| Workflow/evidence | Specs, source text, handoffs, tool output | Scope laundering or secret leakage | Human gates, provenance, redaction, exact evidence | Handoff and logs |

## Findings

### [S1] Client-controlled authorization or target data

- Severity: `MUST-FIX`
- Boundary: Browser/API request to server authorization.
- Attack path: A member or inactive librarian submits `isManager`,
  `accountType`, `accountStatus`, a replacement book/copy object, or a forged
  target ID to obtain a mutation.
- Impact: Unauthorized catalog changes or confused-deputy writes.
- Enforcement location: Server session/account reload, active-librarian
  middleware, strict request schemas, and server-owned path/record identity.
- Regression test: T-1 and T-2, including no repository call on rejected input.
- Human decision: None; this is a required security baseline.

### [S2] TOCTOU deletion and dangling relationships

- Severity: `MUST-FIX`
- Boundary: Repository transaction to Firestore relationship state.
- Attack path: A book is deleted while a copy or reservation is created, or a
  copy status changes after a deletion check.
- Impact: Orphaned records, historical inconsistency, or deletion of an
  in-use copy.
- Enforcement location: Firestore transactions that read the parent/reference
  state and coordinate through the parent book; current-status check at commit.
- Regression test: T-6 and T-10 with emulator-backed concurrency where
  available.
- Human decision: None; required by the plan's transaction baseline.

### [S3] Generic CRUD bypasses circulation state ownership

- Severity: `MUST-FIX`
- Boundary: Inventory metadata route to circulation state machine.
- Attack path: A client submits `status: AVAILABLE` or `status: RESERVED` to a
  generic copy update to bypass loan, reservation, or return/loss rules.
- Impact: A copy can become falsely lendable or lose its circulation history.
- Enforcement location: Strict shelf-only copy update schema and repository
  policy; future circulation workflows own status transitions.
- Regression test: T-8 and T-9.
- Human decision: Changing this boundary requires a specification amendment.

### [S4] Sensitive or unrelated record disclosure

- Severity: `MUST-FIX`
- Boundary: Firestore records to JSON/client/evidence.
- Attack path: A broad document serializer returns user fields, session data,
  credentials, or internal Firestore values along with catalog data.
- Impact: Account compromise or privacy breach.
- Enforcement location: Explicit response DTOs, server-only Firestore access,
  generic internal errors, secret/evidence review.
- Regression test: T-12 and T-16.
- Human decision: None; required security baseline.

### [S5] Bounded search and cursor abuse

- Severity: `SHOULD-FIX`
- Boundary: Query/pagination input to Firestore reads.
- Attack path: Excessive limits, malformed cursors, or filter changes across
  pages cause unbounded reads or duplicate/inconsistent results.
- Impact: Resource exhaustion or confusing availability information.
- Enforcement location: Bounded strict schemas, maximum page size, opaque
  cursor filter binding, and production monitoring/rate limits if needed.
- Regression test: T-3 and T-11.
- Human decision: Production-scale search/index changes require approval.

## Test plan

- Direct injection: No model is present; test request/body/path injection and
  unknown-field rejection instead.
- Indirect injection from stored/retrieved content: Catalog text is displayed
  as data only; verify it cannot add UI actions, server permissions, or
  evidence instructions.
- Multi-turn or obfuscated escalation: Not applicable to runtime AI; workflow
  handoffs and repository text remain untrusted and cannot authorize writes.
- Cross-role and cross-user denial: Signed-out, inactive, member, and active
  librarian matrix; forged role/target fields must not alter authorization.
- Malformed output and tool arguments: No model/tools; validate all HTTP DTOs,
  IDs, filters, cursors, and response serialization.
- Rate limits, timeout, and provider failure: No provider introduced; test
  bounded pagination and generic repository failure behavior.
- Safe logging and secret scanning: No credentials, password/session material,
  or unrelated personal data in responses, tests, logs, or task evidence.

## Release gates

- Server authorization is independent of React and client account fields.
- Firestore mutations are server-only and transaction-guarded where linked
  records or current state are involved.
- Generic inventory CRUD cannot alter circulation-owned status.
- Human approval is required for the specification, open decisions, checklist,
  implementation, independent review, residual risks, and merge.
- Residual risks are accepted by: Pending implementation/review and final
  human merge decision; no residual risk is accepted by this draft.

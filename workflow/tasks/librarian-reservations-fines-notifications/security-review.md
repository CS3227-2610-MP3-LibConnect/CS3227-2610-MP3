# Security Review: librarian-reservations-fines-notifications

## Scope and assumptions

- Feature and roles: active librarians manage reservation/fine operational
  views, waive eligible fines, and send member messages; active members own
  reservation, payment, and notification operations; a trusted worker handles
  expiry and approved overdue processing.
- Intended capabilities: bounded reads, server-authorized state transitions,
  durable in-app notifications, and retry-safe scheduled processing.
- Sensitive data: member ownership, member IDs, fine amounts, notification
  recipients and messages, session identity, and account authorization fields.
- Irreversible or externally visible actions: fine waiver/payment, reservation
  cancellation/expiry, notification creation, and overdue fine issuance.
- No AI model, prompt, tool, retrieved external content, or model-authorized
  write is introduced by this task. AI injection tests are not applicable;
  ordinary authorization, privacy, and workflow security tests are required.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Browser to Express | IDs, filters, messages, fine/recipient/status fields, confirmation, idempotency key | Forged waiver, message to wrong member, data exposure, duplicate write | Strict schemas; server-loaded actor; recipient/member resolution; bounded input; explicit idempotency | Canonical spec A-1–A-3, A-12, A-15, T-1–T-3, T-12, T-17 |
| Session to authorization | Session user ID and stale client role | Confused deputy or inactive-account access | Reload current Firestore actor and enforce active role/ownership on every route | Existing active-actor boundary; T-2/T-3 |
| Partial repository methods | Caller-supplied full reservation/notification records | Client-controlled recipient, status, timestamp, or wrong-role mutation | Do not expose generic methods; add dedicated commands with server-owned fields | Conflict audit; findings S1/S2 below |
| Express to Firestore | Current reservation/fine/notification/copy/user records | Partial writes, races, duplicate charges/messages | Transactions, bounded queries, current-state re-reads, unique active reservation guard, deterministic IDs | Canonical A-4–A-15, T-4–T-14 |
| Scheduler/worker | Trigger timing, retries, batch size, policy configuration | Duplicate fines, stale releases, unbounded work, wrong charges | Authenticated worker, bounded batches, fail-closed policy, idempotent transactions, aggregate logs | Canonical A-7, A-11, A-18; T-7, T-11, T-18 |
| Stored text and evidence | Member message, book title, repository text, handoff/tool output | HTML injection, PII leakage, instruction laundering | Plain-text rendering, safe DTOs, no raw bodies/secrets in logs, treat context as data | Canonical A-13, A-17, T-17 |
| Browser preflight | `Idempotency-Key` required by the message client | Browser blocks a legitimate cross-origin message request before route authorization and idempotency checks | Allow only the approved request headers for the configured client origin and regression-test the exact preflight | `tests/origin-protection.test.mjs` |

## Findings

### [S1] Generic notification write can permit recipient spoofing

- Severity: `MUST-FIX`
- Boundary: Partial storage method to future route boundary.
- Attack path or precondition: A route exposes `putNotification` or accepts a
  full `NotificationRecordSchema` from a caller; the caller supplies another
  member's `recipientUserId` or an invalid reference pair.
- Impact: Cross-member notification disclosure or unauthorized messages.
- Enforcement location: Dedicated server-owned librarian-message and automatic
  event workflows; recipient resolution from current member/user records;
  reference validation inside the transaction. Do not expose `putNotification`
  as a generic public command.
- Regression test or verification: T-1, T-3, T-12, T-13, and T-17.
- Human decision: Required before implementation; policy is already proposed
  in the canonical specification.

### [S2] Partial reservation creator has the wrong authorization boundary

- Severity: `MUST-FIX`
- Boundary: Member reservation creation.
- Attack path or precondition: A librarian-only or client-supplied full-record
  creator is used for member reservation requests.
- Impact: Members cannot create their own reservations through the intended
  boundary, or a caller can forge reservation owner/status/timestamp fields.
- Enforcement location: Member-owned server command; server-generated ID,
  status, timestamps, and member identity; transaction-visible active
  reservation uniqueness guard.
- Regression test or verification: T-3, T-4, T-5, and T-17.
- Human decision: Member-slice owner must confirm the shared contract before
  checklist approval.

### [S3] Generic notification read is broader than the intended policy

- Severity: `MUST-FIX`
- Boundary: Librarian/member notification reads.
- Attack path or precondition: A librarian calls the generic `getNotification`
  method with another member's notification ID.
- Impact: Unauthorized access to member messages and fine/reservation context.
- Enforcement location: Separate member inbox query constrained by the
  server-loaded recipient; no librarian notification-browsing route; librarian
  reads limited to approved operational data.
- Regression test or verification: T-2, T-3, T-15, and T-17.
- Human decision: None if the stated scope is accepted; implementation must
  preserve it.

### [S4] Librarian-message retry identity is unspecified

- Severity: `SHOULD-FIX`
- Boundary: Browser retry to notification creation.
- Attack path or precondition: A network timeout occurs after the server
  commits a message but before the browser receives the response; resubmission
  creates a second message.
- Impact: Duplicate member notifications and ambiguous audit history.
- Enforcement location: Require a bounded `Idempotency-Key` header and persist
  the key/result under trusted server control; reject key reuse with a
  different request payload. Scope the key to the current librarian and
  operation, retain it for seven days, replay identical payloads, and never
  log the raw key.
- Regression test or verification: T-12, T-14, and T-17.
- Human decision: Approved on 2026-10-21; implementation must enforce the
  bounded seven-day replay/mismatch contract.

### [S5] Fine/notification policy is consequential and now fixed

- Severity: `MUST-FIX BEFORE RELEASE`
- Boundary: Worker policy configuration and fine side effects.
- Attack path or precondition: Implementer deviates from the approved overdue
  amount/cutoff, notification side effects, inactive-recipient behavior, or
  worker budget.
- Impact: Incorrect member charges, unexpected notifications, and a source/spec
  conflict.
- Enforcement location: Versioned specification and order-4 amendment;
  server-owned validated configuration; fail-closed production
  startup/worker behavior.
- Regression test or verification: T-11, T-14, T-18, and evidence review.
- Human decision: Approved on 2026-10-21: SGD 5.00 after 72 hours with one
  alert, atomic lost/waiver notifications, minimum-PII reservation lists,
  inactive-recipient retention rules, Cloud Scheduler worker budget, and Jun
  Hong's API `v1` member-slice ownership.

### [S6] Existing list helpers can read unbounded collections

- Severity: `SHOULD-FIX`
- Boundary: Firestore query to librarian/member list response.
- Attack path or precondition: A caller reaches a future reservation, fine, or
  notification/activity list that reuses an existing helper without a database
  `limit` and cursor.
- Impact: Resource exhaustion, slow responses, excessive member-data exposure,
  and larger transaction/read bills.
- Enforcement location: Add bounded database queries, stable ordering, and
  signed/opaque cursors before exposing the list routes; do not slice an
  unbounded result in application memory.
- Regression test or verification: T-6, T-8, T-15, T-18, T-19, plus focused
  query-construction assertions.
- Human decision: None; this is a required implementation control.

### [S7] CORS preflight omitted the approved idempotency header — RESOLVED

- Severity: `P1` feature availability failure in the deployed cross-origin UI.
- Boundary: Browser client to Express origin protection.
- Attack path or precondition: A librarian message submission includes the
  approved `Idempotency-Key` header. The browser sends a preflight, but the
  server advertises only `Content-Type`, so the browser blocks the POST before
  the server can authenticate the actor or persist the idempotency record.
- Impact: Librarians cannot send messages from the configured cross-origin UI,
  even though the server route itself is available.
- Enforcement location: `origin-protection.ts` now advertises the two approved
  request headers; no arbitrary client header reflection was added.
- Regression test or verification: The preflight regression in
  `tests/origin-protection.test.mjs` passes, along with the full 136-test suite
  and all four local Firestore emulator suites.
- Residual risk: Incorrect production origin configuration still fails closed
  at startup and must be reviewed as a release gate.

### [S8] Cross-branch notification preview is unbounded

- Severity: `SHOULD-FIX BEFORE MERGE`; becomes `MUST-FIX` if the member inbox
  is exposed publicly without an additional gateway limit.
- Boundary: Jun Hong member notification route to Firestore.
- Attack path: a member accumulates more than two unread notifications and
  requests the dashboard preview; the unread query has no database limit and
  returns the complete unread set.
- Impact: unbounded reads and response growth, with avoidable notification
  metadata exposure and resource consumption.
- Control: limit the unread preview query to the two newest records at the
  repository boundary and add a regression test with at least three unread
  records. Keep the existing actor-recipient authorization.
- Verification: pending in the merged tree; the standalone Jun Hong tests do
  not assert the database limit.
- Residual risk: the member notification implementation is not present in the
  current Jiali working tree, so this cannot be fixed here without selecting
  and resolving the shared branch merge.

### [S9] Cross-branch authentication-version composition can preserve stale
sessions after manager reset

- Severity: `MUST-FIX BEFORE MERGE`.
- Boundary: manager password reset, Firestore session store, active-actor
  middleware.
- Attack path: merge Jun Hong's `authVersion` check with the current Jiali
  reset implementation, which changes the hash and relies on session deletion
  but does not increment the target version. If session deletion fails after
  the password write, the old session still carries the current version and
  remains accepted.
- Impact: stale authenticated access after a password reset.
- Control: increment the target version atomically with the password update;
  compare session and user versions in trusted middleware; preserve bounded
  revocation retries and safe failure behavior.
- Verification: add a deterministic failed-revocation test to the merged
  manager/password-reset suite and rerun the full auth and emulator matrix.
- Residual risk: none identified after the combined transaction and denial
  test pass; production session-store failure behavior remains an operational
  gate.

## Test plan

- Direct injection: Not applicable; no model or prompt boundary exists.
- Indirect injection from stored/retrieved content: Not applicable as an AI
  attack; still verify message/catalog text is treated as plain data and cannot
  become HTML or authorization input.
- Multi-turn or obfuscated escalation: Not applicable; no model or agent tool
  can authorize application writes.
- Cross-role and cross-user denial: active librarian/member/inactive/signed-out
  matrix; foreign reservation/fine/notification IDs; forged roles, recipients,
  amounts, statuses, and ownership fields.
- Malformed output and tool arguments: strict request schemas, reference
  validation, bounded cursors, bounded messages, and no generic full-record
  write route.
- Rate limits, timeout, and provider failure: no model provider; test worker
  timeout/failure and browser network retry with idempotency.
- Safe logging and secret scanning: no passwords, hashes, sessions, credentials,
  full message bodies, or unnecessary member PII in evidence or aggregate worker
  logs.

## Release gates

- Application authorization is server-side and current-record based: required.
- Generic partial reservation/notification methods are not exposed as public
  mutation/read contracts: required.
- Fine and notification transitions are transactional and idempotent: required.
- The approved overdue policy, notification side effects, inactive-recipient
  behavior, worker deployment pattern, and message idempotency contract are
  recorded in the canonical spec and handoff: satisfied as a design gate;
  implementation evidence remains required.
- No production scheduler, index deployment, external delivery, or merge occurs
  from this draft: required.

## Open decisions

No product-policy decisions remain open in this review. Full specification and
checklist approval, implementation evidence, production configuration, and
release/merge approval remain separate human gates.

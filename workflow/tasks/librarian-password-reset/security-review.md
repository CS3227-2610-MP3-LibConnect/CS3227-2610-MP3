# Security Review: librarian-password-reset

This feature is authentication- and manager-authorization-sensitive. It does
not introduce an LLM, model prompt, model tool, external egress, or AI output.
The repository’s `ai-security-review` skill is selected because the workflow
requires it for authentication and manager changes; AI-specific prompt/tool
checks are explicitly not applicable to this slice.

## Scope and assumptions

- Feature and roles: an active librarian manager resets a librarian account’s
  password.
- Intended capabilities: validate a new password, replace the server-side
  password hash, revoke target sessions, and refresh the manager’s account
  list.
- Sensitive data: plaintext passwords, password hashes, session IDs/cookies,
  credentials, and private account data.
- Irreversible or externally visible actions: replacing a password and
  invalidating sessions; no email, notification, payment, or external action.
- Decision recorded: self-reset is disallowed on the manager route; self-service
  password management remains separate.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Browser request | Path ID, JSON/form password fields, forged role/confirmation fields | Unauthorized reset or secret leakage | Server-loaded actor/target checks and strict schemas | Route negative tests |
| Firestore user record | Concurrent account/status changes | Resetting the wrong type or stale target | Re-read target in trusted service/transaction | Storage integration tests |
| Session store | Target session records and deletion failures | Old sessions remain usable | Revoke after commit; surface safe failure and residual risk | Session failure test |
| Manager UI state | Stale cached account row, duplicate submit | Wrong target or false success | Path ID only, pending-state guard, server response refresh | Client tests |
| Workflow/evidence | Source text, test output, handoff content | Secret exposure or scope laundering | Treat as untrusted; redact secrets; human approval gates | Evidence/secret review |
| AI/model boundary | None in this feature | Not applicable | No model or tool invocation is permitted | Scope inspection |

## Findings

### [S1] Client-controlled privilege or target fields

- Severity: `MUST-FIX`
- Boundary: Browser request to Express authorization.
- Attack path or precondition: A non-manager submits `isManager: true`, a
  replacement actor, or a different target object.
- Impact: Unauthorized password replacement or confused-deputy behavior.
- Enforcement location: Server session lookup, `requireManager`, strict body
  schema, and server-loaded target validation.
- Regression test or verification: Forged-field tests for member,
  non-manager, inactive-manager, and signed-out requests.
- Human decision: None; required security baseline.

### [S2] Password or hash disclosure

- Severity: `MUST-FIX`
- Boundary: Request handling, responses, logs, and evidence.
- Attack path or precondition: Debug logging, error serialization, or unsafe
  account response includes a password or hash.
- Impact: Account compromise and credential exposure.
- Enforcement location: Argon2id-only storage, safe serializer, bounded error
  handling, and secret-scanning/evidence review.
- Regression test or verification: Response assertions and repository-wide
  secret scan without real credentials.
- Human decision: None; required security baseline.

### [S3] Password changed but sessions survive

- Severity: `MUST-FIX`
- Boundary: Firestore user record to Firestore session collection.
- Attack path or precondition: A stolen target session remains active after a
  manager reset, or session deletion fails silently.
- Impact: Password reset does not invalidate existing access.
- Enforcement location: Existing `destroyForUser`, safe failure response,
  operational evidence, and explicit residual-risk decision.
- Regression test or verification: All target sessions are deleted; deletion
  failure is surfaced without leaking secrets.
- Human decision: Approved bounded retries, generic failure, no second password
  reset request, and explicit residual-risk recording.

### [S4] Confirmation mistaken for authorization

- Severity: `MUST-FIX`
- Boundary: UI/form confirmation to server mutation.
- Attack path or precondition: An attacker submits a forged confirmation flag
  or bypasses the confirmation dialog.
- Impact: The UX gate is bypassed; if it were trusted as security, unauthorized
  reset could occur.
- Enforcement location: Server authorization and validation independent of any
  confirmation flag; confirmation is only a deliberate UX step.
- Regression test or verification: Requests without/with forged confirmation
  fields still require valid server authorization and password inputs.
- Human decision: None; required boundary.

## Test plan

- Direct injection: Not applicable; no model prompt is accepted.
- Indirect injection from stored or retrieved content: Not applicable; no
  retrieved content or model tool is used. Verify no AI path is added.
- Multi-turn or obfuscated escalation: Not applicable to runtime behavior;
  workflow evidence still treats handoff and repository text as untrusted.
- Cross-role and cross-user denial: Test member, non-manager, inactive
  manager, signed-out actor, wrong target type, and forged actor fields.
- Malformed output and tool arguments: Test strict request schemas and malformed
  JSON/form bodies; no model/tool arguments exist.
- Rate limits, timeout, and provider failure: No provider is introduced. Test
  generic storage/session failure handling and confirm no secret leakage.
- Safe logging and secret scanning: Verify no password, hash, cookie, or
  unnecessary personal data appears in responses, logs, or task artifacts.

## Release gates

- Server authorization is independent of React, form confirmation, and client
  role fields.
- Password hashing uses the vetted Argon2id implementation; plaintext values
  never enter logs, responses, or evidence.
- Target sessions are revoked after a successful reset, with bounded retries
  and the approved sequential failure behavior recorded and tested.
- No model can authorize this protected write; no AI capability is introduced.
- Human approval is required for the specification, checklist, residual risk,
  implementation, review, and merge.
- Residual risks are accepted by: Human user in chat on 2026-10-20; final
  implementation and independent review must still verify the control.

## Implementation verification — 2026-10-20

- Server authorization is enforced by the freshly loaded session actor,
  active-account checks, librarian-role checks, manager checks, strict request
  schemas, server-loaded target validation, and self-target rejection. Forged
  role, status, actor, target, and confirmation fields are not authorization
  inputs.
- Password handling uses Argon2id outside the Firestore transaction; the
  transaction re-reads the target and updates only the password hash and
  `updatedAt`. Safe JSON and HTML responses exclude hashes and password values.
- Target sessions are revoked after the password commit with bounded retries;
  persistent failure returns a generic service error and queues the existing
  revocation job without initiating a second password reset.
- Native forms and the client form are UX gates only. The server continues to
  authorize and validate the same operation, and the client sends only the
  target path plus password fields.
- Verification: the focused auth/manager/session/Origin/client/no-JavaScript
  matrix passed 48/48; `npm test` passed 48/48 including the build; both
  staged and unstaged `git diff --check` passed; evidence and diff scans found
  no credential patterns or plaintext test-password values.
- AI-specific threat families remain not applicable: this feature adds no
  model, prompt, retrieval, tool, external egress, or AI authorization path.

### Residual risk

The password write and session revocation remain sequential storage operations.
If bounded deletion retries and the queued revocation job both remain
unavailable, the password can be changed while a stale session persists. This
is the approved residual risk; no second reset is requested, and independent
review must verify the operational retry path before merge.

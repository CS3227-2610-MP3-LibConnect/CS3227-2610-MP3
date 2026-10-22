# Security Review: local-manager-bootstrap

## Scope and assumptions

- Feature and roles: A local developer/operator creates one privileged
  librarian-manager account in the Firestore Emulator. The browser later uses
  the existing librarian login and manager-only routes.
- Intended capabilities: Guarded local account creation, password hashing,
  identity-index creation, and normal manager authentication.
- Sensitive data: Plaintext passwords, Argon2id hashes, session cookies/IDs,
  Firebase/Admin credentials, and private user fields.
- Irreversible or externally visible actions: A local emulator write creates a
  privileged account. No production or public HTTP provisioning action exists.
- AI scope: None. No model, prompt, retrieval, tool call, or external AI
  provider is involved; the review therefore focuses on the manager/password
  and coding-agent permission boundaries required by the repository workflow.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Environment guard | Process environment before validation | Write to a non-local Firebase project or production | Require emulator host, reject production, require `demo-libconnect` | `tests/bootstrap-manager.test.mjs`; live command guard behavior |
| Interactive input | Name, email, employee ID, password, confirmation | Invalid identity, weak credential, or privilege selection | Strict validation; fixed server-side role/status/manager fields; hidden password prompt | Focused validation tests; source review |
| Firestore write | Duplicate identities or concurrent writes | Account overwrite or ambiguous login identity | Existing `UserRepository.create` transaction and identity-key invariants | Live emulator success and duplicate-conflict checks |
| Login/authorization | Browser request and client-supplied fields | Non-manager access to manager operations | Existing server-loaded actor and `requireManager` checks | Ephemeral API integration: manager `200`, normal librarian `403` |
| Output/evidence | CLI errors, success output, tests, reports, logs | Credential or session leakage | Safe identifying output only; no password arguments; redacted evidence | Source/output review and test assertions |
| Agent workflow | Repository text, skills, handoff, staged baseline | Scope expansion or unsafe external action | Approved spec/checklist, path-scoped changes, explicit human gates | Approved handoff and implementation report |

## Findings

### [S1] Production or wrong-project provisioning

- Severity: `MUST-FIX` if unguarded; `RESIDUAL-RISK` after implemented controls
- Boundary: Environment guard and Firestore Admin initialization.
- Attack path or precondition: An operator runs the command with missing or
  altered environment configuration.
- Impact: A privileged account could be written outside the intended emulator.
- Enforcement location: `scripts/bootstrap-manager.mjs` requires
  `FIRESTORE_EMULATOR_HOST`, rejects `NODE_ENV=production`, and requires
  `FIREBASE_PROJECT_ID=demo-libconnect` before importing Firebase storage code.
- Regression test or verification: Guard tests cover missing emulator,
  production mode, wrong project, and valid local configuration.
- Human decision: Residual local-emulator access risk remains accepted only for
  local development; production provisioning remains out of scope.

### [S1] Password or hash leakage

- Severity: `MUST-FIX` if present; `RESIDUAL-RISK` after implemented controls
- Boundary: Interactive terminal, process arguments, output, tests, logs, and
  task evidence.
- Attack path or precondition: Password is supplied as a command argument or
  printed during prompts/errors/reporting.
- Impact: Local credential compromise or reusable secret exposure.
- Enforcement location: Hidden raw-mode prompt, no password command argument,
  Argon2id hashing before Firestore write, safe success/error output, and
  evidence policy.
- Regression test or verification: Focused validation tests, source review,
  live command output review, full test suite, and security evidence scan.
- Human decision: None pending; credentials used during verification were
  ephemeral and are not recorded here.

### [S1] Duplicate identity or partial account write

- Severity: `MUST-FIX` if the write is non-transactional; `RESIDUAL-RISK` after
  implemented controls
- Boundary: User record and email/employee identity-index collections.
- Attack path or precondition: Re-running bootstrap with an existing email or
  employee ID, including concurrent attempts.
- Impact: Overwrite, ambiguous login, or an unusable privileged account.
- Enforcement location: Existing `UserRepository.create` transaction checks
  all identity keys before creating the user and index records.
- Regression test or verification: Live duplicate identity attempt returned a
  non-zero conflict without overwriting; repository transaction code was
  inspected; full regression suite passed.
- Human decision: None pending.

### [S2] Privilege selection through untrusted prompt fields

- Severity: `SHOULD-FIX` if prompt values can select role; `RESIDUAL-RISK`
  after implemented controls
- Boundary: Interactive input to trusted account construction.
- Attack path or precondition: An operator supplies role/status/manager fields
  or attempts to influence them through extra input.
- Impact: Creation of an unintended account type or status.
- Enforcement location: The prompt accepts only name, email, employee ID, and
  password values; `buildManagerRecord` fixes `LIBRARIAN`, `ACTIVE`, and
  `isManager: true` in trusted code.
- Regression test or verification: Manager record test asserts fixed fields;
  no public route or client manager toggle was added.
- Human decision: None pending.

## Test plan

- Direct injection: Not applicable; there is no AI prompt or model boundary.
- Indirect injection from stored or retrieved content: Not applicable; the
  command reads only local interactive values and trusted runtime configuration.
- Multi-turn or obfuscated escalation: Not applicable to this non-AI command;
  privilege is fixed in code rather than interpreted from text.
- Cross-role and cross-user denial: Ephemeral API integration verified manager
  login and manager route access (`200`) versus normal librarian denial (`403`).
- Malformed output and tool arguments: Validation tests cover invalid fields,
  short/whitespace passwords, mismatched confirmation, and environment guards.
- Rate limits, timeout, and provider failure: Not applicable; no provider or
  external service is called.
- Safe logging and secret scanning: CLI output review, focused tests, full
  regression suite, `git diff --check`, and evidence review contain no
  recorded password, hash, session, or credential material.

## Release gates

- Model cannot authorize protected writes or external side effects: Not
  applicable; no model is present. The command itself uses trusted code and a
  local emulator guard.
- Tools are allowlisted, schema-validated, authenticated, authorized, and
  logged: The command has no MCP or external tool surface; Firestore writes use
  the existing transactional repository and server-side record shape.
- Human approval is required for consequential actions: Specification,
  checklist, implementation handoff, review, commit, and merge remain
  separate human gates. Production provisioning is not implemented.
- Residual risks are accepted by: Pending independent review and final human
  merge decision.

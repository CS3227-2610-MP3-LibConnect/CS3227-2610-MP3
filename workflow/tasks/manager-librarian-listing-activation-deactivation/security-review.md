# AI Security Review: manager-librarian-listing-activation-deactivation

## Scope and assumptions

- Feature and roles: active librarian managers list librarian accounts and change their `ACTIVE`/`INACTIVE` status; members, non-manager librarians, inactive actors, and signed-out users are denied.
- Intended capabilities: read safe librarian account summaries; activate or deactivate a librarian through a server-authorized transaction.
- Sensitive data: password hashes, session records/identifiers, account identity fields, manager privilege, and the complete user records in Firestore.
- Irreversible or externally visible actions: account access changes and session revocation. No AI model, external tool, email, notification, or public deployment is introduced by this slice.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Evidence |
|---|---|---|---|---|
| Browser/API request | URL path, JSON/form body, query strings, Origin header, stale client state | Target substitution, forged role fields, unauthorized status change | Origin validation, strict status schema, server-loaded actor and target | `apps/api/src/routes/manager.ts`, `apps/api/src/http/auth.ts`, route tests |
| Session/identity | Session cookie and stored user ID/account type | Account takeover or stale/inactive access | Server session lookup, current Firestore account status/type check, session destruction | `requireActiveActor`, `FirestoreSessionStore`, auth tests |
| Firestore transaction | Current target record and active-manager query | Last-manager invariant violation or partial state transition | Read target and active managers inside one transaction; reject no-op and last-manager transitions | `apps/api/src/storage/accounts.ts:70-98` |
| Response/client boundary | Firestore record fields and error paths | Hash/session disclosure or false success | Safe serializer, generic error contract, client error state | `safeLibrarianAccount`, route tests, client page |
| Handoff/evidence workflow | Specs, task files, commit metadata, generated summaries | Requirement laundering or unauthorized scope expansion | Separate approved artifacts, human gate, exact-commit review | Missing manager task/handoff artifacts; Finding 1 |
| Permission/egress | Build/test commands and local HTTP listeners | Unreviewed external side effects or data exfiltration | Least-privilege local checks; no deploy/push/message actions | Review execution log |

## Findings

### [S1] Missing approval chain and implementation-time spec rewrite

- Severity: `OUT-OF-SCOPE BY USER DIRECTION`
- Boundary: Handoff/memory and external workflow.
- Attack path or precondition: A reviewer receives an implementation commit that rewrites the canonical specification while the manager task checklist, handoff, and implementation report are absent.
- Impact: A changed requirement could be laundered as approved scope, but the user explicitly directed this implementation pass to use `Overview.md` and `PLAN.md` and ignore the missing task artifact.
- Enforcement location: Workflow artifact creation and human approval before implementation/review; no agent may record approval.
- Regression test or verification: Requirements for this pass were checked against `Overview.md` and `PLAN.md`.
- Human decision: The repository’s normal human approval workflow remains a separate residual process requirement.

### [S2] Security-critical denial and race paths lack tests

- Severity: `RESOLVED`
- Boundary: Tool/action authorization equivalent at the server state boundary.
- Attack path or precondition: An inactive manager, non-manager librarian, forged target, concurrent deactivation, or stale session exercises a path not covered by the submitted tests.
- Impact: The added tests now cover inactive/non-manager/member denial, malformed/missing/non-librarian targets, serialized concurrent last-manager actions, session-denial after deactivation, transient/persistent session-store failures, and pure client transition decisions.
- Enforcement location: Express middleware, `AccountStorage.updateLibrarianStatus`, Firestore transaction tests, and client state tests.
- Regression test or verification: `npm test` and `npm run test:coverage` pass 34/34 tests with coverage thresholds; the emulator-backed check is present but blocked on this host's Java 17 runtime because the Firebase CLI requires Java 21+.
- Human decision: Install/provide Java 21+ before treating emulator-backed concurrency as a release gate.

### [S3] Bootstrap/recovery procedure is not concrete

- Severity: `RESOLVED`
- Boundary: Permission/egress and operational recovery.
- Attack path or precondition: The last manager is unavailable or the deployment starts without a valid manager, and no reviewed emergency path is documented.
- Impact: `docs/DeveloperGuide.md` now defines an out-of-band, least-privilege bootstrap and incident-approved recovery procedure.
- Enforcement location: Deployment/bootstrap documentation and operator access controls, outside the public route.
- Regression test or verification: The documented procedure excludes browser/client input, keeps credentials and passwords out of evidence, and preserves the last-manager invariant for ordinary requests.
- Human decision: Human operations owners still approve the procedure and its residual access risk.

### [S4] Post-commit session-revocation failure is a residual risk

- Severity: `RESIDUAL-RISK`
- Boundary: Firestore-to-session-store state transition.
- Attack path or precondition: Firestore status update succeeds and `destroyForUser` fails or partially deletes session documents.
- Impact: Stale session records can still remain after persistent session-store failure. The inactive account check prevents protected access on subsequent requests, transient failures receive bounded retries, and persistent failures are placed in a server-only Firestore outbox for bounded-backoff cleanup.
- Enforcement location: `AccountStorage.updateLibrarianStatus`, `requireActiveActor`, `FirestoreSessionStore` retry/cleanup operations, and the server-started revocation worker.
- Regression test or verification: Fault-injected transient and persistent failures assert retry behavior, inactive-account denial, durable enqueueing, and committed safe state without secret logging.
- Human decision: Accept the residual risk only after the failure policy is documented and tested.

## Test plan

- Direct injection: Not applicable to this non-AI feature; body/query role fields are treated as untrusted and are denied/ignored by server authorization.
- Indirect injection from stored or retrieved content: Not applicable; no model or retrieved-content tool path is introduced.
- Multi-turn or obfuscated escalation: Not applicable to the API; verify that client-controlled role fields, target objects, and confirmation flags cannot change server authorization.
- Cross-role and cross-user denial: Tests cover signed-out/member/forged-field cases, inactive managers, active non-managers, non-librarian targets, and stale-session denial.
- Malformed output and tool arguments: No model output/tools; strict Zod status and path schemas cover request arguments, including malformed-status tests.
- Rate limits, timeout, and provider failure: No model/provider introduced; transient and persistent post-commit session-store failures are fault-injected in the policy tests, with durable cleanup documented as a residual operational boundary.
- Safe logging and secret scanning: No password/session data was added to review artifacts; safe response serializer excludes `passwordHash`, and client source contains no Firestore write path.

## Release gates

- Model cannot authorize protected writes or external side effects: `N/A`; no model is in this slice.
- Tools are allowlisted, schema-validated, authenticated, authorized, and logged: `N/A` for model tools; HTTP input is schema-validated and server-authorized.
- Human approval is required for consequential actions: UI confirmation exists; workflow artifact approval is explicitly out of scope for this user-directed pass.
- Residual risks are accepted by: `Not accepted`; human operations and merge owners must decide after remediation.

# Independent AI Security Review: member-librarian-integration

## Scope and assumptions

- Snapshot: staged diff against
  `b7270e76b29b0bbddf0f71bccec7aa5f62adb1a5`, SHA-256
  `ecb3f3c5820cd3a6411f3358d2d01c6d954778237f5474bb44e528d81ec06e32`.
- Roles: member, librarian, and librarian manager, with separate bounded member
  and librarian assistants.
- Intended AI authority: advisory and read-only. Model output must not
  authorize or directly perform account, circulation, reservation, fine,
  notification, Firestore, or external actions.
- Trusted authority: current server session plus current server-loaded account
  and application records, typed policy, and transaction checks.
- Untrusted inputs: client fields/cookies before validation, prompts, stored
  catalog and notification text, model output, branch content, tests, skills,
  handoffs, logs, generated output, and tool output.
- Sensitive data: passwords/hashes, raw sessions/cookies, authorization
  versions, provider/Firebase credentials, raw prompts/responses, unrelated
  users' records, and unnecessary personal data.
- Review limitation: The review stopped on a blocking defect. Consequently,
  this artifact records the independently inspected boundaries and the release
  gate that failed; it does not convert implementer test claims into
  independent passes for the remaining AI/security matrix.

## Trust boundaries and data flow

| Boundary | Attacker-controlled input | Possible impact | Required control | Independent evidence |
|---|---|---|---|---|
| Session/actor | Cookie and request fields | Forged role, owner, manager, or stale session | Current server-loaded actor, role/ownership/version checks | Source partially inspected; complete denial matrix stopped early |
| Circulation transaction | Copy IDs, retries, concurrent requests, stale copy state | Partial writes, policy-limit bypass, inconsistent user intent | One all-or-none transaction and authoritative open-loan count | **Failed**; Finding S1 |
| Model prompt/context | Member question and stored application text | Prompt injection, cross-user disclosure, unsafe advice | Separate minimum context, instruction/data separation, output policy | Not independently completed after blocker |
| Provider/output | Provider response and transport failure | Malformed output, secret leakage, authority claim | Server-only credentials, schema/size checks, bounded retry/timeout/circuit, no write tools | Not independently completed after blocker |
| Client/Firestore | Forged API calls or direct browser access | Unauthorized read/write | Express reauthorization and deny-by-default browser rules | Not independently completed after blocker |
| Agent/evidence | Branch code, duplicated specs, tests, logs, summaries | Instruction laundering or false assurance | Source-of-truth ordering, exact fingerprint, independent traceability | **Failed**; Finding S2 |
| External/egress | Deploy/provider/repository commands | Data exfiltration or unintended side effect | Least privilege and explicit human approval | No external or consequential action was performed |

## Threats considered

- Forged identity, role, manager, ownership, recipient, and state fields.
- Stale/replayed requests and concurrent circulation requests.
- Direct and indirect prompt injection, role play, obfuscation, multi-turn
  escalation, tool-argument manipulation, and cross-user confused-deputy use.
- Malformed/oversized model output, timeout, retry, circuit, rate-limit, and
  provider-error failure modes.
- Direct client Firestore writes, secret/prompt/session leakage, and unsafe
  external actions.
- Coding-agent instruction laundering through historical specifications,
  tests, handoffs, generated evidence, and passing-test summaries.

Only the circulation and evidence-provenance boundaries reached a completed
independent conclusion before the required stop.

## Findings

### [S1] Multi-copy checkout permits partial writes and open-loan limit bypass

- Severity: `BLOCKER`
- Boundary: Transactional circulation state and retry/concurrency policy.
- Attack/failure path: An authenticated member confirms a batch containing a
  stale/unavailable copy and an eligible copy, or confirms more copies than
  remaining capacity. `confirmMemberBorrow` executes a separate transaction
  for each ID, catches failures, and commits siblings. Both capacity and
  confirmation count only `ACTIVE`, excluding `PENDING_CLOSE`.
- Impact: A single confirmed action can partly mutate Firestore while reporting
  mixed failure, and the member can exceed the approved ten-open-loan policy
  when pending closure loans exist. This violates the approved state machine
  and weakens retry safety.
- Control: Enforce the entire requested batch and the combined `ACTIVE` plus
  `PENDING_CLOSE` count inside one server-side Firestore transaction. Abort
  before every write on any invalid copy or capacity failure. Keep identity and
  ownership server-derived.
- Verification: Mixed-invalid, stale-copy, over-capacity, pending-close,
  repeated-request, and concurrent-batch unit/API/emulator tests must prove
  zero partial writes and a maximum of ten open loans.
- Residual risk: Firestore transaction retry/phantom behavior needs emulator
  evidence; an in-memory fake is not enough.

### [S2] Passing tests launder a lower-priority partial-success contract

- Severity: `MEDIUM`
- Boundary: Agent workflow, specification provenance, and assurance evidence.
- Attack/failure path: Historical `specdocs/` text and imported tests specify
  partial success, while the canonical `PlanDraft/Specs/Member/completed/`
  requirement specifies all-or-none. The staged tests pass by asserting the
  lower-priority behavior, and the implementation report claims no deviation.
- Impact: Test totals and coverage can falsely signal release readiness even
  though a canonical transaction requirement is violated.
- Control: Resolve requirements using the repository source-of-truth order;
  update lower-priority artifacts/tests/evidence to the approved contract, or
  obtain a separately approved `sdd-revise` amendment before implementing a
  changed product requirement.
- Verification: Acceptance-to-test traceability must quote or reference the
  canonical criterion and assert the same semantics. Preserve this failed
  review and record the new exact snapshot.
- Residual risk: Duplicated historical specifications can drift again without
  a provenance check.

## Adversarial and regression test plan

Required before re-review:

1. Submit `[staleCopy, eligibleCopy]`; verify the API rejects the batch and no
   copy/loan changes.
2. With eight open loans, submit three copies; verify rejection and no writes.
3. With nine loans split across `ACTIVE` and `PENDING_CLOSE`, verify capacity
   is one and a two-copy request is rejected atomically.
4. Race two batches at the final available capacity; verify at most the whole
   winning batch commits and open loans never exceed ten.
5. Replay a rejected and a successful request; verify no duplicate loans and
   no misleading mixed `201` response.
6. After remediation, run the complete member/librarian AI corpus for direct,
   indirect, multi-turn, obfuscated, cross-role, cross-user, malformed output,
   provider failure, timeout/retry/circuit/rate-limit, privacy, and no-write
   cases.
7. Run direct-client-Firestore, secret-shape, raw prompt/response, session,
   configuration, worker, and external-approval boundary checks.

## Release gates

- [ ] Canonical member checkout transaction and open-loan policy are enforced.
- [ ] Lower-priority tests/evidence match the approved canonical requirement.
- [ ] Authentication, role, ownership, manager, and stale-session denial matrix
  is independently complete.
- [ ] Both assistants' context isolation, injection resistance, data
  minimization, output validation, and advisory/no-write boundaries are
  independently complete.
- [ ] Provider rate-limit, timeout, retry, circuit, malformed-output, and safe
  failure cases are independently complete.
- [ ] Direct browser Firestore and sensitive-data scans are independently
  complete.
- [ ] Full unit, coverage, emulator, browser, build, lint, format, and
  configuration verification passes on the remediated exact snapshot.
- [ ] Human reviews findings and makes the merge decision.

## Open decisions

No security-design choice is open under the current approved specification.
If partial-success checkout is desired, it is a product/state-machine change
that requires `sdd-revise` and explicit human approval before implementation.

## Security verdict

`FAIL`. Finding S1 is must-fix before merge. The independent review did not
approve merge or release.

## Implementer remediation note — 2026-10-22

This note does not alter or supersede the independent `FAIL` verdict above.
Following explicit human authorization, the implementation was reconciled to
the canonical all-or-none contract: one Firestore transaction now validates
and commits the complete batch, and both `ACTIVE` and `PENDING_CLOSE` count
toward the ten-open-loan limit. Lower-priority tests, documentation, generated
output, and evidence were updated while preserving the failed review.

The required unit, API, full regression, coverage, and Firestore emulator
scenarios passed in the implementer's environment. Release-gate checkboxes
above remain reviewer-owned; a fresh independent Task 11 review must evaluate
the remediated exact snapshot and issue a separate verdict.

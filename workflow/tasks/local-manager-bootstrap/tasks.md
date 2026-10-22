# Task Checklist: local-manager-bootstrap

## Inputs

- Approved specification path and version:
  `PlanDraft/Specs/Development/LocalManagerBootstrap.md` (`0.1-approved`)
- Specification approval record: Human approval recorded in chat on
  2026-10-22.
- Task checklist status: `APPROVED`
- Task checklist approver (human only): Human user, recorded in chat
- Task checklist approval date: 2026-10-22

## Ordered implementation tasks

- [x] **1. Perform the SDD apply preflight and establish the clean baseline** -
  Read the approved specification, this checklist, and the handoff; inspect
  the existing account repository, seed script, Firebase initialization,
  authentication flow, and manager authorization checks. Confirm the feature
  can be implemented without attributing unrelated working-tree changes to
  this task.
  - Acceptance criteria: The implementer records the exact spec/checklist
    versions, confirms the separate human approvals, identifies the allowed
    source/test paths, and stops on any contradiction or missing decision.
  - Verification: `git status --short`, source inspection of the referenced
    paths, and the `sdd-apply` preflight record.
  - References: Canonical specification sections “Why this change is
    required”, “Technical specifications”, and “Context reviewed”; `AGENTS.md`,
    `workflow/README.md`, `workflow/agents/implementer.md`.
  - Dependencies: `None`

- [x] **2. Implement local-only guards and interactive input validation** - Add
  the bootstrap command's non-production/emulator/project guards and secure
  interactive prompts for name, email, employee ID, password, and confirmation.
  Reuse existing canonicalization and password-policy conventions without
  exposing passwords through command arguments or terminal output.
  - Acceptance criteria: Missing emulator configuration, production mode, and
    the wrong local Firebase project fail before any write; blank/invalid
    identity fields, short or whitespace-containing passwords, and mismatched
    confirmation fail with non-zero exit status and no account mutation.
  - Verification: Unit tests for each guard and validation failure, including
    assertions that the write layer is not reached.
  - References: Specification requirements 1-2, 4, and 6; acceptance criteria
    1-4 and 7; `apps/api/src/storage/accounts.ts`,
    `packages/shared/src/domain/records.ts`.
  - Dependencies: Task 1

- [x] **3. Add the trusted manager account write and package command** - Add
  `npm run bootstrap:manager` and the server-side/local script or helper that
  creates the fixed `LIBRARIAN`, `ACTIVE`, `isManager: true` account with a
  generated ID, Argon2id hash, timestamps, and consistent email/employee
  identity indexes. Preserve public registration and normal seed behavior.
  - Acceptance criteria: Valid input creates one manager account in the
    emulator; duplicate email or employee ID conflicts fail atomically without
    overwriting an existing account; plaintext passwords and hashes are never
    printed or returned.
  - Verification: Focused storage/script tests plus an emulator write/read
    check that verifies the safe account fields, hash shape, identity indexes,
    and no plaintext password field.
  - References: Specification requirements 3-6; acceptance criteria 5-6 and
    11; `package.json`, `apps/api/src/storage/seed.ts`,
    `apps/api/src/storage/firebase.ts`, `apps/api/src/storage/repositories.ts`.
  - Dependencies: Task 2

- [x] **4. Verify normal login and manager-only authorization** - Exercise the
  created account through the existing librarian login/session path and verify
  that the manager navigation and manager account route are available only to
  the created manager, while a normal librarian remains denied.
  - Acceptance criteria: The bootstrap-created account can sign in normally;
    the server-loaded manager summary enables the existing manager workflow;
    client-controlled role or manager fields cannot grant access.
  - Verification: Firestore Emulator integration/API tests for manager login,
    manager-only access, and non-manager denial; browser or client contract
    checks for the existing manager navigation.
  - References: Specification requirement 7, integration specification, and
    acceptance criteria 8-9; `apps/api/src/http/auth.ts`,
    `apps/api/src/routes/manager.ts`, `apps/client/src/App.tsx`.
  - Dependencies: Task 3

- [x] **5. Complete manager-security review and secret-handling checks** -
  Review the command, handoff, tests, logs, and evidence for privilege
  escalation, accidental production access, credential leakage, unsafe command
  surfaces, and confused-deputy behavior. Record required findings and
  controls in the task security report.
  - Acceptance criteria: The command has no public provisioning route; role and
    status are fixed by trusted code; all password/session/hash material is
    absent from source, output, tests, logs, and reports; the required
    security-review evidence is complete.
  - Verification: Repository secret/evidence scan, focused negative tests, and
    the repository-local `ai-security-review` procedure.
  - References: Specification sections “Scope and guardrails”, “Output and
    privacy”, “Risks and tradeoffs”; `AGENTS.md`,
    `.agents/skills/ai-security-review/SKILL.md`.
  - Dependencies: Tasks 2-4

- [x] **6. Run regression verification and record implementation evidence** -
  Run the required build, lint, format, focused, and full regression checks;
  inspect the final diff for scope; and complete the implementation report and
  factual execution log. Leave the task at the implementation approval gate.
  - Acceptance criteria: All applicable checks pass or are reported with exact
    failures and residual risks; the implementation report records changed
    files, commands, results, deviations, and unresolved risks; no commit,
    push, deployment, merge, or reviewer approval is performed.
  - Verification: `npm run build`, `npm test`, `npm run lint`,
    `npm run format:check`, emulator verification, `git diff --check`, and
    evidence review.
  - References: Specification acceptance criteria 10-11 and “Verification
    plan”; `workflow/templates/implementation-report.md`,
    `workflow/tasks/local-manager-bootstrap/security-review.md`.
  - Dependencies: Tasks 4-5

## Checklist rules

- Tasks are completed in order unless the handoff records an approved reason.
- A task is checked only after its acceptance criteria and verification pass.
- Changes to requirements use the `sdd-revise` procedure and an amendments
  entry; they are not silently edited into this checklist.
- The implementer records completion evidence in the implementation report.
- A human separately approved this checklist before implementation began.

## amendments

- 2026-10-22 — Human approved the task checklist in chat. SDD apply preflight
  completed against spec `0.1-approved`, checklist `0.1-approved`, and the
  approved handoff. Existing staged changes and generated artifacts on branch
  `integration` were identified as unrelated baseline state and will be
  preserved.
- 2026-10-22 — Added emulator/non-production/project guards, interactive
  visible-field prompts, hidden password entry, shared registration-aligned
  validation, and focused tests. `npm run build` and
  `node --test tests/bootstrap-manager.test.mjs` passed 3/3.
- 2026-10-22 — Added the trusted manager record builder, Argon2id hashing,
  transactional repository write, package command, safe usage output, and
  README documentation. A live emulator run created a manager; a duplicate
  identity attempt exited non-zero without overwrite. The command now closes
  Firebase Admin and pauses stdin on exit.
- 2026-10-22 — Ephemeral API/emulator integration verification passed:
  manager login `200`, manager-only route `200`, normal librarian login `200`,
  normal librarian manager route `403`. Temporary records and sessions were
  cleaned up.
- 2026-10-22 — Completed the manager security review and recorded the
  implementation report plus factual verification log. The review found no
  unresolved must-fix issue within scope; local-emulator privileged access is
  recorded as residual risk pending independent review.
- 2026-10-22 — `npm test` passed 453/453 with approved local-network access;
  `npm run lint` and `npm run format:check` passed. All approved checklist
  tasks are complete. No commit, push, deployment, merge, or reviewer approval
  was performed.

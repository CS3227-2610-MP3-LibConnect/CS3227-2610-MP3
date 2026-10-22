# FEATURE: Local Manager Bootstrap

**Spec version:** `0.1-approved`

**Task ID:** `local-manager-bootstrap`

**Human approval:** Approved in chat on 2026-10-22 for specification creation.
Implementation, task checklist, review, and merge remain separate approval gates.

## Purpose

Provide a safe, local-development-only way to create the first manager account
against the Firestore Emulator so the manager workflows can be exercised from
the normal login page. The command must not create or expose a production
manager-provisioning route.

## Why this change is required

The current local seed in `apps/api/src/storage/seed.ts` creates an active
member and an active non-manager librarian, but no manager account. Public
librarian registration in `apps/api/src/storage/accounts.ts` intentionally
creates inactive accounts with `isManager: false`. Consequently, the local
application has no supported way to sign in as a manager.

The production bootstrap policy remains an out-of-band operator procedure as
documented in `docs/DeveloperGuide.md` under “Manager bootstrap and emergency
recovery”. This feature is limited to the local emulator.

## Product specifications

### User and outcome

The local developer can run one command, enter manager account details without
placing the password in shell history, and then sign in at the normal LibConnect
login page as an active manager.

### Functional requirements

1. Add an `npm run bootstrap:manager` command.
2. Prompt interactively for the manager's name, email, employee ID, password,
   and password confirmation.
3. Create exactly one `LIBRARIAN` user with:
   - `accountStatus: ACTIVE`;
   - `isManager: true`;
   - a generated user ID;
   - canonical email and employee-ID identity values;
   - `authVersion: 0`; and
   - an Argon2id password hash.
4. Reject invalid input using the existing account/password policy, including
   blank required fields, invalid email or identity values, passwords shorter
   than eight characters, whitespace-containing passwords, and mismatched
   confirmation.
5. Reject creation when the email or employee ID is already registered. The
   command must not overwrite an existing account.
6. On success, report only non-sensitive identifying information needed to
   confirm creation. Never print the password, password hash, session data, or
   full private user record.
7. A successful account must be usable through the existing login flow and must
   reveal the existing manager-only librarian-account navigation after login.

### Failure behavior

The command must fail before writing when required configuration or input is
invalid. It must report a concise actionable error and exit non-zero. Partial
account creation must not be silently treated as success.

## Technical specifications

### Scope and guardrails

- The command is for the Firestore Emulator only.
- It must require `FIRESTORE_EMULATOR_HOST` to be set.
- It must refuse to run when `NODE_ENV=production`.
- It should additionally require the local project configuration used by this
  repository (`FIREBASE_PROJECT_ID=demo-libconnect`) so an accidental command
  against another Firebase project is rejected.
- It must not add a public HTTP route, client-side manager toggle, or production
  deployment behavior.
- It must use existing dependencies and patterns where practical; adding a
  dependency requires separate approval.

### Account write

The implementation may use a dedicated bootstrap script and existing shared
domain/canonicalization utilities. The write must preserve the existing user
record shape and identity-index invariants used by account registration. The
password must be hashed before it reaches Firestore. Generated IDs and server
timestamps must be created by trusted code.

The implementation must perform duplicate checks for both email and employee
ID and must fail closed on conflicts. It must not accept client-controlled
`isManager`, account status, or account type values because those values are
fixed by this local bootstrap contract.

### Integration points

- `package.json`: expose the command and, if needed, build the TypeScript
  sources before running the script.
- `apps/api/src/storage/seed.ts` and
  `apps/api/src/storage/accounts.ts`: preserve existing local seed and public
  registration behavior; do not turn either into a public manager factory.
- `packages/shared/src/domain/records.ts`: reuse the existing user schema and
  canonicalization rules.
- `apps/api/src/storage/firebase.ts`: use the emulator-safe Firebase Admin
  initialization already used by the repository.
- Existing login/session and manager authorization code: no changes to the
  authentication contract are intended.

### Output and privacy

Passwords, hashes, session identifiers, credentials, and full user documents
must not appear in terminal output, tests, logs, or evidence. Tests must use
unique test values and must not commit reusable credentials.

## Integration specification

The intended flow is:

```text
npm run bootstrap:manager
  -> local/emulator guard
  -> interactive validation
  -> duplicate identity checks
  -> Argon2id hash and trusted Firestore write
  -> safe success message
  -> normal browser login
  -> server-loaded active manager summary
  -> existing manager account-management navigation and routes
```

No browser request is involved in account creation. After creation, the
existing session and authorization boundaries remain authoritative: the server
reloads the user record and checks active librarian plus `isManager === true`
for manager-only operations.

## Acceptance criteria

1. `npm run bootstrap:manager` exists and is documented by its help/error
   output or local developer documentation.
2. Running it without `FIRESTORE_EMULATOR_HOST` fails without a Firestore write.
3. Running it with `NODE_ENV=production` fails without a Firestore write.
4. Running it with the wrong Firebase project identifier fails without a
   Firestore write.
5. Valid interactive input creates one active manager account in the emulator,
   with an Argon2id hash and no plaintext password stored.
6. Duplicate email and duplicate employee ID attempts fail without modifying
   the existing account.
7. Invalid and mismatched password input fails without creating an account.
8. The created account can sign in through the normal librarian login flow.
9. The signed-in account can access the existing manager librarian-account
   workflow, while a normal librarian cannot.
10. Relevant unit/static checks, build, and emulator verification pass.
11. Tests and evidence contain no password material, hashes, session IDs, or
    unnecessary personal data.

## Out of scope

- Production manager provisioning or recovery.
- A public API or browser UI for creating managers.
- Changes to the role model, authorization policy, last-manager protection, or
  password policy.
- Automatically adding a manager to the normal seed command.
- Resetting, deleting, or modifying existing accounts.
- New dependencies, deployment configuration, or external service access.

## Risks and tradeoffs

- A local bootstrap command necessarily creates a privileged account, so strict
  emulator and non-production guards are required.
- Interactive prompts reduce shell-history leakage but make automation less
  convenient; automation is intentionally out of scope for this local-only
  feature.
- A separate command avoids silently changing existing seed behavior, but local
  developers must perform one additional setup step.
- Duplicate checks and identity-index writes must remain consistent with the
  existing account repository to avoid ambiguous login identities.

## Verification plan

- Unit-test input validation and environment guards without using real account
  credentials.
- Run the repository build and static checks.
- Run the bootstrap command against the Firestore Emulator with ephemeral test
  values.
- Verify login and manager-only access using the existing session/API flow.
- Verify a normal librarian remains denied from manager-only operations.
- Record commands, results, changed files, and residual risks in the required
  task evidence after implementation.

## Context reviewed

- `AGENTS.md`
- `workflow/README.md`
- `Overview.md`
- `PLAN.md`
- `README.md`
- `docs/DeveloperGuide.md`
- `docs/authentication-and-sessions.md`
- `apps/api/src/storage/seed.ts`
- `apps/api/src/storage/accounts.ts`
- `apps/api/src/storage/firebase.ts`
- `packages/shared/src/domain/records.ts`
- `package.json`

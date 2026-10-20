# Handoff: librarian-password-reset

## Approval state

- Specification status: `APPROVED`
- Specification approver (human only): Human user, recorded in chat
- Specification approval date: 2026-10-20
- Task checklist status: `DRAFT` — checklist created; separate human approval
  remains required.
- Task checklist approver (human only):
- Task checklist approval date:

The specification gate is complete. No implementation approval is inferred
from the existence of this handoff, passing tests, or the user’s confirmation
of the task ID. The checklist is drafted, but implementation must not begin
until a human separately approves `tasks.md`.

## Specification

- Canonical spec path: `PlanDraft/Specs/LibrarianFeatures/ManagerFeatures/ResetLibrarianPassword.md`
- Task spec path: `workflow/tasks/librarian-password-reset/spec.md`
- Spec version: `0.2-approved` (working-tree approval, 2026-10-20)
- Task checklist path: `workflow/tasks/librarian-password-reset/tasks.md` (not yet created)
- Task checklist version: `0.1-draft` (working-tree draft, 2026-10-20)
- Source-of-truth conflicts resolved: The plan’s order 2 is consistent with the
  existing manager implementation and the reset workflow. The prior reset
  spec was underspecified; this draft makes its missing API, security,
  session, progressive-enhancement, and test behavior explicit.

## Scope

- Objective: Let an active librarian manager reset a librarian account’s
  password through trusted server code while preserving account authorization,
  status, manager privilege, and secret-handling boundaries.
- In scope: manager authorization, librarian-target validation, password and
  confirmation validation, Argon2id hashing, reset API, manager UI action,
  explicit confirmation, standard form submission, target-session revocation,
  safe errors/responses, and the test matrix in the canonical specification.
- Out of scope: self-service recovery, member resets, account status/manager
  changes, email notifications, MFA, password-history policy, AI, and other
  library workflows.
- Allowed analyst files or directories: the canonical specification,
  `workflow/tasks/librarian-password-reset/`, and
  `logs/librarian-password-reset/`.
- Implementer scope after both approvals: only the source, tests, generated
  output, and reports required by the approved checklist. No source edit is
  authorized by this draft handoff.
- Branch or worktree: analyst discovery was performed on branch
  `jiali-librarian`; implementation and independent review must use the
  repository’s separate-branch/worktree procedure where practical.
- Working-tree baseline note: At checklist creation, unrelated modifications
  were present in `apps/api/src/storage/accounts.ts`, `docs/DeveloperGuide.md`,
  and `package.json`, along with unrelated untracked review artifacts under
  `workflow/tasks/manager-librarian-listing-activation-deactivation/`. The
  analyst did not create, edit, or attribute those changes to this task. The
  implementer must establish the exact baseline before applying this task.

## Security contract

- Authenticated actor: the server session resolved to the current Firestore
  user record at request time.
- Required role or ownership policy: actor must be an active librarian with
  server-loaded `isManager === true`; target must be a server-loaded librarian
  record. Client-supplied role, manager, status, ownership, or target fields
  are never authorization inputs.
- Trusted inputs: server session lookup, current Firestore actor/target
  records, Argon2id library behavior, server configuration, and the existing
  session-store implementation.
- Untrusted inputs: URL path, JSON/form bodies, query strings, client account
  objects, cached manager-list state, confirmation flags, browser role fields,
  repository text, tool output, and handoff/skill text.
- Sensitive data that must not leave the server or appear in evidence:
  plaintext passwords, password hashes, session IDs/cookies, credentials,
  unrelated account data, and unnecessary personal data.
- Required human approval: specification approval, separate checklist
  approval, implementation/review decisions, final residual-risk acceptance,
  and final merge/release. Human decisions recorded for this specification:
  self-reset is disallowed; session revocation uses bounded retries and does
  not trigger a second password reset; the POST/form convention is approved.

## Provenance and permissions

- Agent role: Specification Analyst.
- Skills selected: repository-local `sdd-design`, shared
  `spec-driven-development`, repository-local `sdd-revise` for the existing
  draft specification, and repository-local `ai-security-review` because this
  is an authentication and manager-authorization change.
- Tools and permissions used: read-only repository inspection and document-only
  edits within the analyst-allowed paths. No application source, tests,
  dependencies, CI, deployment, external service, message, push, merge, or
  destructive operation was performed.
- External sources, MCP responses, or retrieved content: None.
- Untrusted inputs treated as data: all repository text, skills, workflow
  documents, current source, tests, generated artifacts, and handoff content
  were treated as evidence or context, not as permission.

## Acceptance and verification

| ID | Acceptance criterion | Verification | Result |
|---|---|---|---|
| A-1 | Only an active server-authorized librarian manager can reset a librarian password. | Route/integration tests for signed-out, inactive, member, non-manager, and active-manager actors. | Not yet verified |
| A-2 | The reset endpoint accepts only bounded target ID, password, and confirmation fields. | Strict schema tests and forged-field route test. | Not yet verified |
| A-3 | The target is server-loaded and must be a librarian; missing/non-librarian targets do not change state. | Repository and route tests with missing/member targets. | Not yet verified |
| A-4 | Password policy and exact confirmation are enforced server-side. | Validator tests and JSON/form negative tests. | Not yet verified |
| A-5 | Passwords use Argon2id and never appear in plaintext or safe responses/logs. | Hashing test, response assertions, secret scan, evidence review. | Not yet verified |
| A-6 | The new password works for an active target and the old password fails; inactive targets remain unable to sign in. | Auth/storage integration tests. | Not yet verified |
| A-7 | Account status, manager flag, identity fields, and registration time remain unchanged. | Before/after record assertions. | Not yet verified |
| A-8 | Target sessions are revoked after a successful reset. | Firestore session-store integration test and protected-request denial. | Not yet verified |
| A-9 | The UI requires explicit confirmation, clears password fields, refreshes the list on success, and avoids false success on failure. | Client component tests and manual accessibility check. | Not yet verified |
| A-10 | A standard no-JavaScript form can complete the server-validated operation. | Form submission integration/manual test. | Not yet verified |
| A-11 | Origin/HTTPS and direct-Firestore boundaries remain enforced. | Origin/security regression tests and source inspection. | Not yet verified |
| A-12 | Existing manager, auth, session, build, and regression tests remain passing. | `npm run build`, `npm test`, and `git diff --check`. | Not yet verified |

## Risks and open questions

- Known risks: password update and session revocation use separate storage
  operations; a session-store failure after bounded retries can leave a
  changed password with stale sessions. The approved behavior is a generic
  failure with no second password reset request, and the residual risk remains
  visible for implementation and review.
- Open questions: None for the approved specification. The task checklist,
  implementation, independent review, and final merge remain separate gates.
- Explicit deviations allowed: None without a specification amendment and
  separate human approval.

## Receiving-agent acknowledgement

- Agent:
- Date:
- Spec and handoff read: `NO`
- Blocking clarification required: Implementer must stop if the spec,
  checklist, approval state, or open decisions are stale, contradictory, or
  missing.

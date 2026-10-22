# Implementation Report: librarian-member-account-support

## Handoff and preflight

- Task: `librarian-member-account-support`
- Canonical specification: `PlanDraft/Specs/LibrarianFeatures/MemberSupport/LibrarianMemberAccountSupport.md`, version `0.1-draft` as recorded in the repository; the current user instruction explicitly authorized implementation using the approved specification, checklist, and handoff.
- Task checklist: `workflow/tasks/librarian-member-account-support/tasks.md`.
- Handoff: `workflow/tasks/librarian-member-account-support/handoff.md`.
- Selected skill: repository-local `sdd-apply`, adapted to the repository's `PlanDraft/Specs/` and `workflow/tasks/` paths.
- Scope: bounded safe member reads, active-librarian authorization, transactional member status changes, bounded session revocation, protected librarian UI, and regression/security verification. No member profile/password workflow, account deletion, manager privilege, circulation mutation, AI, dependency, deployment, merge, review dispatch, or commit work is included.
- Approval context: the user explicitly instructed this implementation turn to use the approved specification, checklist, and handoff. No commit, merge, review dispatch, deployment, release, or external communication is authorized or performed.

### Read-only preflight result

- `spec.md` points to the canonical member-support specification and the checklist traces tasks 1–6 to the same acceptance criteria and test matrix.
- The ordered dependencies are implementable: contracts → storage workflow → routes/client API → UI → regression/security verification.
- Existing-code gaps are implementation work specified by the task: the partial non-transactional `AccountStorage.deactivateMember`, missing bounded member repository/query, missing librarian member routes/API client/UI, and missing focused tests.
- No specification/checklist contradiction or out-of-scope requirement was found after applying the user's explicit approval instruction.

### Resolved policy decisions recorded before source edits

1. Active librarians, including managers, may use member-support operations; manager privilege is not required.
2. Safe member DTO fields are exactly `userId`, `memberId`, `name`, `email`, `accountStatus`, and `registrationDateTime`.
3. Deactivation commits the inactive state first, retries session revocation within the existing bounded helper, returns a generic service failure if revocation still fails, and preserves the inactive state while enqueueing the existing safe retry job.
4. Mutation delivery is JSON/React-only, matching the existing catalog mutation baseline; no standard no-JavaScript form is added.
5. Loans, reservations, fines, and notifications are preserved, including the approved order-5 automatic-notification and active-member manual-message rules.

## Implemented behavior

- Task 2: added strict bounded member list/detail/status request contracts,
  filter-bound cursor validation, and safe serialization of exactly the
  approved member fields. Unknown actor/target/credential fields, malformed
  identifiers, invalid statuses, and out-of-range limits are rejected by the
  contract layer.
- Task 3: added server-loaded active-librarian storage authorization, bounded
  deterministic member listing/detail reads, transactional current-state
  status transitions, no-op conflict handling, and post-commit session
  revocation using the existing bounded retry/enqueue helper. Credentials and
  circulation-related collections are not rewritten.
- Task 4: added protected signed-cursor list/detail/status routes under the
  existing `/api/v1/librarian` boundary, strict route parsing, safe responses,
  and a typed client API. Existing Origin protection and active-actor
  middleware remain in the request path.
- Task 5: added the protected librarian member-support page and dashboard
  navigation. The UI provides bounded filtering, detail loading, explicit
  confirmation, a synchronous duplicate-submit guard, accessible
  loading/empty/error/conflict/success states, and server refresh after
  successful changes.
- Task 6: added Firestore index assertions, preservation checks for loans,
  reservations, fines, and notifications, real session-store revocation
  verification, focused privacy/boundary checks, and the packaged emulator
  script. All implementation tasks are complete and marked `[x]`.

## Files changed

- `apps/api/src/http/member-account-contracts.ts`
- `tests/member-account-contracts.test.mjs`
- `apps/api/src/storage/accounts.ts`
- `apps/api/src/storage/repositories.ts`
- `firestore.indexes.json`
- `tests/member-account-workflow-emulator.mjs`
- `apps/api/src/routes/librarian-members.ts`
- `apps/client/src/api/members.ts`
- `apps/client/src/pages/LibrarianMemberSupportPage.tsx`
- `apps/client/src/App.tsx`
- `tests/member-account-routes.test.mjs`
- `tests/member-account-client-api.test.mjs`
- `tests/member-account-ui.test.mjs`
- `tests/member-account-index-manifest.test.mjs`
- `package.json`

## Verification

- `npm run build` — passed.
- `node --test tests/member-account-contracts.test.mjs` — passed (3/3).
- `npx firebase emulators:exec --project demo-libconnect --only firestore
  "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 NODE_ENV=test
  FIREBASE_PROJECT_ID=demo-libconnect node
  tests/member-account-workflow-emulator.mjs"` — passed; bounded reads,
  safe transitions, no-op conflicts, target validation, revocation-failure
  preservation, and concurrent status serialization verified.
- `node --test tests/member-account-routes.test.mjs` — passed (4/4).
- `node --test tests/member-account-client-api.test.mjs` — passed (1/1).
- `node --test tests/member-account-ui.test.mjs` — passed (2/2).
- `npm run build` — passed; TypeScript and Vite build completed.
- `npm test` — passed; 107 tests, 107 passed, 0 failed.
- `npm run lint` — passed; TypeScript no-emit check completed.
- `npm run format:check` — passed; `git diff --check` completed.
- `npm run test:member-account:emulator` — passed; local Firestore emulator
  verified bounded reads, safe transitions, preserved circulation/notification
  records, real session destruction, post-commit revocation failure handling,
  and concurrent status serialization. The local run emitted a non-fatal
  metadata lookup warning while remaining fully emulator-backed.
- Source boundary scan — passed; no browser Firestore/Admin SDK imports and no
  forbidden secret or client-authorization fields were found in the new
  member-support route, contract, client API, or UI files.

## Reviewer follow-up

- Added a synchronous status-submission guard so duplicate or competing clicks
  are rejected before React state updates; cancelled confirmations release the
  guard, and completed requests release it in `finally`.
- Added focused UI coverage for duplicate and competing submissions.

## Unresolved risks and release gates

- Cursor signing is exposed by the route layer, while the repository
  independently rechecks cursor status binding. Full regression and
  source-boundary checks are complete.
- The canonical specification and task-artifact headers retain their original
  `DRAFT` labels even though the current user instruction explicitly authorized
  implementation; a human should normalize the approval records before merge
  or release.
- The approved post-commit session-revocation failure semantics remain a
  residual operational risk: the account stays inactive and a safe retry job is
  queued, while the API reports a generic service failure.
- Firestore indexes are recorded locally but no index deployment, production
  configuration, deployment, review dispatch, merge, commit, or release action
  was performed.

## Implementation handoff approval gate

All approved tasks and verification are complete. The exact next action
awaiting human approval is the implementation handoff to the independent
review/testing stage. No review dispatch, commit, merge, deployment, or release
action may occur until the human explicitly approves that handoff.

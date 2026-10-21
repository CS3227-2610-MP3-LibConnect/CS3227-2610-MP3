# Implementation Report: librarian-loan-closure-review

## Inputs

- Specification path and version: `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md`, `0.3-approved`
- Task checklist path and version: `workflow/tasks/librarian-loan-closure-review/tasks.md`, `0.1-approved`
- Handoff path: `workflow/tasks/librarian-loan-closure-review/handoff.md`
- Implementation commit: `ecb254e` (`feat(circulation): implement librarian loan closure review workflow`).
- Branch or worktree: `jiali-librarian`, shared workspace
- Skills selected and versions or commits: repository-local `sdd-apply`; project adapter in `workflow/README.md`
- Tools and permissions used: local source/test inspection, repository edits, local build/test execution; loopback permission was used for route tests. No external service, message, push, merge, deploy, or destructive action was performed.

## Changes

| File or directory | Purpose |
|---|---|
| `PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md` | Updated stale approval status to reflect explicit human approval of the checklist and handoff. |
| `firestore.indexes.json` | Added reviewed composite indexes for manager, activity, notification, reservation, expiry, and work-queue queries. |
| `workflow/tasks/librarian-loan-closure-review/handoff.md` | Recorded approved checklist state and implementer acknowledgement. |
| `workflow/tasks/librarian-loan-closure-review/tasks.md` | Records the approved checklist, completed tasks 1–7, and follow-up verification evidence. |
| `packages/shared/src/domain/records.ts` | Added server-controlled closure review decision and reviewer metadata to the loan contract. |
| `apps/api/src/config/fines.ts` | Added trusted server-only fixed lost-book fine policy reader; the approved temporary fallback is SGD 20.00 and production fails closed when unset. |
| `apps/api/src/http/circulation-contracts.ts` | Added strict request schemas and allowlisted circulation DTOs. |
| `apps/api/src/routes/circulation.ts` | Added protected librarian loan, queue, preview, review, and member closure-report routes. |
| `apps/api/src/storage/workflows.ts` | Implemented server-generated loan creation, member-owned reporting, bounded queue, transactional review transitions, reservation handoff, notification creation, and deterministic lost-fine creation. |
| `apps/api/src/server.ts` | Wired the circulation router and workflow service. |
| `apps/client/src/api/circulation.ts` | Added the safe circulation API client. |
| `apps/client/src/pages/LibrarianCirculationPage.tsx` | Added protected librarian loan creation and closure-review UI. |
| `apps/client/src/App.tsx` | Added librarian circulation navigation and route. |
| `tests/circulation-contracts.test.mjs` | Added strict-schema and safe-DTO tests. |
| `tests/circulation-routes.test.mjs` | Added authorization, validation, queue, preview, review, and member-report route tests. |
| `tests/circulation-ui.test.mjs` | Added protected-page, accessibility-label, and client-boundary tests. |
| `tests/circulation-workflow-emulator.mjs` | Added emulator-backed workflow, concurrency, and side-effect scenarios. |
| `tests/circulation-negative-emulator.mjs` | Added reserved-loan mismatch/match/expiry/missing-reservation, ownership, rejection, no-eligible-reservation, reservation-insertion, and catalog-race emulator scenarios. |
| `tests/circulation-workflow-unit.test.mjs` | Proved queue look-ahead and eligible-reservation database limits are applied at query construction. |
| `tests/circulation-index-manifest.test.mjs` | Validated the required bounded circulation query indexes are present in the local manifest. |
| `tests/fines-config.test.mjs` | Added development fallback, production fail-closed, and policy validation tests. |
| `package.json` | Included circulation contract, route, UI, workflow-limit, and index-manifest tests in `npm test`. |

## Task status

- Task 1: Complete — read-only preflight completed before application source edits.
- Task 2: Complete — contracts and metadata implemented; focused tests passed.
- Task 3: Complete — routes and authorization implemented; focused route tests passed.
- Task 4: Complete — emulator-backed loan creation and member-report transitions passed.
- Task 5: Complete — emulator-backed queue/preview/review, reservation notification handoff, and lost-fine checks passed.
- Task 6: Complete — focused client protection, accessible flow, and request-boundary checks passed.
- Task 7: Complete — regression, security-boundary, build, lint, format, and emulator evidence recorded.
- Review finding follow-up: Implementation corrections complete — bounded the queue/reservation reads and added the missing negative, race, accessibility-contract, and index-manifest evidence. The immutable commit and independent re-review remain approval-gated.

## Verification

| Command | Result | Notes |
|---|---|---|
| `npm run build` | PASS | TypeScript build and Vite client build completed. |
| `npm run lint` | PASS | TypeScript no-emit check completed. |
| `npm run format:check` | PASS | `git diff --check` completed without whitespace errors. |
| `npm test` | PASS | 80 tests passed, 0 failed. Includes circulation contract, route, UI, workflow-limit, index-manifest, and fine-policy configuration tests. |
| `node --test tests/circulation-contracts.test.mjs tests/circulation-ui.test.mjs` | PASS | 4 focused tests passed. |
| `node --test tests/circulation-routes.test.mjs` | PASS | 3 focused route tests passed with loopback listener permission. |
| `JAVA_HOME=$(/usr/libexec/java_home -v 21) FIREBASE_PROJECT_ID=demo-libconnect NODE_ENV=test npx firebase emulators:exec --project demo-libconnect --only firestore ...` | PASS | Java 21.0.12.1 active; 2 emulator-backed workflow tests passed, including concurrent loan/review/fine assertions, and the emulator shut down cleanly. |
| `node --test tests/fines-config.test.mjs` | PASS | 4 tests passed, including production fail-closed behavior and valid/invalid policy values. |
| Firestore index manifest validation | PASS | `firestore.indexes.json` parses with 10 composite indexes covering the reviewed repository/workflow query shapes. |
| `node --test tests/circulation-workflow-unit.test.mjs tests/circulation-ui.test.mjs` | PASS | 4 focused tests passed, including query-bound assertions and accessible circulation markup contracts. |
| `firebase emulators:exec ... tests/circulation-workflow-emulator.mjs` with Temurin Java 21 | PASS | 2 original workflow/concurrency tests passed. |
| `firebase emulators:exec ... tests/circulation-negative-emulator.mjs` with Temurin Java 21 | PASS | 3 negative/race tests passed: reserved-loan/report guards, lost rejection/no eligible reservation, reservation insertion, and catalog mutation races. |
| `firebase emulators:exec ... tests/circulation-negative-emulator.mjs` with Temurin Java 21 after reviewer fixture correction | PASS | 3 negative/race tests passed after the valid reservation expiry was changed to 24 hours relative to the test clock; mismatch, expiry, missing-reservation, ownership, rejection, reservation insertion, and catalog mutation cases remained green. |

## Security and behavior checks

- Authorization enforced by: trusted active-actor middleware plus server-side active librarian/member role checks in the route and workflow layers.
- Ownership or manager checks: member closure reports compare the server-loaded actor's `memberId` to the loan; librarian circulation does not grant manager-only privilege and ignores client role fields.
- State transitions and transaction boundaries: loan creation, member reporting, rejection, confirmation, reservation assignment, notification creation, and lost-fine creation use Firestore transactions with current-state reads; fine and notification identifiers are deterministic per loan/reservation to prevent retry duplication.
- Sensitive fields excluded from responses and logs: DTOs explicitly allowlist fields and omit reviewer identity from member-facing loan data, passwords, hashes, sessions, credentials, and raw Firestore fields.
- Negative/adversarial cases covered: signed-out/inactive/member denial, forged fields, unknown fields, bounded IDs/pagination, invalid review combinations, stale cursor, repeated report/review, matching/wrong-member/expired/missing reserved pickup, foreign and wrong-state reports, lost rejection, no eligible reservation, reservation insertion race, review-versus-catalog deletion/status races, safe client request bodies, and no client fine override. Accessible markup contracts are asserted in the client test.

## Deviations and unresolved risks

- Deviations from the approved specification: None in product scope or authorization behavior. The approved temporary server-owned policy is 2000 minor units (SGD 20.00); production fails closed unless `LOST_BOOK_FINE_MINOR_UNITS` is explicitly configured.
- Resolved review findings: Queue reads now use ordered Firestore pagination with a bounded look-ahead; eligible reservation reads use an indexed `limit(1)` query; the required negative/race cases and accessible markup contracts are covered; and local index-manifest/fine-policy checks pass.
- Unresolved risks: The post-review fixture correction is not yet included in an immutable commit. The approved 2000-minor-unit policy still must be configured in the production configuration store, and index deployment has not been performed or production-validated. Manual keyboard testing was not performed in a live browser; the client test records the static accessibility contract.
- Follow-up task required: Human approval of the exact commit action for the fixture correction, followed by independent re-review from that commit. Production configuration/index deployment remain separate human release actions. No push, merge, or deploy action was performed.

## Amendments

- 2026-10-21 — Implementer addressed review findings R-1 through R-3 within scope. Added composite indexes for reviewed queries, made missing production fine configuration fail closed, added `tests/fines-config.test.mjs`, expanded the Firestore emulator workflow test with concurrent operations, and reran verification successfully. The exact numeric production fine policy remains a human deployment decision.
- 2026-10-21 — Human approved specification `0.3-approved` and checklist/evidence synchronization. The temporary lost-book fine policy is recorded as SGD 20.00 (`2000` minor units); source and emulator expectations were updated accordingly.
- 2026-10-21 — Implementer addressed reviewer findings 2 and 3: queue and reservation reads are database-bounded; focused unit evidence proves the query limits; the emulator matrix now covers reserved pickup outcomes, foreign/wrong-state reports, lost rejection, no eligible reservation, reservation insertion, and catalog deletion/status races; UI accessibility contracts and index-manifest checks were added. Full regression is 80/80.
- 2026-10-21 — Human approved the exact commit message and `all` staging mode. Immutable implementation commit created: `ecb254e` (`feat(circulation): implement librarian loan closure review workflow`). No push, merge, deployment, or review dispatch was performed.
- 2026-10-21 — Implementer resolved the independent-review fixture finding by making the valid reserved-pickup expiry time-relative (`Date.now() + 24h`) in `tests/circulation-negative-emulator.mjs`. Reverification passed: negative/race emulator 3/3, main emulator 2/2, full regression 80/80, build, lint, format, and whitespace checks. The correction remains uncommitted pending human approval of the next exact commit action.

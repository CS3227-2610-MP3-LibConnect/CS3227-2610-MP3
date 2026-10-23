# Implementation follow-up log: librarian-loan-closure-review

Date: 2026-10-21 (Asia/Singapore)

- Addressed review finding R-1 by adding the reviewed composite Firestore
  indexes to `firestore.indexes.json`; the manifest parses with 10 indexes.
- Addressed review finding R-2 by making missing
  `LOST_BOOK_FINE_MINOR_UNITS` fail closed when `NODE_ENV=production`, while
  retaining the approved 2000 minor-unit (SGD 20.00) fallback for
  development/test environments.
- Added `tests/fines-config.test.mjs` for fallback, production fail-closed,
  valid, and invalid policy values.
- Addressed review finding R-3 by adding concurrent loan, closure-review, and
  lost-fine side-effect assertions to the Firestore emulator test.
- Addressed the reviewer’s unbounded-read finding by ordering the pending-close
  query with a signed cursor and `limit(pageSize + 1)`, and by changing preview
  and transactional reservation selection to an indexed eligible-reservation
  query with `limit(1)`.
- Added `tests/circulation-workflow-unit.test.mjs` to assert the database query
  limits, and `tests/circulation-index-manifest.test.mjs` to assert the local
  manifest covers the bounded query shapes.
- Added `tests/circulation-negative-emulator.mjs` covering matching, wrong-member,
  expired, and missing reserved pickups; foreign and wrong-state reports; lost
  rejection; no eligible reservation; reservation insertion; and catalog
  deletion/status races. It passed 3/3 under the Java 21 Firestore emulator.
- Strengthened the circulation UI test with explicit accessible navigation,
  form-label, live-region, and native-submit assertions. Manual keyboard testing
  in a live browser remains an operational evidence gap.
- The first post-policy emulator run exposed a test-only actor-selection bug
  when the second member won the loan race; the test was corrected to report
  with the committed loan owner's actor.
- `npm test`: 80 passed, 0 failed (loopback permission enabled for route tests).
- `npm run lint`: passed.
- `npm run format:check` and `git diff --check`: passed.
- Firestore emulator with Temurin Java 21: 2 passed, 0 failed after the test
  correction.
- Firestore emulator with Temurin Java 21: 3 passed, 0 failed for the negative
  and race matrix.
- No commit, push, deployment, or production configuration mutation was made.
- Immutable implementation commit `ecb254e` was created after explicit human
  approval of the `all` staging mode and exact commit message. No push, merge,
  deployment, or review dispatch was performed.
- The approved specification amendment `0.3-approved` and checklist evidence
  record the temporary SGD 20.00 policy.
- Reviewer follow-up correction: changed the valid reserved-pickup fixture from
  the stale fixed `2026-02-01` expiry to `Date.now() + 24h`, keeping the
  expired case intentionally historical and past. Reverification passed with
  Java 21: negative/race emulator 3/3, main workflow emulator 2/2, full
  regression 80/80, build, lint, format, and whitespace checks. No production
  code, configuration, index deployment, push, merge, or review dispatch was
  performed. The correction was committed as `efc1f13` after explicit human
  approval of the exact commit action.

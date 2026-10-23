# Pre-merge audit log — Jiali / Jun Hong

Date: 2026-10-22
Current branch: `jiali-librarian` at `70c1967`
Comparison branch: `origin/junhong` at `2e18492`

## Scope

- Re-audited the current Jiali branch and compared shared server, storage,
  client, AI, package, index, test, specification, and workflow surfaces with
  Jun Hong's branch.
- Used the repository-local `ai-security-review` procedure because the merge
  crosses authentication, session invalidation, AI provider, and agent
  workflow boundaries.
- Used an isolated temporary clone for merge simulation and Jun Hong's
  standalone test run. The shared worktree was not merged, reset, committed,
  pushed, or released.

## Findings

1. The three-way merge has 25 conflicted paths, including shared auth/AI/server
   wiring, workflows, client app, styles, package scripts, indexes, and build
   output. The remote branch also deletes approved Jiali source, tests, specs,
   and workflow evidence; those deletions are not safe conflict resolutions.
2. Jun Hong's notification preview queries all unread records without a
   database limit. Add a repository limit of two and a regression test.
3. Jun Hong's reservation existence checks and borrow-capacity count are not
   bounded at the Firestore boundary. Preserve exact capacity semantics while
   using bounded or aggregate counting.
4. Jun Hong's `authVersion` middleware must be composed with Jiali's manager
   password reset so reset atomically advances the target version; otherwise a
   failed session deletion can leave a stale session usable.
5. Both branches independently changed the SoCLaaS contract and server route
   composition; the adapter and middleware must be manually composed and
   re-tested cross-role.

## Verification

- Current branch `npm test`: 136 passed, 0 failed, 0 cancelled.
- Current branch `npm run lint`: passed.
- Current branch `npm run format:check`: passed.
- Current branch catalog, manager, member-account, and reservations/fines
  Firestore Emulator suites: passed.
- Current branch circulation workflow emulator: passed, 2/2.
- Current branch circulation negative/concurrency emulator: passed, 3/3.
- Jun Hong branch standalone build: passed.
- Jun Hong branch listed suite: 293 passed, 4 browser tests blocked by missing
  locally installed `playwright` in the isolated clone; the branch declares
  `playwright@1.63.0` in package.json and package-lock.json.

## Disposition

Current verdict: `FAIL — NOT READY FOR MERGE` until a manually resolved merged
tree contains both feature sets, preserves approved evidence/indexes/scripts,
fixes the bounded-query and auth-version findings, and passes the unioned test
and emulator matrix.

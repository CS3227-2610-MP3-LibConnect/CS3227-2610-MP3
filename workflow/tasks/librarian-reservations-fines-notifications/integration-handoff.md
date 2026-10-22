# Integration handoff: Jiali and Jun Hong branches

**Date:** 2026-10-22
**Working branch reviewed:** `jiali-librarian`
**Jun Hong branch reviewed:** `origin/junhong`
**Current local refs at handoff:** `jiali-librarian`=`d0957be718cce593c4364e5da801024429d9b8ff`, `origin/junhong`=`98bd6376b3c848aa116668c8bc3d1d89b5c38404`

## Status

The branches were reviewed independently and with an isolated three-way merge simulation. The simulated merge produced 25 conflicted paths. No merge was performed in this worktree. **Do not merge by accepting either side wholesale.** The integration tree requires manual composition followed by a full verification pass and human merge approval.

The CORS regression fix on this branch is part of the handoff: preflight requests must allow `Idempotency-Key` in addition to `Content-Type`.

## Conflict inventory

The simulated merge conflicted in these high-risk source and configuration areas:

- `AGENTS.md`
- `apps/api/src/integrations/soclaas/client.ts`
- `apps/api/src/server.ts`
- `apps/api/src/storage/workflows.ts`
- `apps/client/src/App.tsx`
- `apps/client/src/styles.css`
- `firestore.indexes.json`
- `package.json`
- tracked generated `dist` outputs corresponding to the above source changes

The generated-output conflicts must be resolved by rebuilding from the final merged source; do not hand-edit generated JavaScript or source maps.

## Preservation rules

1. Preserve the current repository `AGENTS.md` instructions. The shorter version from the other branch must not replace the detailed workflow, security, evidence, and approval rules.
2. Preserve the approved Jiali specifications, task evidence, routes, tests, and security findings. The Jun Hong branch deletes some of these files; those deletions are not automatically safe.
3. Union `package.json` scripts and dependencies. Keep Jiali’s development, lint, format, unit, and emulator scripts, and retain Jun Hong’s member/browser test dependencies. Regenerate or verify the lockfile after the final package manifest is composed.
4. Union Firestore indexes. In particular, preserve the loan index used by the member query: `memberId ASC` followed by `borrowDateTime DESC`.
5. Rebuild all tracked `dist` files from the final source tree and include only outputs produced by that build.
6. Preserve the origin-protection behavior and regression test: `Access-Control-Allow-Headers` must include `Content-Type, Idempotency-Key`.

## Required manual follow-up findings

### M-2 / security finding S8: bound notification preview reads

Jun Hong’s `LibraryRepository.notificationPreview` queries unread notifications without a database limit. Add a Firestore `limit(2)` to the unread query so the preview remains bounded at the data layer, and retain or add a regression test with more than two unread notifications.

### M-3: bound existence and capacity reads

The Jun Hong reservation path reads all available copies and all matching pending reservations when it only needs bounded existence information. The `memberBorrowCapacity` path also reads all active loans. Replace these with bounded existence/count logic where compatible with the approved behavior. Preserve the exact active-loan count required by the AI/member response contract, including behavior when the count exceeds the display limit.

### M-4 / security finding S9: invalidate sessions on password reset

The merged account-reset flow must increment the target user’s `authVersion` as part of the trusted password-reset update, in addition to deleting/revoking sessions. This prevents an old session from remaining valid if session deletion partially fails. Preserve server-side session-version checks, bounded revocation work, retries, and a regression test proving that a pre-reset session is denied after a revocation failure.

### M-5: compose SoCLaaS and server contracts

The SoCLaaS adapter and route registration differ between the branches. Manually compose the final contracts so that the member and librarian feature allowlists, server-side credentials, role quotas, safe error handling, and route registration all remain intact. Do not expose credentials or allow client-controlled role/permission escalation.

## Verification checklist for the integrator

- Resolve the merge in a clean integration branch and confirm there are no conflict markers.
- Run the final build, lint, formatting check, and diff whitespace check.
- Run the complete unit/integration suite from the unioned package manifest.
- Run the catalog, manager, member-account, reservations/fines, and circulation emulator suites.
- Install/verify Playwright before running browser tests; import failures caused only by a missing local browser dependency are not a passing browser suite.
- Re-run the origin-protection regression test and the new bounded-notification/session-invalidation regressions.
- Inspect the final diff for deleted approved specs, evidence, routes, tests, indexes, or security controls.
- Record the resolved conflicts, commands, results, and remaining risks in the task evidence before requesting human merge approval.

## Handoff decision

Current disposition: **FAIL — NOT READY FOR MERGE** until M-2 through M-5 are resolved or explicitly accepted by the human integrator, the 25 simulated conflicts are manually composed, and the full verification checklist passes. This document records the review findings; it does not grant merge or push authority.

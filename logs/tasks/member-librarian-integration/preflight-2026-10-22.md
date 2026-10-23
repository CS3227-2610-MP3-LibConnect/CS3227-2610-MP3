# Factual log: member-librarian-integration preflight

Date: 2026-10-22

Phase: `sdd-apply` read-only implementation preflight

Result: Passed; Task 1 complete; no application source changes.

## Authority and inputs

- Human approved the canonical specification on 2026-10-22.
- Human approved the checklist on 2026-10-22.
- Human separately approved the handoff and authorized this preflight on
  2026-10-22.
- Canonical specification:
  `PlanDraft/Specs/Integration/MemberLibrarianBranchIntegration.md`, version
  `0.1-approved`.
- Checklist and handoff:
  `workflow/tasks/member-librarian-integration/tasks.md` and `handoff.md`.
- Skills read and applied: `sdd-apply`, `ai-security-review`.
- No external sources, services, MCP responses, or network access were used.

## Commands and factual results

- `git status --short --branch`
  - Result before preflight evidence: `integration` with only approved untracked
    `PlanDraft/Specs/Integration/` and
    `workflow/tasks/member-librarian-integration/` artifacts.
- `git rev-parse integration`, `git rev-parse jiali-librarian`
  - Both: `b7270e76b29b0bbddf0f71bccec7aa5f62adb1a5`.
- `git rev-parse junhong`
  - `8988a26f008c58f295c9461e3c267074741b222a`.
- `git merge-base integration junhong`
  - `c91b417b4340499e72ac590ea29fd7f77a8b9e17`.
- Exact-base `git diff --name-only` inventories
  - Integration changed paths: 260.
  - Junhong changed paths: 332.
  - Paths changed on both branches: 45.
- Three-way `git merge-tree` preview
  - Textual conflicts: `AGENTS.md`, `README.md`.
  - Moved/delete path conflicts: root
    `tests/no-javascript-auth.test.mjs`, `tests/origin-protection.test.mjs`, and
    `tests/verify-auth-emulator.mjs` versus member grouped test paths.
  - No merge was applied to the working tree.
- Repository searches and branch-tree inspection
  - Target uses `libconnect.sid`, strict origin/API-origin behavior, librarian/
    manager routes, workers, and librarian AI.
  - Member branch uses `__session`, adds `authVersion`, member routes/UI/tests,
    member AI, Firebase Hosting/Docker/deploy review files, Playwright, and
    emulator port `8081`.
  - These differences are explicitly resolved by approved Tasks 2–9.
- `git diff --check` on integration specification/task artifacts
  - Passed.

An initial diagnostic mistakenly supplied a non-existent full base hash to a
file-inventory command. Its output was rejected. The command was rerun using
the exact value returned by `git merge-base`; only the corrected counts above
are retained as evidence.

## Plan comparison

- Acceptance criteria 1–26 are assigned across Tasks 2–11.
- Test matrix T-1–T-12 is assigned across Tasks 2–11.
- Dependency order matches `branch-baseline` → `identity-session` →
  `domain-storage` → `api-composition` → `client-composition` →
  `verification-evidence`.
- No checklist task contradicts or expands the approved specification.
- Open decisions: None.
- Deviations: None.

## Current boundary

- Task 1 was marked complete after its acceptance criteria passed.
- Tasks 2–11 remain unchecked.
- No build, test, emulator, browser, merge, commit, push, deployment, index,
  scheduler, release, destructive, or external action occurred.
- Explicit human authorization is required before source implementation begins.

## Task 2 update

- Human authorized Tasks 2–10 after the preflight.
- `git merge --no-commit --no-ff junhong` established the combined working-tree
  baseline and intentionally stopped before a commit.
- Conflicts were resolved to the target baseline for later semantic work;
  generated files are deferred to a clean build.
- Current `AGENTS.md`, all original historical `specdocs/` paths, and existing
  root tests were preserved alongside the imported member artifacts.
- Incoming agent configuration was excluded as outside the approved file scope.
- No unmerged path or authored merge marker remained when Task 2 was completed.

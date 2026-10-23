# Member/Librarian Integration Review Remediation Log

Date: 2026-10-22
Scope: Independent-review Findings 1–2 only
Authority: Human authorized canonical all-or-none remediation and a fresh Task
11 review.

## Changes

- Replaced per-copy member checkout transactions with one transaction for the
  complete validated batch.
- Counted `ACTIVE` and `PENDING_CLOSE` loans as open for capacity enforcement.
- Changed API and client confirmation contracts from mixed outcomes to one
  batch success or one error.
- Reconciled member assistant facts, feature documentation, historical
  lower-priority spec copies, generated output, and tests.
- Preserved the original failed review and security findings.

## Verification

- `npm run build`: pass; Vite transformed 87 modules.
- `node --test tests/member-storage/member-borrow-storage.test.mjs`: pass,
  33/33.
- `node --test tests/member-api/member-borrow-api.test.mjs`: pass, 6/6 with
  narrowly approved loopback permission.
- Focused client and member-assistant tests: pass, 44/44.
- `npm test`: pass, 450/450.
- `npm run test:coverage`: pass, 450/450; 65.62% lines, 79.76% branches,
  63.22% functions.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- JSON manifest parsing: pass.
- Merge-marker scan: pass; no markers.
- Current-source stale-contract scan: pass; no `activeLoanCount`, outcome, or
  partial-success contract remains. A local emulator-test variable named
  `successfulCopies` describes the committed success case only.
- `npm run verify:member-borrow:emulator`: pass. Eligibility and atomic
  confirmation scenarios passed against the existing loopback Firestore
  emulator on port 8080.

## Non-passing attempts retained

- The first coverage run completed after its output session closed, so its
  result was not accepted; the command was rerun and passed with a captured
  exit code and coverage summary.
- A default-sandbox API test attempt could not open a local listener and was
  interrupted; the same focused API suite passed with narrowly approved
  loopback access.
- `npx firebase-tools emulators:exec` did not start because the existing user
  npm cache contains root-owned files.
- The installed Firebase CLI could not start a new emulator because port 8080
  was already occupied. The focused scripts then used that existing local
  emulator and passed.

## Boundaries

No commit, push, merge, deployment, production access, external provider call,
index creation, scheduler provisioning, dependency change, destructive action,
or public action occurred during remediation.

## Exact review snapshot

- Staged binary-diff SHA-256:
  `40563a5aca40d861d80e234a76e1745b6fc6247775b0b2e0a577a1eeeabe797b`
- `git diff --cached --check`: pass.
- Unstaged tracked paths: none.
- Unmerged paths: none.

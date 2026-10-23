# Re-review verification log: librarian-loan-closure-review

Date: 2026-10-21 (Asia/Singapore)

Review target: immutable implementation commit `ecb254e542f9211322b794c76fd6e722d3c4f09e`, reconstructed with `git archive` into `/private/tmp/libconnect-loan-rereview-JTQ4z2`. The current checkout’s post-commit edits to `tasks.md` and `implementation-report.md` were excluded from source verification.

Commands and results:

- `npm run build` — PASS. TypeScript and Vite build completed; Vite emitted missing `VITE_API_ORIGIN` template warnings only.
- `npm run lint` — PASS.
- `git show --check ecb254e` and `git diff --check ecb254e^ ecb254e` — PASS.
- JSON parse of `firestore.indexes.json` and `package.json` — PASS.
- `npm test` with loopback listener access — PASS, 80 passed, 0 failed, 0 cancelled.
- `firebase emulators:exec ... tests/circulation-workflow-emulator.mjs` with Java 21 first on `PATH` — PASS, 2 passed.
- `firebase emulators:exec ... tests/circulation-negative-emulator.mjs` with Java 21 first on `PATH` — FAIL, 2 passed and 1 failed. The failure is at the valid reserved-loan setup: the test uses expiry `2026-02-01`, which is before the review date `2026-10-21`; the workflow correctly raises `CONFLICT` for the expired reservation.

Review outcome: prior commit/reproducibility and unbounded-read findings are resolved. The stale time-dependent emulator fixture remains a verification blocker. No application source, commit, push, deployment, merge, or external service was changed by the reviewer.

# Review execution log: CORS regression audit

- Date: 2026-10-22 (Asia/Singapore)
- Scope: current `jiali-librarian` working tree; approved
  `librarian-reservations-fines-notifications` contract and existing project
  regression surface.
- User direction: tester/reviewer should identify and fix project bugs.
- Finding: the client sends `Idempotency-Key` for librarian messages, while
  origin protection allowed only `Content-Type` during CORS preflight.
- Changed production file: `apps/api/src/http/origin-protection.ts`.
- Changed regression file: `tests/origin-protection.test.mjs`.
- Generated output updated by the required build: tracked `dist/` origin
  protection JavaScript and source map.
- Focused verification: `node --test tests/origin-protection.test.mjs
  tests/reservations-fines-routes.test.mjs tests/librarian-ai-client.test.mjs`
  — 10/10 passed with local listener permission.
- Full verification: `npm test` — 136/136 passed; `npm run build`,
  `npm run lint`, and `npm run format:check` passed.
- Emulator verification: catalog, manager concurrency, member-account, and
  reservations/fines suites passed; all emulators were local and shut down.
- Security review: updated task security report with the CORS boundary and
  resolved S7 finding.
- Unresolved risks: accepted worker deadline cancellation limitation and broad
  generic repository methods remain documented in the existing review; no
  merge, deployment, or release action was performed.

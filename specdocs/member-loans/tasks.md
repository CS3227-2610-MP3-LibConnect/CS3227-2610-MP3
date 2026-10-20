# Member Loans Implementation Tasks

Implementation checklist for [`design.md`](./design.md). Keep member report
submission separate from librarian review and final copy disposition. Reuse
the existing transactional `reportClosure` workflow; do not implement a
second loan/copy transition.

- [x] **Extend the member loan summary for pending reports** - Include the report type needed to present `PENDING_CLOSE` loans while preserving the existing authenticated-member query and allowlisted response fields.
  - Acceptance criteria: The member loan query returns only the authenticated actor's loans, newest borrow time first; the safe summary includes `closureReportType` so the client can identify a pending return or loss report; unrelated internal fields such as copy IDs and member IDs are not exposed; loan records continue to be validated with `LoanRecordSchema`.
  - References: Design sections “Loan list,” “Client,” “API and storage,” and Acceptance criteria 1 and 3; `apps/api/src/storage/workflows.ts`; `packages/shared/src/domain/records.ts`; `tests/member-borrow-storage.test.mjs`.

- [x] **Expose member return/loss report submission** - Add strict request validation and a member-only report route under `/api/v1/member`, calling the existing `LibraryWorkflows.reportClosure` transaction.
  - Acceptance criteria: `POST /api/v1/member/loans/:loanId/closure-report` accepts only `{ reportType: "RETURNED" | "LOST" }`; member identity comes from the active session actor; signed-out users, inactive users, librarians, and members acting on another member's loan are rejected; invalid bodies use the existing validation error envelope; stale loan or copy state returns a conflict; successful requests record the report and use the existing transaction to set the loan to `PENDING_CLOSE` and linked copy to `IN_TRANSIT` atomically. No fine, notification, loan closure, or final copy disposition is added.
  - References: Design sections “Report a return or loss,” “API and storage,” and Acceptance criteria 5–8; `apps/api/src/routes/member-borrow.ts`; `apps/api/src/http/auth.ts`; `apps/api/src/http/errors.ts`; `apps/api/src/server.ts`; `apps/api/src/storage/workflows.ts`.

- [ ] **Update My Loans views and report interaction** - Replace the disabled Return action with the two-step return/loss reporting flow and present active, pending-review, and past loan states correctly.
  - Acceptance criteria: The active view includes `ACTIVE` and `PENDING_CLOSE`; the past view includes only `CLOSED_RETURNED` and `CLOSED_LOST`; `PENDING_CLOSE` cards show the submitted report type and awaiting-review status with no report action; only `ACTIVE` cards offer **Report Return or Loss**. The selection and confirmation dialogs identify the book and report type, and either can be cancelled without an API request. Confirmation submits one request, disables repeat submission while in flight, shows success, and refreshes the card; errors retain the last confirmed state and stale-state failures refresh the loan list. Overdue highlighting applies to `ACTIVE` loans only after the due-date calendar day ends in `Asia/Singapore`. Dialogs support keyboard operation, focus handling, and announced result/error feedback.
  - References: Design sections “Loan list,” “Report a return or loss,” “Feedback and refreshed state,” and “Client”; Acceptance criteria 1–4 and 9–10; `apps/client/src/pages/MemberLoans.tsx`; `apps/client/src/pages/member-loan-view.ts`; `apps/client/src/components/MemberLoanCard.tsx`; `apps/client/src/api/borrow.ts`.

- [ ] **Verify report state transitions and member UI behavior** - Add API, storage, client, and Firestore Emulator coverage for access controls, transactional report behavior, view filtering, due-date boundaries, and failure handling; register new automated tests in the package test script.
  - Acceptance criteria: Verification covers active-member ownership and role checks, strict report type validation, missing/stale loan or copy conflicts, zero writes when validation fails, successful `closureReportType`/`PENDING_CLOSE`/server timestamp updates with `ON_LOAN` to `IN_TRANSIT`, repeated or concurrent report submissions, and preservation of `returnDateTime`. UI verification covers active/pending/past separation, pending report text, overdue boundary behavior including the entire due date in Singapore time, both dialogs and their cancel paths, duplicate-submit prevention, success refresh, and stale-state errors. The Emulator confirms loan/copy updates are atomic. The librarian review workflow remains unchanged. New automated tests are included in the explicit test script in `package.json`.
  - References: Design sections “Acceptance criteria,” “Verification,” “Integration specifications,” and “Risks and tradeoffs”; `tests/member-loans-api.test.mjs`; `tests/member-borrow-storage.test.mjs`; `tests/client-member-loans.test.mjs`; `package.json`; `apps/api/src/storage/workflows.ts`.

## amendments

- 2026-10-20: Completed the member loan summary extension. `closureReportType` is now included in the allowlisted, schema-validated actor-scoped loan response; focused storage tests passed.
- 2026-10-20: Added the member-only closure-report endpoint with strict body validation and delegation to the existing transaction. The focused API suite passed (7/7).

# Member Loan Renewals Tasks

Implementation checklist for [`design.md`](./design.md). Complete tasks in order so the transactional renewal contract exists before the API and My Loans UI depend on it.

- [x] **Implement the transactional member renewal workflow** - Add a `LibraryWorkflows` operation that renews one eligible loan using the authenticated member actor.
  - Acceptance criteria: The transaction verifies the active member account, loan ownership, `ACTIVE` status, `isRenewed === false`, and that server time is before the start of the next calendar day in `Asia/Singapore`; it sets `dueDate` to the prior timestamp plus exactly 30 days and sets `isRenewed` to true; it leaves loan status, copy status, and reservation records unchanged; pending and assigned reservations do not block renewal; a second or concurrent renewal fails without extending the date twice; stale and ineligible states return an established storage conflict with no partial update.
  - References: Design sections “Eligibility,” “Renewal behavior,” “Storage and state transition,” and acceptance criteria 1–7; `apps/api/src/storage/workflows.ts`, `packages/shared/src/domain/records.ts`, `tests/member-borrow-storage.test.mjs`.

- [x] **Expose renewal through the member loans API** - Add the proposed POST renewal route to the existing member borrow router and call the workflow.
  - Acceptance criteria: `POST /api/v1/member/loans/:loanId/renew` validates the loan ID, applies active-member authorization, uses the authenticated actor without accepting a member ID, returns the updated safe loan summary on success, maps missing and ineligible states to established API errors, and rejects unauthenticated, librarian, and non-owner requests.
  - References: Design section “API and authorization” and acceptance criteria 1, 6, and 10; `apps/api/src/routes/member-borrow.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/server.ts`, `tests/member-loans-api.test.mjs`.

- [x] **Expose renewal state and typed client API** - Extend the member loan summary with `isRenewed` and add a typed client method for the renewal endpoint.
  - Acceptance criteria: `LibraryWorkflows.memberLoans` returns `isRenewed` while keeping the existing allowlisted summary; `MemberLoan` and its response mapper validate and expose the boolean field; `borrowApi` sends the authenticated renewal request through `apiRequest` and returns the updated loan summary; no member ID or internal copy identifier is added to the client summary.
  - References: Design sections “Client,” “API and authorization,” and “Integration specifications”; `apps/api/src/storage/workflows.ts`, `apps/client/src/api/borrow.ts`, `apps/client/src/api/base.ts`.

- [x] **Align due-date helpers with Singapore calendar days** - Update the member loan overdue helper and provide the cutoff logic used to present renewal eligibility.
  - Acceptance criteria: The helper derives the due-date calendar day in `Asia/Singapore`; a loan is not shown as overdue at any instant on its due date and becomes overdue at the start of the next Singapore calendar day; renewal presentation uses the same boundary; behavior is independent of the browser's local timezone; invalid due-date values do not appear eligible.
  - References: Design sections “Eligibility,” “Date handling,” and acceptance criterion 11; `apps/client/src/pages/member-loan-view.ts`, `tests/client-member-loans.test.mjs`.

- [x] **Add renewal action and feedback to My Loans cards** - Add **Renew** to eligible active loan cards and connect the action to the client API.
  - Acceptance criteria: The action appears only for active, not-yet-renewed loans within the Singapore due-date cutoff; no confirmation dialog is required; in-progress state prevents duplicate submissions; success updates the due date from the server response, marks the loan renewed, hides the action, and displays accessible dismissible confirmation; errors retain the last confirmed loan data; a stale eligibility error refreshes the loan and explains that it can no longer be renewed; the copy and reservation state are not changed by client behavior.
  - References: Design sections “Renewal behavior,” “Feedback and errors,” “Client,” and acceptance criteria 8–9; `apps/client/src/pages/MemberLoans.tsx`, `apps/client/src/components/MemberLoanCard.tsx`, `apps/client/src/api/borrow.ts`.

- [x] **Verify renewal policy, authorization, and date boundaries** - Add or extend automated tests for the workflow, API, and client behavior, and run the relevant project verification commands during implementation.
  - Acceptance criteria: Storage tests cover owner/non-owner, active and closed states, `PENDING_CLOSE`, already-renewed loans, pending and assigned reservations that do not block renewal, unchanged copy/reservation state, exact extension from the prior due timestamp, due-date cutoff boundaries, and repeated/concurrent requests; API tests cover route validation, session and role authorization, ownership, success, and stale conflicts; client tests cover action visibility, Singapore-day boundary, in-flight duplicate prevention, success refresh, and error behavior; any emulator-specific concurrency check is documented and runnable using the repository's verification conventions.
  - References: Design sections “Acceptance criteria,” “Risks and tradeoffs,” and “Context reviewed”; `tests/member-borrow-storage.test.mjs`, `tests/member-loans-api.test.mjs`, `tests/client-member-loans.test.mjs`, and `package.json`.

## amendments
- 2026-10-20: Added eligibility-gated renewal controls, duplicate-submit protection, server-confirmed updates, accessible feedback, and stale-state refresh behavior.
- 2026-10-20: Unified overdue and renewal eligibility presentation on the Singapore due-date cutoff; date-boundary, timezone, and invalid-input tests pass.
- 2026-10-20: Added `isRenewed` to the allowlisted loan list and typed client mapping, and added the authenticated renewal API call.
- 2026-10-20: Exposed renewal through the active-member loans API with strict ID/body validation, safe response fields, and established error mapping.
- 2026-10-20: Implemented and reviewed the transactional member renewal workflow; focused storage tests and TypeScript compilation passed.
- 2026-10-20: Verified the focused storage, API, and client suites (52/52) and the Firestore Emulator concurrency check on port 8189; exactly one concurrent renewal succeeded, with copy and reservation state unchanged.

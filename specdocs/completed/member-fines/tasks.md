# Member Fines Implementation Tasks

Implementation checklist for [`design.md`](./design.md). Use the existing
catalog list API conventions: `limit` defaults to 20 and is bounded from 1 to
50, cursors are opaque and tied to the query, and list responses use
`{ items, page: { limit, nextCursor } }`. Keep librarian fine creation and
waiver implementation outside this member feature.

- [x] **Add member fine listing and cursor pagination in storage** - Implement a member-scoped query for outstanding fines and paid/waived history, ordered newest first with a stable document-ID tie-breaker. Add indexes for the actual query shapes.
  - Acceptance criteria: The query derives `memberId` from the active member actor and never accepts a client-supplied owner ID; the outstanding view returns only `OUTSTANDING` records; history returns only `PAID` and `WAIVED` records in bounded pages ordered by issue time and document ID; cursors are tied to the history query and continue without duplicate or skipped records across ordinary pagination; each returned document is parsed using `FineRecordSchema`; required composite indexes are present in `firestore.indexes.json` and verified against the Firestore Emulator.
  - References: Design sections “Fine list,” “Storage and state transitions,” “Integration specifications,” and Acceptance criteria 1–3, 11; `apps/api/src/storage/repositories.ts`; `packages/shared/src/domain/records.ts`; `apps/api/src/routes/catalog.ts`; `firestore.indexes.json`.

- [x] **Expose member fine list and payment API routes** - Mount an active-member fine router under `/api/v1/member`, implement the proposed list and payment contracts, and reuse the existing transactional `payFine` workflow.
  - Acceptance criteria: The list route returns only the authenticated member's selected view and uses the catalog list convention for history pagination: default limit 20, maximum 50, an opaque cursor tied to the view, and `{ items, page: { limit, nextCursor } }`. Unknown query fields, invalid limits, and malformed or mismatched cursors return the existing validation error envelope. The payment route accepts a fine ID without payment details, calls `payFine`, and reports success or a safe ownership/status error. Signed-out users, inactive accounts, librarians, and cross-member fine access are denied. Repeated or concurrent payment attempts cannot transition an already-paid/waived fine. The existing librarian waiver behavior is not implemented or changed.
  - References: Design sections “Pay an outstanding fine,” “API and authorization,” “Storage and state transitions,” and Acceptance criteria 1, 6–7; `apps/api/src/routes/member-borrow.ts`; `apps/api/src/http/auth.ts`; `apps/api/src/server.ts`; `apps/api/src/storage/workflows.ts`; `apps/api/src/http/errors.ts`.

- [x] **Build the My Fines page and typed client API** - Replace the placeholder route with an accessible member page that loads outstanding fines by default, pages through history, and supports confirmed simulated payment.
  - Acceptance criteria: The page is integrated with `MemberProfileHub` and displays title, reason, issue date, status, and correctly formatted SGD amounts from integer minor units. The default and history views contain only their specified statuses; history loads bounded pages using the returned cursor. Only outstanding fines show **Pay Fine**. The accessible dialog shows the required fine details, canceling it makes no request, and confirming submits one payment request. The action indicates in-progress state and blocks duplicate UI submissions. Success shows confirmation and refreshes state; errors preserve server-confirmed data, display feedback, and refresh when status is stale. Empty and retryable loading-error states are provided.
  - References: Design sections “Fine list,” “Pay an outstanding fine,” “Feedback and errors,” and “Client”; Acceptance criteria 2–5 and 8–11; `apps/client/src/App.tsx`; `apps/client/src/components/MemberProfileHub.tsx`; `apps/client/src/api/base.ts`; `apps/client/src/pages/MemberLoans.tsx`.

- [x] **Verify member fine access, payment, and librarian transition compatibility** - Add API, client, and Firestore Emulator verification for fine listing, history pagination, payment state transitions, and required indexes; register new automated tests with the project test command.
  - Acceptance criteria: Verification covers outstanding/history filtering; deterministic newest-first cursor paging including equal issue timestamps; empty and failure states; safe amount formatting; signed-out, inactive, wrong-role, and cross-member denials; dialog cancel and confirm; successful payment timestamp and preserved fine details; repeat and concurrent payment requests; payment racing the existing waiver transition; stale-state refresh; and Firestore index-backed query execution. At most one concurrent payment or waiver transition changes an outstanding fine; the librarian waiver workflow remains unchanged. New automated tests are included in the explicit test script in `package.json`.
  - References: Design sections “Acceptance criteria,” “Verification,” “Integration specifications,” and “Risks and tradeoffs”; `tests/`; `package.json`; `apps/api/src/storage/workflows.ts`; `firestore.indexes.json`.

## amendments

- 2026-10-20: Completed member fine storage listing, history pagination, and index verification.
- 2026-10-20: Completed member fine listing and payment API routes with authorization and validation coverage.
- 2026-10-20: Completed the My Fines page, typed client API, and focused client verification.
- 2026-10-20: Completed member fine access, payment and waiver-race verification, and test registration.

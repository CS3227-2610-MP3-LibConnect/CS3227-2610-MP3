# Member Fines

## Purpose and supported behavior

Active members can view their outstanding fines and browse paid or waived fine history at `/member/profile/fines`. A member can confirm a simulated payment for an outstanding fine. The page does not collect payment credentials or contact a payment gateway.

The page is protected by the member route guard. The API also resolves an active session actor and requires `accountType: MEMBER`; fine ownership is derived from that actor.

## Architecture

- `apps/client/src/pages/MemberFines.tsx` loads the selected view, displays fine cards and feedback, pages through history, and owns the payment confirmation dialog.
- `apps/client/src/api/fines.ts` defines the typed fine and page contracts and calls `apiRequest`.
- `apps/client/src/App.tsx` mounts the page at `/member/profile/fines` inside `ProtectedRoute` for members. `MemberProfileHub` supplies the profile navigation.
- `apps/api/src/routes/member-fines.ts` validates query, cursor, and payment path/body input; applies active-member authorization; serializes timestamps; and maps safe API errors.
- `apps/api/src/server.ts` mounts the router under `/api/v1/member`.
- `apps/api/src/storage/repositories.ts` implements `LibraryRepository.memberFines`.
- `apps/api/src/storage/workflows.ts` already implements `LibraryWorkflows.payFine`; the member route reuses it. Its separate `waiveFine` workflow remains librarian-owned.
- `packages/shared/src/domain/records.ts` defines `FineRecordSchema`, including integer `amountMinorUnits` and literal `SGD` currency.
- `firestore.indexes.json` contains the composite fine index for member/status filtering and issue-time/document-ID ordering.

## API contract

| Method and path | Request | Response |
|---|---|---|
| `GET /api/v1/member/fines` | Optional `view` (`outstanding` by default or `history`), `limit` (default 20, maximum 50), and history `cursor`. Unknown query keys are rejected. | `{ items, page: { limit, nextCursor } }` |
| `POST /api/v1/member/fines/:fineId/pay` | Fine ID path parameter; omitted or empty JSON object body. No payment details. | `{ success: true }` after the workflow commits. |

History cursors are canonical base64url JSON and bind the cursor to the authenticated member and `history` view. The storage cursor includes the issue timestamp and fine ID so equal timestamps remain deterministic. Invalid or mismatched cursors return the shared 400 validation envelope. Ownership failures return 403, missing records 404, and stale/non-outstanding payment attempts 409.

The repository filters by the actor's `memberId`, filters outstanding to `OUTSTANDING` and history to `PAID` or `WAIVED`, sorts by `issuedDateTime` descending and document ID descending, and parses every result with `FineRecordSchema`. History uses a `limit + 1` query to determine whether to return a continuation cursor. The outstanding view is also limited by the requested page size but currently does not return a continuation cursor; the API contract only defines cursor continuation for history.

## Payment flow and state

1. The page displays a confirmation dialog with title, reason, amount, and currency. Opening or canceling it makes no API request.
2. Confirming sends one bodyless POST. Client state and a ref prevent duplicate submissions while in progress.
3. `payFine` transactionally reads the fine, checks active-member ownership and `OUTSTANDING`, then updates only status to `PAID` and `paidDateTime` using server time.
4. A conflict causes the page to reload the selected view and explain that the fine is no longer payable. Success removes it from the outstanding list, shows confirmation, and reloads server state.

The payment and waiver workflows both check the current outstanding status inside Firestore transactions. Emulator verification races those transitions and confirms that at most one succeeds, that the losing transition conflicts, and that unrelated fine fields remain unchanged.

## Client behavior

The outstanding view loads by default. The history view uses bounded cursor requests with an intersection observer and a visible **Load more** fallback. Duplicate fine IDs are filtered when pages are appended. Cards show title, reason, issue date, amount, and status. Amount formatting uses `BigInt` on integer minor units and labels the record currency; no floating-point calculation is used. Only outstanding cards show **Pay Fine**.

The confirmation dialog supports Escape, keyboard focus cycling, and focus restoration. The page provides loading, empty, retry, in-progress, success, and error feedback. Payment errors keep the last server-confirmed list data.

## Verification

- `tests/member-fines-storage.test.mjs` covers member scope, status filtering, cursor ties, schema parsing, and index declaration.
- `tests/member-fines-api.test.mjs` covers strict queries, cursor binding, route authorization, and payment workflow delegation/error mapping.
- `tests/client-member-fines.test.mjs` covers typed API requests, integer money formatting, route/page structure, dialog source constraints, and refresh/error source checks. The repository has no component DOM test harness, so these client workflow checks do not simulate rendered clicks or keyboard events.
- `tests/verify-member-fines-storage-emulator.mjs` exercises Firestore index-backed queries, equal-time paging, payment/waiver races, concurrent payments, repeat conflicts, timestamps, and preserved fields.
- These tests are registered in `package.json`; run `npm test` for the project suite and `npm run verify:member-fines:emulator` with a local Firestore Emulator and a `demo-*` project ID for integration verification.

The latest full `npm test` run built successfully and passed 217/220 tests. The stale My Fines placeholder assertion was updated and now passes. Three unrelated member-area failures remain: one member-loans fixture lacks fields required by `MemberLoan`, and two reservation-list tests expect API behavior not present in the current reservation client. These belong to the separate member-loans and reservation work.

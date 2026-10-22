# Member Borrow

## Purpose and supported behavior

The member borrow flow lets an active member stage available copies, review
them, and explicitly confirm one atomic checkout. Staging is client-side only:
it does not create a loan, reserve a copy, or change copy status. A member may
have at most 10 open loans, counting both `ACTIVE` and `PENDING_CLOSE`.

The page is available at `/member/borrow` and is protected for member accounts.
Express independently loads the active actor and derives ownership from the
session.

## Architecture

- `apps/client/src/pages/MemberBorrow.tsx` owns capacity, staged-copy state,
  confirmation, success, and whole-batch failure presentation.
- `apps/client/src/api/borrow.ts` calls the member endpoints through the shared
  credentialed API client.
- `apps/api/src/routes/member-borrow.ts` validates strict request bodies and
  exposes safe receipt DTOs.
- `apps/api/src/storage/workflows.ts` performs eligibility reads and the atomic
  Firestore checkout.
- `packages/shared/src/domain/records.ts` validates loans and nullable copy
  shelf locations.

## Request flow

```mermaid
sequenceDiagram
    actor Member
    participant Page as MemberBorrow page
    participant API as Express member-borrow router
    participant Flow as LibraryWorkflows
    participant DB as Firestore

    Page->>API: GET /member/borrow-capacity
    API->>Flow: memberBorrowCapacity(active member)
    Flow->>DB: Query ACTIVE and PENDING_CLOSE loans
    DB-->>Page: openLoanCount, remainingSlots

    Member->>Page: Add copy ID
    Page->>API: POST /member/borrow-items {copyId}
    Flow->>DB: Read copy and book only
    DB-->>Page: Eligible copy details or one error

    Member->>Page: Confirm staged copies
    Page->>API: POST /member/loans {copyIds}
    API->>Flow: confirmMemberBorrow(copyIds, active member)
    Flow->>DB: One transaction reads actor, all copies/books, and all open loans
    alt Every copy valid and complete batch fits capacity
        Flow->>DB: Create every loan and set every copy ON_LOAN
        DB-->>Page: Safe loan receipts
        Page-->>Member: Success for the complete batch
    else Any validation or capacity check fails
        DB-->>Page: One bounded error; no writes
        Page-->>Member: Keep every staged copy and show the error
    end
```

## API contracts

All routes are mounted at `/api/v1/member` and require an active member session.
The request never selects the loan owner.

| Method and path | Request | Response and behavior |
|---|---|---|
| `GET /borrow-capacity` | None | `{ openLoanCount, remainingSlots }`; open means `ACTIVE` plus `PENDING_CLOSE`. |
| `POST /borrow-items` | `{ copyId }` | Returns `{ copy, book }` only for an existing `AVAILABLE` copy; performs no writes. |
| `POST /loans` | `{ copyIds }` | Atomically creates the complete batch and returns `{ loans }`, or returns one error and performs no writes. |

Copy IDs are trimmed, non-empty, at most 128 characters, cannot contain `/`,
and must be unique. The confirmation body accepts 1–10 IDs. Unknown records use
404 `NOT_FOUND`; stale availability and insufficient capacity use 409
`CONFLICT`; malformed bodies use the shared validation envelope.

Successful receipt DTOs contain only `loanId`, `copyId`, `bookTitle`, `status`,
and `isRenewed`; internal member ownership and metadata are omitted.

## Atomic persistence and concurrency

`LibraryWorkflows.confirmMemberBorrow` runs one Firestore transaction for the
complete submitted array. Before any write it:

1. reloads and validates the current active member;
2. counts that member's `ACTIVE` and `PENDING_CLOSE` loans;
3. rejects the whole request when the current count plus the requested count
   exceeds 10;
4. reads every requested copy and requires all to remain `AVAILABLE`; and
5. reads every referenced book and builds schema-valid server-owned loans.

Only after every check passes does it create all loans, change all copies to
`ON_LOAN`, clear their shelf locations and reservation links, and update the
member contention record. Firestore retries serialize competing transactions;
the complete winning batch commits or the complete losing batch fails. Missing,
stale, duplicated, or over-capacity requests cannot leave sibling writes.

The UI clears all staged cards only after a successful response. A failed
confirmation keeps the complete staged selection in the dialog and displays
the server's bounded error so the member can revise and retry.

## Verification

- Unit/storage tests cover mixed-invalid, stale-copy, over-capacity,
  `PENDING_CLOSE`, repeated, concurrent, and successful multi-copy cases.
- API tests prove one atomic success response, one whole-batch error response,
  server-derived ownership, strict bodies, and safe receipts.
- Client tests prove the page clears all cards only after success and does not
  implement per-copy partial-success removal.
- `npm run verify:member-borrow:emulator` proves atomic mixed-invalid and
  over-capacity behavior, `PENDING_CLOSE` capacity, competing final-slot
  requests, and successful multi-copy checkout against Firestore Emulator on
  the canonical port.

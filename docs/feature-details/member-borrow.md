# Member Borrow

## Purpose and supported behavior

The member borrow flow lets an active member stage available copies, review them, and explicitly confirm borrowing. Staging is client-side only: it does not create a loan, reserve a copy, or change copy status. A member may have at most 10 active loans.

The page is available at `/member/borrow` and the member navigation bar has a **Borrow** link. The page is protected by `ProtectedRoute` for `MEMBER` accounts. Server routes independently load an active actor and require member role.

## Architecture and source locations

- `apps/client/src/pages/MemberBorrow.tsx` owns capacity loading, staged copy state, the confirmation dialog, the success notification popup, and failed-copy results.
- `apps/client/src/api/borrow.ts` calls the member borrow endpoints through `apiRequest`.
- `apps/client/src/components/MemberNavigation.tsx` links to the borrow route.
- `apps/client/src/App.tsx` registers `/member/borrow` behind the member route guard.
- `apps/api/src/routes/member-borrow.ts` validates requests, enforces member role, and maps workflow failures into the API error contract.
- `apps/api/src/server.ts` constructs `LibraryWorkflows` and mounts the member router under `/api/v1/member`; business routes also pass through active-actor middleware.
- `apps/api/src/storage/workflows.ts` performs read-only staging checks and confirmation transactions against Firestore.
- `packages/shared/src/domain/records.ts` defines `LoanRecordSchema` and the book/copy schemas.

## Request flow

```mermaid
sequenceDiagram
    actor Member
    participant Page as MemberBorrow page
    participant API as Express member-borrow router
    participant Flow as LibraryWorkflows
    participant DB as Firestore

    Member->>Page: Open Borrow page
    Page->>API: GET /member/borrow-capacity
    API->>Flow: memberBorrowCapacity(active member)
    Flow->>DB: Query member loans with status ACTIVE
    DB-->>Page: activeLoanCount, remainingSlots

    Member->>Page: Enter copy ID and Add copy
    Page->>API: POST /member/borrow-items {copyId}
    API->>Flow: checkMemberBorrowCopy(copyId, active member)
    Flow->>DB: Read copy and related book
    DB-->>Page: copy and book details (no state writes)
    Page-->>Member: Add a staged card, or show an error

    Member->>Page: Review and confirm staged copies
    Page->>API: POST /member/loans {copyIds}
    loop Each submitted copy ID
        API->>Flow: confirm one copy for active member
        Flow->>DB: Transactionally recheck member, copy, and active-loan count
        alt Eligible and below limit
            Flow->>DB: Create loan; set copy ON_LOAN
            DB-->>Page: Per-copy success
        else Missing, unavailable, or at limit
            DB-->>Page: Per-copy failure reason
        end
    end
    alt At least one copy borrowed
        Page-->>Member: Show dismissible success popup listing borrowed copies
    end
    opt One or more copies failed
        Page-->>Member: Show failure reasons inline
    end
```

## API contracts and validation

All routes are mounted at `/api/v1/member` and require an active session actor whose `accountType` is `MEMBER`. The member ID comes from that actor, not the request body.

| Method and path | Request | Response and behavior |
|---|---|---|
| `GET /borrow-capacity` | None | `{ activeLoanCount, remainingSlots }`; counts the actor's `ACTIVE` loans and computes `max(0, 10 - activeLoanCount)`. |
| `POST /borrow-items` | `{ copyId }` | Returns `{ copy, book }` only if the copy exists and is `AVAILABLE`. The workflow performs reads only. |
| `POST /loans` | `{ copyIds }` | Returns `{ outcomes }` with a success or failure for every unique submitted ID. The body schema allows 1–10 IDs and rejects duplicate IDs. Successful outcomes include the created loan; failed outcomes include a reason. |

Request bodies use strict Zod schemas; copy IDs are trimmed, non-empty, limited to 128 characters, and cannot contain `/`. Malformed bodies and unknown fields use the shared validation error envelope. Unknown copies from the add-copy operation map to HTTP 404 `NOT_FOUND`; ineligible copies map to HTTP 409 `CONFLICT`. Signed-out requests receive 401, and non-member/inactive actors receive 403.

## Staging and confirmation behavior

The page fetches current capacity and subtracts its staged-card count to determine remaining staging slots. Add copy is disabled when the member has staged as many copies as the server-reported remaining capacity. After any successful borrow, the page disables staging while it refreshes capacity; if refresh fails, it keeps staging disabled and shows a retry action rather than using stale capacity. A card is added only after the API verifies that the copy exists and is available. Duplicate copy IDs are prevented in client state. Removing a card restores one staging slot.

The confirmation dialog lists staged books. Cancel dismisses the dialog without calling the loan endpoint. Confirm submits only the staged copy IDs. Because staging does not hold inventory, the server rechecks each copy at confirmation. The page removes successful copies from the staged list, leaves failed copies staged, and refreshes capacity after any success. If at least one copy succeeds, a dismissible modal popup lists the successfully borrowed copy IDs. Failed-copy reasons remain visible inline on the page, including when other copies in the same request succeeded. If all submitted copies fail, no success popup is shown.

## Persistence and concurrency

Each submitted copy is processed independently in `LibraryWorkflows.confirmMemberBorrow`. For a candidate copy, one Firestore transaction reads the member user record, copy record, and the member's `ACTIVE` loan query. It checks the current user is still an active member, the copy is still `AVAILABLE`, and fewer than 10 active loans exist. It then creates a `LoanRecordSchema`-valid loan and changes the copy to `ON_LOAN` in the same transaction. Loan IDs and timestamps are server-generated; the due date is 30 days after the borrow timestamp.

The workflow updates the member user document's `updatedAt` field in each successful transaction as a shared contention point. Competing member borrow transactions for the same member therefore conflict and retry before recounting active loans. This field is currently used as the contention marker by the borrow workflow; it is not declared in `UserRecordSchema`.

A failed candidate returns a per-copy outcome and does not prevent later candidates from being attempted. Thus a copy that became unavailable after staging fails while other eligible copies may succeed. A confirmation may be partially successful. Confirmation requests can contain at most 10 IDs; the member-facing page further restricts the staged list to the member's remaining capacity.

The member workflow only accepts `AVAILABLE` copies. The separate librarian `LibraryWorkflows.createLoan` behavior, including its reservation pickup path, is unchanged.

## Verification and known limits

- `npm test` builds the project and runs the full Node test suite, including member borrow API, workflow, staging, and confirmation tests. The final reviewed run passed 78/78 tests.
- `npm run verify:member-borrow:emulator` runs the guarded eligibility and confirmation scripts against a local Firestore Emulator with a `demo-*` project ID. The recorded run passed both scripts, including a concurrency case with one remaining loan slot.
- Emulator scripts reject production mode, non-loopback hosts, or non-demo project IDs before importing Firebase initialization.
- Client tests inspect source structure and behavior wiring; no live browser interaction was verified. API and Firestore behavior have automated route, workflow, and emulator coverage.
- Builds emit a Vite advisory that the main JavaScript chunk is larger than 500 kB and Node emits a `punycode` deprecation warning; neither check failed.

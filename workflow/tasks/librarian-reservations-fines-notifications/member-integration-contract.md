# Member-slice integration contract

Jun Hong owns the v1 member reservation, fine-payment, and notification routes
and UI. This task provides the shared payload boundaries and tests the server
authorization and state-transition expectations without adding member routes
or UI.

The member slice must use the contracts exported by
`apps/api/src/http/reservations-fines-contracts.ts`:

- reservation creation accepts only `{ isbn }`; the server resolves the
  active session member, generates the ID/status/timestamps, and rejects a
  duplicate active member/ISBN reservation transactionally;
- cancellation and payment accept an empty strict body and re-read the target
  record in a transaction; only the owning active member may change an
  unassigned pending reservation or outstanding fine;
- notification list/read operations are recipient-scoped, bounded, and
  cursor-based; marking an already-read notification is idempotent;
- foreign IDs, forged member/recipient fields, invalid terminal states, stale
  requests, and unknown fields return the agreed error without a partial write.

No member-facing implementation is duplicated in the Jiali slice.

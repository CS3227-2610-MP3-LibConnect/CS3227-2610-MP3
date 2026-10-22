# Task Specification: librarian-reservations-fines-notifications

This file is the task-local copy of the analyst draft:

`PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md`

Version: `0.4-approved` (human approval recorded on 2026-10-22).

The canonical specification is the source of truth. It contains the complete
scope, product behavior, technical/integration contract, acceptance criteria
A-1–A-20, security constraints, test matrix T-1–T-20, risks, the observed
implementation/review reconciliation, and the seven resolved policy/ownership
decisions. It does not authorize source changes or merge/release actions.

## Approval gate

The specification, task checklist, and implementation handoff were explicitly
approved by the human on 2026-10-22. The seven policy and ownership decisions
in the canonical specification were approved on 2026-10-21 and remain fixed.
The canonical spec also records the full-project conflict audit, the required
corrections for the current partial repository methods, and the accepted worker
deadline and generic-method residual risks from independent review. This
approval does not itself authorize deployment, merge, or release.

## Scope summary

Specify and later implement the librarian reservation/fine/notification
surface around the existing Express → domain/storage → Firestore boundary:
bounded reservation and fine views, outstanding-fine waiver, server-owned
overdue processing, librarian messages, safe member-owned integration
contracts, retry-safe notification/expiry side effects, and the protected
librarian UI. Preserve order-4 loan closure and minimal reservation handoff;
do not add AI, external delivery, payment gateways, or member UI to this
Jiali slice.

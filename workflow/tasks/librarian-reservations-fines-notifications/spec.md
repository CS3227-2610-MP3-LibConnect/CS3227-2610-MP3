# Task Specification: librarian-reservations-fines-notifications

This file is the task-local copy of the analyst draft:

`PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md`

Version: `0.2-draft` (ready for human approval; no approval recorded).

The canonical specification is the source of truth. It contains the complete
scope, product behavior, technical/integration contract, acceptance criteria
A-1–A-20, security constraints, test matrix T-1–T-20, risks, and open policy
decisions.

## Approval gate

The specification, task checklist, and implementation handoff are not
approved. No application-source changes are authorized. The overdue fine
policy, fine-notification semantics, reservation visibility, inactive-recipient
policy, worker hosting, member-slice route ownership, and the newly recorded
Idempotency-Key contract remain explicit human decisions. The canonical spec
also records the full-project conflict audit and the required corrections for
the current partial repository methods.

## Scope summary

Specify and later implement the librarian reservation/fine/notification
surface around the existing Express → domain/storage → Firestore boundary:
bounded reservation and fine views, outstanding-fine waiver, server-owned
overdue processing, librarian messages, safe member-owned integration
contracts, retry-safe notification/expiry side effects, and the protected
librarian UI. Preserve order-4 loan closure and minimal reservation handoff;
do not add AI, external delivery, payment gateways, or member UI to this
Jiali slice.

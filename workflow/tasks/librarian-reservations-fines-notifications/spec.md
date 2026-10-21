# Task Specification: librarian-reservations-fines-notifications

This file is the task-local copy of the analyst draft:

`PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianReservationsFinesNotifications.md`

Version: `0.3-draft` (policy decisions approved; full specification approval not recorded).

The canonical specification is the source of truth. It contains the complete
scope, product behavior, technical/integration contract, acceptance criteria
A-1–A-20, security constraints, test matrix T-1–T-20, risks, and the seven
resolved policy/ownership decisions.

## Approval gate

The specification, task checklist, and implementation handoff are not yet
approved. No application-source changes are authorized. The seven policy and
ownership decisions in the canonical specification were explicitly approved
on 2026-10-21 and are no longer open decisions. The canonical spec also
records the full-project conflict audit and the required corrections for the
current partial repository methods.

## Scope summary

Specify and later implement the librarian reservation/fine/notification
surface around the existing Express → domain/storage → Firestore boundary:
bounded reservation and fine views, outstanding-fine waiver, server-owned
overdue processing, librarian messages, safe member-owned integration
contracts, retry-safe notification/expiry side effects, and the protected
librarian UI. Preserve order-4 loan closure and minimal reservation handoff;
do not add AI, external delivery, payment gateways, or member UI to this
Jiali slice.

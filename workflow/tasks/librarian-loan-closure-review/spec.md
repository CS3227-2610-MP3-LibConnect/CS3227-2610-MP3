# Task Specification: librarian-loan-closure-review

This file is the task-local copy of the canonical specification:

`PlanDraft/Specs/LibrarianFeatures/Circulation/LibrarianLoanClosureReview.md`

Version: `0.2-approved` (human approval recorded in chat on 2026-10-21).

The canonical specification is the source of truth. The task-local copy must
be synchronized before implementation work begins. The implementation
checklist is drafted separately and awaits its own human approval.

## Approval gate

The feature specification, acceptance criteria, security constraints, test
matrix, and three policy decisions were approved by the human on 2026-10-21.
The implementation checklist and handoff remain separate approval gates; this
artifact does not authorize application-source changes.

## Scope summary

Implement the librarian side of loan creation and return/loss review around the
existing typed records and transactional workflow baseline. Preserve active
librarian authorization, member ownership, `ACTIVE → PENDING_CLOSE → CLOSED_*`
loan transitions, `ON_LOAN → IN_TRANSIT →` final copy states, and the
browser-to-server boundary. The complete canonical contract, resolved
decisions,
acceptance criteria A-1–A-15, and test matrix T-1–T-17 are in the linked
specification.

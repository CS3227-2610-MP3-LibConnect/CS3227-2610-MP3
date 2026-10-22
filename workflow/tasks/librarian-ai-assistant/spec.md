# Task Specification: librarian-ai-assistant

This file is the task-local pointer to the canonical specification:

`PlanDraft/Specs/LibrarianFeatures/AI/LibrarianAssistant.md`

Version: `0.2-approved` (human approval recorded in the task conversation on
2026-10-22).

The canonical specification contains the objective, scope, actors, API/data
contracts, acceptance criteria A-1–A-18, security constraints, test matrix
T-1–T-20, and risks. No application-source or test changes are authorized by
this task specification.

## Approval gate

- Specification status: `APPROVED`
- Specification approver (human only): Human user, explicit approval in task conversation
- Specification approval date: 2026-10-22
- Task checklist status: `APPROVED`
- Task checklist approver (human only): Human user, explicit approval in task conversation
- Task checklist approval date: 2026-10-22
- Handoff status: `APPROVED`

## Scope summary

Specify and later implement the server-mediated librarian/manager assistant for
bounded pending return/loss summaries and ephemeral notification drafts. The
assistant is advisory, uses the approved `gemma4:26b` SoCLaaS adapter with
server-prefetched context and no model tools, cannot mutate library state, and
cannot bypass the existing human-approved review/send commands. The initial
draft scope is limited to pending-report follow-ups; overdue, fine, and
reservation drafting are deferred.

The checklist and implementation handoff remain separate human approval gates
before implementation begins.

---
name: sdd-apply
description: Implement a feature from its specdocs design.md and tasks.md after verifying they agree, then track task completion and review the changes.
metadata:
  short-description: Implement a feature from its approved specification
---

# SDD Apply

Use this skill to implement a feature from `specdocs/<task-name>/design.md` and its `tasks.md`. Follow the approved specification and checklist. You may create, modify, or delete files needed for the feature, but keep changes within the approved scope.

## Workflow

### 1. Locate the feature documents

Resolve the task name from the user's request. Read `specdocs/<task-name>/design.md`, `specdocs/<task-name>/tasks.md`, applicable `AGENTS.md` files, and relevant project documentation and source. If either feature document is missing or the task name is ambiguous, ask the user where to proceed. Do not substitute another feature's documents.

Inspect the repository state and relevant code to understand existing conventions, implementation, and available verification commands. Do not overwrite unrelated user changes; inspect the working tree and preserve changes outside this feature's scope.

### 2. Verify the plan before making changes

This is a read-only preflight. Before editing, deleting, creating, or formatting any file, compare the current design (including its approved amendments) with every task and acceptance criterion in `tasks.md`. Confirm that the checklist covers the design, does not contradict it, and has not retained requirements superseded by amendments. Check that task dependencies and ordering are implementable. Identify open decisions that prevent safe implementation.

If the design and tasks conflict, the checklist omits required scope, a task adds unapproved scope, amendments leave the current design unclear, or an open decision blocks implementation, stop before changing any file. Show the user the specific design text and task text that conflict or the requirement that is missing, explain the practical impact, and ask how they want to resolve it. Do not resolve conflicts by choosing one document, editing either document, or beginning partial implementation. Resume only after the user provides direction and the specification documents are aligned.

Also report relevant existing-code mismatches that affect implementation. Do not confuse an implementation gap that the design/tasks direct you to fix with a conflict between the design and task plan.

### 3. Implement tasks sequentially with the orchestrator

After preflight passes, follow tasks in their listed logical development
order. Work on one unchecked task at a time; do not start dependent tasks
early. For each task:

1. Read its description, acceptance criteria, design references, relevant
   repository context, and applicable constraints.
2. Spawn the project custom agent declared in
   [`.codex/agents/orchestrator.toml`](../../../.codex/agents/orchestrator.toml)
   (agent name `orchestrator`). Give it the feature documents, repository
   context, applicable instructions, and exactly one unchecked task. It must
   follow the project-specific
   [`multiagent-orchestrator`](../multiagent-orchestrator/SKILL.md) skill and
   use the named custom agent profiles in `.codex/agents/`: `explorer.toml`
   for the code map, `tester.toml` for test-first and independent verification,
   and `coder.toml` for implementation. The tester defines tests or suitable
   verification first; the orchestrator confirms executable tests fail for
   the expected reason; the coder implements and runs relevant checks; then
   the tester independently verifies the result. Run agents sequentially in
   the shared checkout and wait for each handoff before starting the next.
3. Review the orchestrator's diff and evidence yourself. Confirm every
   acceptance criterion is satisfied, required checks passed, and the work is
   within scope. Do not treat an agent's completion claim alone as evidence.
   If the orchestrator reports an ambiguity, incomplete criterion, failed
   check, or unverifiable result, follow the applicable clarification or
   blocker instructions below and do not mark the task complete.
4. Only after this review, update that task's checkbox in `tasks.md` from
   `- [ ]` to `- [x]`. Preserve all other task text, order, checkboxes, and any
   user edits.

When updating task checkboxes in an existing `tasks.md`, record the completed checklist updates in its single `## amendments` section. Create that section if it does not exist. If it already exists, append the new dated entry under that same section; do not create another amendments section or replace existing entries. Keep all amendment history together in this section.

Skip tasks already marked complete, but inspect the current implementation sufficiently to avoid assuming their work is present. Do not mark a task complete if any acceptance criterion remains unmet, its implementation is partial, or required verification failed. Report the blocker and leave that task unchecked.

If a task reveals an unforeseen issue that requires a product, behavior, architecture, data, API, security, or other design decision, stop implementation before making changes that depend on that decision. Explain the issue and options or consequences without choosing for the user, then ask for clarification. Keep any independently completed work and accurately mark only tasks whose full acceptance criteria have been met. Resume the remaining tasks only after the user answers and any required specification updates are made.

### 4. Perform the final review

After all tasks are complete, review the full change set, not just the last task. Verify:

- The implementation meets the current `design.md`, including its amendments, and each task's acceptance criteria.
- Existing features remain intact, using relevant existing automated tests and project checks such as build, lint, type checks, or integration tests when available.
- New or changed behavior has appropriate verification, and changes do not introduce unrelated scope.
- Every completed task is marked `[x]`, while any incomplete or blocked task remains `[ ]`.

Inspect the final diff for accidental changes, regressions, incomplete work, and mismatches with the specification. Do not claim checks passed unless they were run and passed. If a check cannot be run or fails, report the exact command/result and what remains unverified; fix issues within scope and rerun relevant checks where possible. If resolving a failure requires a design decision, stop and ask the user.

## Completion report

Summarize the implemented behavior, important files changed, task checkboxes completed or still open, and verification performed. Include failures, blockers, or unverified checks clearly. Do not claim the feature is complete while required tasks or acceptance criteria remain unmet.

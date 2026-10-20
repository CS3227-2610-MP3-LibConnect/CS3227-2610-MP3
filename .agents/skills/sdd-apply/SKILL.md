---
name: sdd-apply
description: Implement a feature from its specdocs design.md and tasks.md after verifying they agree, then track task completion and review the changes.
metadata:
  short-description: Implement a feature from its approved specification
---

# SDD Apply

Use this skill to implement a feature from `specdocs/<task-name>/design.md` and its `tasks.md`. Follow the approved specification and checklist. Keep implementation changes within the approved scope.

## Document change guardrail

The orchestrator and every subagent must treat project documents as read-only.
This includes SDD designs, task checklists, proposal/specification files,
amendment histories, documentation, and other files that define or explain the
project. When unsure whether a file is a document, treat it as one.

The only exception is task-completion bookkeeping in the active feature's
`tasks.md`. After `sdd-apply` has reviewed the implementation and explicitly
directs the orchestrator or a subagent to record completion, that agent may:

- Change only the assigned task's checkbox from `- [ ]` to `- [x]`.
- Append one dated completion entry under the existing `## amendments`
  section (or create that section if it does not exist).

This narrow completion update does not require user permission. Preserve all
task wording, acceptance criteria, ordering, other checkboxes, and existing
amendment entries. Agents must not check off a task based only on a coder's
claim; `sdd-apply` must first confirm every acceptance criterion and required
check. Agents may not uncheck or reopen tasks under this exception.

For the delegated orchestrator and its subagents, all other document edits
require the user's explicit approval for the specific proposed changes. This
applies even when an edit seems necessary to proceed. The `sdd-apply`
coordinator still invokes `document-feature` at the end of each invocation as
required below; that documentation work does not authorize delegated agents to
edit documentation or authorize plan-file changes.

If implementation reveals that a document needs a change beyond the narrow
completion update above:

1. Stop work that depends on that change.
2. State the exact file(s) and proposed edits, including the reason and the
   effect on scope or acceptance criteria. Provide enough detail for the user
   to review the change before it is made.
3. Ask the user for permission to make those specific edits. Do not let the
   orchestrator or any subagent edit the plan file while waiting.
4. Proceed with those edits only after explicit permission. Permission to
   implement a feature does not by itself approve changes to its plan files.

The orchestrator must relay this gate to each subagent. An agent that finds a
needed document change reports its proposal to `sdd-apply` and does not make
the change. `sdd-apply` presents it to the user and waits for permission.

## Workflow

### 1. Locate the feature documents

Resolve the task name from the user's request. Read `specdocs/<task-name>/design.md`, `specdocs/<task-name>/tasks.md`, applicable `AGENTS.md` files, and relevant project documentation and source. If either feature document is missing or the task name is ambiguous, ask the user where to proceed. Do not substitute another feature's documents.

Inspect the repository state and relevant code to understand existing conventions, implementation, and available verification commands. Do not overwrite unrelated user changes; inspect the working tree and preserve changes outside this feature's scope.

At the beginning of each invocation, perform one feature-wide exploration pass
before dispatching any task orchestrators. Use the project's `explorer` profile
to inspect the design, every task and acceptance criterion (including already
completed tasks for integration context), applicable instructions, relevant
implementation paths, conventions, existing tests, and verification commands.
Have it return a structured context map with references to files and symbols.
Save that map as a temporary central context artifact, for example
`.sdd-apply-context/<feature-name>-<invocation-id>.md`. Choose a fresh
invocation ID and never overwrite an existing artifact. This artifact is
working context, not a project document or a new source of requirements; the
approved design and task checklist remain authoritative. Keep it available to
all task orchestrators and their tester/coder agents for the duration of this
invocation, and remove only this invocation's artifact after the final review
and `document-feature` step, including when the invocation stops at a blocker.
Do not remove artifacts from other invocations.

### 2. Verify the plan before making changes

This is a read-only preflight. Before editing, deleting, creating, or formatting any file, compare the current design (including its approved amendments) with every task and acceptance criterion in `tasks.md`. Confirm that the checklist covers the design, does not contradict it, and has not retained requirements superseded by amendments. Check that task dependencies and ordering are implementable. Identify open decisions that prevent safe implementation. Do not repair a plan-file inconsistency yourself or through an agent; use the document-change approval process above.

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
   use the named custom agent profiles in `.codex/agents/`: `tester.toml` for
   test-first and independent verification, and `coder.toml` for
   implementation. Give it the path to the central context artifact and tell
   it and its subagents to consult that artifact before investigating the
   repository. They may inspect files to verify details or fill a genuinely
   task-specific gap, but must not spawn another explorer to repeat the
   feature-wide map. Tell the orchestrator that all project
   documents are read-only except the narrow task-completion bookkeeping above;
   it may perform that update only after `sdd-apply` reviews the result and
   directs it to do so. The tester defines tests or
   suitable verification first; the orchestrator confirms executable tests fail for
   the expected reason; the coder implements and runs relevant checks; then
   the tester independently verifies the result. Run agents sequentially in
   the shared checkout and wait for each handoff before starting the next.
3. Review the orchestrator's diff and evidence yourself. Confirm every
   acceptance criterion is satisfied, required checks passed, and the work is
   within scope. Do not treat an agent's completion claim alone as evidence.
   If the orchestrator reports an ambiguity, incomplete criterion, failed
   check, or unverifiable result, follow the applicable clarification or
   blocker instructions below and do not mark the task complete.
4. Only after this review, record the task as complete. `sdd-apply` may make
   the narrow completion update itself or direct the orchestrator to do it.
   No user permission is required for this update. Change only that task's
   checkbox from `- [ ]` to `- [x]` and append one dated entry under the single
   `## amendments` section, creating that section only if it does not exist.
   Preserve all task text, ordering, other checkboxes, and existing amendment
   entries.

Skip tasks already marked complete, but inspect the current implementation sufficiently to avoid assuming their work is present. Do not mark a task complete if any acceptance criterion remains unmet, its implementation is partial, or required verification failed. Report the blocker and leave that task unchecked.

If a task reveals an unforeseen issue that requires a product, behavior, architecture, data, API, security, or other design decision, stop implementation before making changes that depend on that decision. Explain the issue and options or consequences without choosing for the user, then ask for clarification. Keep any independently completed work and accurately mark only tasks whose full acceptance criteria have been met. Resume the remaining tasks only after the user answers and any required specification updates are made.

### 4. Review and document this invocation

At the end of every `sdd-apply` invocation, including one that implemented
only a single task, stopped at a blocker, or made no implementation changes,
review the feature's current implementation and invoke the project
[`document-feature`](../document-feature/SKILL.md) skill. It must create or
update `docs/feature-details/<task-name>.md` so the file reflects the latest
correct implementation details at the end of this invocation.

The feature document must distinguish implemented behavior from unchecked,
blocked, or otherwise unimplemented requirements. If implementation has not
started, document the relevant current code baseline and clearly identify the
planned behavior that is not yet implemented; do not describe it as existing
functionality. Keep this reference documentation separate from plan files.
Review its technical claims against the source and verification evidence.

If all tasks are complete, also review the full change set, not just the last
task. Verify:

- The implementation meets the current `design.md`, including its amendments, and each task's acceptance criteria.
- Existing features remain intact, using relevant existing automated tests and project checks such as build, lint, type checks, or integration tests when available.
- New or changed behavior has appropriate verification, and changes do not introduce unrelated scope.
- Every completed task is marked `[x]`, while any incomplete or blocked task remains `[ ]`.

Inspect the reviewed diff for accidental changes, regressions, incomplete
work, and mismatches with the specification. Do not claim checks passed unless
they were run and passed. If a check cannot be run or fails, report the exact
command/result and what remains unverified; fix issues within scope and rerun
relevant checks where possible. If resolving a failure requires a design
decision, stop and ask the user. The feature document must be refreshed even
when this final review finds remaining gaps.

## Completion report

Summarize the implemented behavior, important files changed, task checkboxes completed or still open, and verification performed. Include failures, blockers, or unverified checks clearly. Do not claim the feature is complete while required tasks or acceptance criteria remain unmet.

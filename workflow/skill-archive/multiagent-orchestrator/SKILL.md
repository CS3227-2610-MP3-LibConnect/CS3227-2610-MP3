---
name: multiagent-orchestrator
description: Coordinate tester and coder subagents to implement and verify one approved SDD task, including tasks running concurrently in a parallel group.
metadata:
  short-description: Orchestrate sequential test-first implementation
---

# Multi-Agent Orchestrator

Use this skill when called by the project's `sdd-apply` skill to implement one
unchecked task from an approved `tasks.md`, potentially alongside independent
tasks in the same parallel group. The task, its design context, and
its acceptance criteria are the source of truth. Work only within that task's
scope and the shared repository checkout.

## Inputs and boundaries

Require the feature's `design.md`, `tasks.md`, the exact unchecked task,
relevant acceptance criteria and design references, repository context, and
applicable project instructions, plus the path to this invocation's central
context artifact created by `sdd-apply`. Read and use the context artifact
before examining source. If it is unavailable, report that to `sdd-apply`
instead of launching a feature-wide rediscovery pass. Agents may inspect
source to confirm details and investigate gaps specific to their assigned
task. If required context is missing, or the task
reveals an unresolved product or technical decision, stop and return the
specific ambiguity to `sdd-apply` for user clarification. Do not invent
requirements or select another task.

Treat all project documents as read-only. The only permitted document edit is
completion bookkeeping in the active `tasks.md`: after `sdd-apply` has reviewed
the result and explicitly directs the orchestrator to record completion, it
may check only the assigned task (`- [ ]` to `- [x]`) and append one dated
completion entry under the existing `## amendments` section. This narrow edit
does not require user permission. Do not change task wording, criteria, order,
other checkboxes, or other documents. Do not check off a task based only on the
coder's claim. All other document changes follow the user's explicit approval
gate in the `sdd-apply` skill.

The orchestrator coordinates and reviews; it does not delegate final
acceptance to an agent. Separate task orchestrators may run concurrently for
tasks in the same preflight-approved parallel group. Within this task, run the
tester, coder, and independent tester strictly sequentially, waiting for each
handoff before starting the next. Agents share one checkout: establish
task-scoped file ownership, do not edit files owned by another parallel task,
and coordinate any discovered shared-file or interface conflict with
`sdd-apply` before proceeding. Give each agent a narrow role, the relevant
source material, and explicit output requirements. Use the project custom agent profiles by their declared names:
`.codex/agents/explorer.toml`, `.codex/agents/tester.toml`, and
`.codex/agents/coder.toml`. Do not substitute a generic role when the named
profile is available. Do not ask agents to modify the same files concurrently.

## Workflow

1. **Load shared context.** Read the feature-wide context artifact supplied by
   `sdd-apply`. It contains the one exploration pass for this invocation,
   including the task map, relevant code paths, conventions, existing tests,
   and verification commands. Do not spawn another explorer. If the assigned
   task exposes a material context gap, inspect the relevant files directly
   and report the new evidence in the handoff so `sdd-apply` can update the
   central pool for subsequent tasks.
2. **Scope the increment.** Restate the task and its acceptance criteria.
   Combine the shared context with any task-specific evidence. Keep the work
   limited to this task.
3. **Have the tester define verification first.** Spawn a tester subagent to
   inspect the relevant code and write focused tests for the task's acceptance
   criteria. For tasks without executable behavior, have the tester identify
   appropriate concrete verification instead of creating meaningless tests.
   The tester must not implement production behavior. Review the tests or
   verification plan against the criteria.
4. **Establish the test-first baseline.** Run the relevant new tests before
   implementation when they are executable. Confirm they fail because the
   requested behavior is missing, not because the test setup is broken. If
   that cannot be established, resolve the test issue or report the blocker
   before coding.
5. **Have the coder implement.** Spawn a coder subagent with the scoped task,
   criteria, relevant context, test-first results, and constraints. Ask it to
   make the smallest coherent implementation and run the relevant checks. It
   must report files changed, commands run, results, and any remaining gaps.
6. **Have the tester verify independently.** After the coder finishes, spawn
   the tester again with the criteria, tests, and implementation diff. Ask it
   to verify the behavior and report failures, missing coverage, or gaps. It
   should report findings rather than silently changing production code.
7. **Review and resolve.** Inspect the full task diff and the agents' evidence.
   Confirm each acceptance criterion is met, the relevant checks pass, and no
   unrelated changes were introduced. Resolve in-scope issues, then rerun the
   affected checks. If a required check fails or a decision is needed, return
   the blocker and evidence to `sdd-apply`; do not claim completion.
8. **Return the handoff.** Report the task identifier and owned files, changed files, criterion
   by criterion evidence, tests/checks and results, review findings and their
   resolution, and any blockers or unverified areas. Wait for `sdd-apply` to
   review the result. Only if it explicitly directs completion bookkeeping,
   make the narrow checkbox and dated amendment update described above; never
   modify any other task or document content.

## Completion criteria

Return the task as complete only when every acceptance criterion has
supporting implementation evidence and required verification has passed.
Otherwise return it as blocked or incomplete, explain why, and leave checklist
updates to `sdd-apply`.

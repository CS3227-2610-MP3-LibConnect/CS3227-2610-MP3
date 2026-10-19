---
name: multiagent-orchestrator
description: Coordinate tester and coder subagents to implement and verify one approved SDD task at a time.
metadata:
  short-description: Orchestrate sequential test-first implementation
---

# Multi-Agent Orchestrator

Use this skill when called by the project's `sdd-apply` skill to implement one
unchecked task from an approved `tasks.md`. The task, its design context, and
its acceptance criteria are the source of truth. Work only within that task's
scope and the shared repository checkout.

## Inputs and boundaries

Require the feature's `design.md`, `tasks.md`, the exact unchecked task,
relevant acceptance criteria and design references, repository context, and
applicable project instructions. If required context is missing, or the task
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
acceptance to an agent. Agents share one checkout, so run them strictly
sequentially and wait for each agent to finish before starting the next. Give
each agent a narrow role, the relevant source material, and explicit output
requirements. Use the project custom agent profiles by their declared names:
`.codex/agents/explorer.toml`, `.codex/agents/tester.toml`, and
`.codex/agents/coder.toml`. Do not substitute a generic role when the named
profile is available. Do not ask agents to modify the same files concurrently.

## Workflow

1. **Map the code.** Spawn the project `explorer` subagent with the task and
   acceptance criteria. Wait for it to return a read-only map of relevant
   files, behavior, conventions, existing tests, and verification commands.
   Reuse context supplied by `sdd-apply`; ask the explorer to fill only gaps.
2. **Scope the increment.** Restate the task and its acceptance criteria.
   Combine the supplied repository context with the explorer's evidence.
   Keep the work limited to this task.
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
8. **Return the handoff.** Report the task identifier, changed files, criterion
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

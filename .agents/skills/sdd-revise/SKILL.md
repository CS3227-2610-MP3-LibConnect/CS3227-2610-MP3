---
name: sdd-revise
description: Revise an existing feature design and its implementation checklist through separate user-approved change proposals with dated amendment logs.
metadata:
  short-description: Revise approved feature specifications
---

# SDD Revise

Use this skill when the user wants to change an existing feature specification. The user must identify the specification, normally as `specdocs/<task-name>/`. Do not implement source-code changes as part of this skill.

## Workflow

### 1. Locate and present the current specification

Resolve the specification directory from the user's request. Read its `design.md`, `tasks.md` if present, and applicable project instructions or references needed to understand the documents. If the target is ambiguous or either required document cannot be found, ask the user to identify or provide it. Do not select an unrelated specification.

First summarize the current design in `design.md` and the current task progress from `tasks.md`, calling out completed tasks (`[x]`), incomplete tasks (`[ ]`), and any existing amendments. This is a read-only summary in the conversation; do not modify either document. If there is no `tasks.md`, say that no task checklist exists yet.

If the user has not stated the requested changes, ask what they want changed. If they have already stated the changes, proceed to analyze them against the current design. Do not infer unstated goals.

### 2. Propose design changes and obtain approval

Read `design.md` carefully, including its amendments and current acceptance criteria. Propose specific edits that meet the user's requested changes. Explain the impact on feature behavior, scope, interfaces, acceptance criteria, and risks where applicable. Clearly distinguish the user's request from any recommendation. Ask focused questions if the intended change is unclear or requires a decision; do not make assumptions.

Present the full proposed design change and ask for explicit approval before editing `design.md`. If the user provides refinements, incorporate them into the proposal, restate the updated proposal, and ask for approval again. Approval must clearly cover the proposed change; silence or an ambiguous response is not approval. Until explicit approval is given, do not modify any document.

After approval, update the relevant sections of `design.md` so the main specification reflects the latest agreed design. Preserve unrelated content and existing amendments. Keep all amendment entries together in one `## amendments` section. Create the section if it does not exist; if it already exists, append the new entry under that section in order. Do not create duplicate amendments sections, replace existing entries, or rewrite the changelog. Each entry must document all approved changes from the prior design, why each change was made, and the date. Use `YYYY-MM-DD` and the current date in the user's local timezone when available.

### 3. Propose task checklist changes and obtain separate approval

After the approved design update, read `tasks.md` (if present) and compare every task and completion status against the updated design. Determine which tasks are now redundant, which existing tasks need modification, which new tasks are required, and whether task dependencies or logical ordering need to change. If there is no `tasks.md`, explain that and propose the tasks required by the revised design.

Present a clear itemized summary of all proposed task changes, with reasons and effects on completion status. Preserve completed-task status when the task's work and acceptance criteria remain valid. If a completed or partially completed task's status cannot safely be determined after a change, ask the user instead of guessing. Ask the user to approve the task changes separately from the design changes.

If the user provides refinements to the task proposal, incorporate them, restate the complete updated task-change plan, and ask for approval again. Do not edit `tasks.md` without explicit approval of the proposed task changes. If approval is not given, leave `tasks.md` unchanged and tell the user that it may now be out of sync with the approved design; do not imply the specification set is ready for implementation.

After approval, make only the approved task changes. Preserve the task format and logical development order used by the project. Update checkbox status only as approved and supported by the current completion state. Keep all amendment entries together in one `## amendments` section at the end of `tasks.md`. Create the section if it does not exist; if it already exists, append under that same section. Do not create duplicate sections or replace existing entries. Log every approved task change, including tasks added, modified, removed or made redundant, why the change was made, and the date (`YYYY-MM-DD`, using the user's local timezone when available).

When preparing the task-change proposal, assess dependencies, likely file or interface ownership, shared artifacts, and integration conflicts for the resulting task list, including unchanged tasks that remain in the checklist. Present a proposed group assignment and explain any material dependency or conflict that determines the order. Group tasks together only when none depends on another and they can be implemented with disjoint, clearly assignable ownership and no material shared-file or shared-interface conflict. Put prerequisites and conflicting tasks in earlier or later groups as appropriate; a group may contain one task when it must run alone. Do not force parallelism where it is unsafe. Groups execute in listed order, and eligible unchecked tasks within a group may run concurrently. Mark each group explicitly as `Parallel` or `Sequential`, keep every task under exactly one group, and retain each task's checkbox, acceptance criteria, and design references. If the existing checklist format cannot show these boundaries clearly, include the needed grouping/format changes in the proposal and obtain approval for them before editing.

Use a structure such as the following when compatible with the project's checklist format:

```markdown
## Task Group 1 — Parallel
- [ ] **Task A** - ...
  - Acceptance criteria: ...
  - References: ...
- [x] **Task B** - ...
  - Acceptance criteria: ...
  - References: ...

## Task Group 2 — Sequential
- [ ] **Task C** - ...
  - Acceptance criteria: ...
  - References: ...
```

The proposal must make clear that groups run sequentially, while unchecked tasks within a `Parallel` group may be dispatched concurrently. Preserve the current completion status of tasks whose implementation and criteria remain valid. Do not move a completed task in a way that implies it must be redone; if a revised design invalidates its completion or the effect is uncertain, resolve that with the user before proposing its status or placement.

### 4. Report the result

Report the design and task documents changed, summarize the approved amendments, and note any unresolved decisions. If the user approved the design but not the task changes, clearly report that partial state and its task/design mismatch. Do not modify source code, unrelated specifications, or other files.

## Approval and file-safety rules

- Design edits and task-list edits have separate approval gates.
- Do not edit either document before approval for that document's proposed changes.
- Preserve all existing amendment history; amendments are append-only logs.
- Change only the specified feature's `design.md` and, after separate approval, its `tasks.md`.
- Do not implement the feature or alter application source code in this workflow.

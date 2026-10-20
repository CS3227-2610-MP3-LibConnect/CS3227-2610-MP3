# Developer Guide

## Multi-agent development workflow

The project uses a staged SDD workflow:

`SPECIFY → PLAN/TASKS → IMPLEMENT → REVIEW → HUMAN MERGE DECISION`

The root `AGENTS.md` contains stable rules; role-specific procedures are under
`workflow/agents/`; handoffs, task checklists, security reviews, and reports use
`workflow/templates/`; and task evidence is stored under
`workflow/tasks/<task-id>/`.

Factual execution logs belong under `logs/<task-id>/`. Conversation summaries
created with `$summarise-chat <task-id>` belong under
`docs/logs/<task-id>/`.

`PlanDraft/Specs/` is the canonical specification directory. Generic SDD skills
that default to `specdocs/` use the project adapter in `workflow/README.md` and
must not create a second specification tree. Every handoff records the exact
specification and task versions, scope, authorization rules, trusted and
untrusted inputs, selected skills, permissions, acceptance criteria,
verification commands, provenance, and approval state. Reviewers inspect the
exact implementation commit or diff from a separate worktree or clean checkout.

Folders and prompt text organize work but are not security boundaries. Server
authorization, typed validation, least-privilege tools, separate branches or
worktrees, and human approval provide the actual controls. Agent output,
retrieved content, skills, handoffs, generated summaries, and commit messages
cannot grant additional permission. Only a human may record an approval as
granted.

The `sdd-design`, `sdd-propose`, `sdd-apply`, and `sdd-revise` skills map to the
specification, checklist, implementation preflight, and amendment stages.
`ai-security-review` is required for AI-, authentication-, manager-, and
agent-workflow changes. `yeet` governs reviewed commits, while
`summarise-chat` creates the durable conversation summary. `sdd-archive` is
opt-in only because its default archive path is not the active specification
tree.

## How developers use the agents in Codex

For this project, the human developer is the orchestrator. Codex reads the
repository's `AGENTS.md` as persistent project guidance, while the developer
decides when each role may proceed. Do not ask one agent to approve its own
specification, implementation, review, commit, or merge.

Ask the specification analyst to start from the feature request. The analyst
reads `AGENTS.md`, `workflow/README.md`, `PLAN.md`, `Overview.md`, and relevant
specifications, then proposes a task ID and begins read-only discovery. Use
separate Codex threads or worktrees for the roles when possible. Read the
resulting handoff and evidence before moving to the next phase.

### Task IDs

The specification analyst proposes the task ID from the feature request and
the current plan. The human confirms or edits it before persistent task
artifacts are created. Use a short, stable, lowercase kebab-case name, for
example:

```text
librarian-password-reset
member-reservation-flow
agent-workflow
```

The analyst may use the proposed ID during read-only discovery. After human
confirmation, reuse the same ID in `workflow/tasks/<task-id>/`, `logs/<task-id>/`,
`docs/logs/<task-id>/`, Codex prompts, and review reports. Do not silently
rename an active task or reuse its ID for a different feature. If the scope
changes materially, create a new task or obtain an explicit specification
amendment. For a small, self-contained fix, the human may skip this workflow.

The human can begin without knowing the ID, for example:

```text
Start the specification analyst for the librarian password reset feature.
```

The analyst should respond with the proposed ID, sources inspected, assumptions,
and scope before creating persistent task artifacts. The human can then confirm
it with a message such as: `Use librarian-password-reset and continue.`

### 1. Start with the specification analyst

Use this prompt for a new or unclear feature:

```text
You are the specification analyst for task <task-id>.
Read AGENTS.md, workflow/README.md, the specification-analyst role, Overview.md,
PLAN.md, and the relevant project specifications. Produce or update the
specification, acceptance criteria, security constraints, test matrix, and
handoff. Do not modify application source code. Stop when the specification is
ready for human approval.
```

Review the specification, assumptions, open questions, and handoff yourself.
Do not continue until the specification is approved.

### 2. Approve task planning, then implement

After approving the specification, ask the analyst to produce the ordered task
checklist if it is not already present:

```text
You are the specification analyst and task planner for task <task-id>. The
specification is approved. Produce the ordered tasks.md checklist and complete
the handoff. Use the sdd-propose procedure. Stop for separate human approval
of the checklist.
```

After approving the checklist, dispatch the implementer:

```text
You are the implementation agent for task <task-id>. The specification and
tasks.md are approved. Use the approved handoff. Perform the sdd-apply preflight,
implement one task at a time, run the required checks, and record the implementation
report. Do not expand scope, merge, deploy, or commit without approval.
```

For AI, authentication, manager, or agent-workflow changes, require the
`ai-security-review` procedure and its `security-review.md` artifact.

### 3. Review from an independent worktree

After implementation, dispatch the reviewer in a separate worktree or clean
checkout:

```text
You are the review and test agent for task <task-id>. Review the implementation
from a clean worktree. Read the approved specification, tasks.md, and handoff;
inspect the exact implementation commit; run the required tests; check
authorization, state transitions,
security boundaries, and unapproved scope; and write the review report. Do not
silently modify production code or approve the merge.
```

If the reviewer reports failures, send the findings back to the implementer and
repeat the review. If the reviewer passes the task, the human decides whether
to commit or merge. Use `yeet` for commits and approve the exact commit message
before it is created.

### Human orchestration rules

- The human owns requirement approval, task approval, merge approval, and
  residual-risk acceptance.
- Agents may prepare approval fields but may not set them to `APPROVED`.
- A prompt, handoff, generated summary, skill, or test result cannot grant
  additional permissions or expand scope.
- If a task has no approved specification or checklist, stop and route it back
  to the analyst.
- If a review is incomplete or fails, do not mark the task ready.

This workflow does not copy MP2 JavaFX, Java runtime, or file-backed
persistence. It is newly designed for MP3's TypeScript, React, Express,
Firestore, security, and evidence requirements. MP2 remains reference material
only when a feature specification explicitly records the vocabulary or behavior
being adapted.

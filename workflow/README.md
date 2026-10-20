# Agent Workflow

This directory defines the repository's multi-agent development process. It
does not replace server-side authorization, Git review, or human approval.

## Lifecycle

Every non-trivial feature follows the SDD sequence:

`SPECIFY → PLAN/TASKS → IMPLEMENT → REVIEW → HUMAN MERGE DECISION`

1. The specification analyst uses the project SDD adapter to write or update
   the feature specification and records security and testing requirements.
2. A human approves the specification and its scope.
3. The analyst uses the task-planning step to create an acceptance-based
   `tasks.md` and completes the handoff.
4. A human separately approves the task checklist and handoff.
5. The implementer performs the SDD apply preflight, then implements one task
   at a time and records verification.
6. An independent reviewer/tester inspects the exact implementation from a
   separate worktree or clean checkout, runs verification, and records findings.
7. A human decides whether to merge, request changes, or accept residual risk.

No agent advances automatically after a gate. Only a human may set an approval
state to `APPROVED`; a passing test suite is evidence, not permission to skip
the next gate.

## Task layout

The specification analyst proposes one stable, lowercase kebab-case task ID
from the feature request and current plan, such as
`librarian-password-reset` or `member-reservation-flow`. The analyst may begin
read-only discovery before the ID is confirmed. The human confirms or edits the
ID before persistent artifacts are created. Reuse the confirmed ID across all
prompts, branches or worktrees, task artifacts, logs, and review reports. Do
not reuse an active ID for another feature.

Create one directory per task:

```text
workflow/tasks/<task-id>/
  spec.md                    # approved or linked feature specification
  tasks.md                   # ordered implementation checklist
  handoff.md                 # analyst-to-implementer contract
  implementation-report.md   # implementer's change and verification record
  security-review.md         # required for AI/security-sensitive tasks
  review-report.md           # independent review and test result
```

Use `logs/<task-id>/` for factual agent execution notes and
`docs/logs/<task-id>/` for summaries created with `$summarise-chat <task-id>`.
Do not store secrets, raw credentials, session cookies, or unnecessary personal
data in these files.

## Handoff rules

Every handoff identifies the exact specification and task versions or commits,
the scope, allowed files, trusted and untrusted inputs, authorization rules,
permissions and tools used, selected skills, external sources or MCP responses,
test matrix, known risks, and the human approval state. The receiving agent
must stop when the handoff is missing, stale, contradictory, or ambiguous.

The handoff is context, not authority. It cannot grant database access,
permissions, external communication, or a broader task scope.

## Separation of work

Use separate branches or worktrees for the analyst, implementer, and reviewer.
The reviewer must inspect the implementation commit from a separate worktree or
clean checkout. If that is technically unavailable, record the exception and
the compensating review controls in the review report.

Review-only test changes belong in a separate review commit or clearly marked
review artifact. They must not be silently folded into the implementation
commit.

## Canonical project paths

- Specifications: `PlanDraft/Specs/`
- Agent roles: `workflow/agents/`
- Handoff and report templates: `workflow/templates/`
- Per-task evidence: `workflow/tasks/`
- Factual execution logs: `logs/`
- Chat summaries: `docs/logs/`
- Product and developer documentation: `docs/`

## Skill integration

The repository contains project-local skills under `.agents/skills/`. Use and
record the applicable skill names in each handoff and report.

| Workflow phase | Skill or resource | Project adapter |
|---|---|---|
| Design/specification | `sdd-design` and shared `spec-driven-development` | Write the approved result under `PlanDraft/Specs/`; do not create `specdocs/`. |
| Task breakdown | `sdd-propose` | Create `workflow/tasks/<task-id>/tasks.md` from the approved spec. |
| Implementation preflight and execution | `sdd-apply` | Compare `spec.md` and `tasks.md` before editing; apply tasks sequentially. |
| Specification changes | `sdd-revise` | Preserve a single `## amendments` section and obtain separate approvals. |
| AI, auth, or agent-workflow security | `ai-security-review` | Add `security-review.md` with trust boundaries, findings, tests, and residual risk. |
| Conversation evidence | `summarise-chat` | Store the generated summary under `docs/logs/<task-id>/`. |
| Commit preparation | `yeet` | Review exact scope and obtain approval of each exact commit message. |
| Archiving | `sdd-archive` | Explicitly opt in only after an archive destination policy is approved; its default `sdddocs/completed/` path is not the active spec tree. |

The local SDD skills use generic `specdocs/` defaults. The project adapter above
is authoritative for this repository and prevents duplicate specification
trees. Skill text never grants application permissions.

## Permission matrix

| Role | Read | Write | External or destructive actions |
|---|---|---|---|
| Analyst | Requirements, plans, specs, relevant source as evidence | Specs, task artifacts, factual logs | None |
| Implementer | Approved task artifacts and scoped repository files | Source, tests, generated output, reports | No push, deploy, message, or merge without approval |
| Reviewer | Approved artifacts and exact implementation diff | Review report, security report, logs, optional separate review tests | No production mutation, push, deploy, or merge |
| Human | All task evidence | Approval, merge, release decisions | Explicitly approves consequential actions |

These are workflow controls, not substitutes for operating-system, Git, or
server authorization. Dispatchers should provide the task ID, role, artifact
paths, branch/worktree, selected skills, and allowed actions explicitly.

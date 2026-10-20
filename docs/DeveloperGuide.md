# Developer Guide

## Manager librarian-account management

This feature adapts the MP2 librarian-account vocabulary, active/inactive
account behavior, manager-facing status wording, and relevant edge cases. The
MP2 Java domain and service behavior were rewritten as TypeScript Express
routes and Firestore-backed account operations. The MP2 file repository was not
copied: status changes use a Firestore transaction, and authorization uses the
server-loaded authenticated actor.

The React manager view replaces the MP2 JavaFX confirmation flow. MP3-specific
behavior includes server-controlled `isManager`, concurrent last-active-manager
protection, session revocation after deactivation, Origin validation, and safe
responses that omit password hashes and session data.

When a status change commits a deactivation but the session store is
temporarily unavailable, the API retries cleanup briefly and records a
server-only `sessionRevocationJobs` outbox entry if the retries still fail.
The API worker retries those jobs with bounded backoff and removes each job
only after all sessions for the target have been deleted. The account remains
inactive throughout, so active-actor authorization denies access even while a
cleanup job is pending. The job collection is written only by trusted server
code and contains no session identifiers or credentials.

The repository verification baseline is:

```text
npm run dev                 # client and API development processes
npm run build               # TypeScript and production client build
npm test                    # unit and route tests
npm run test:coverage       # tests with minimum coverage gates
npm run test:manager:emulator  # Firestore transaction concurrency check
npm run lint                # TypeScript parse/type-check entry point
npm run format:check       # whitespace check for the working tree
```

The emulator check requires Firebase's supported Java runtime in addition to
the locally installed Firebase CLI.

### Manager bootstrap and emergency recovery

The first manager is provisioned out of band before the application is exposed:

1. A deployment operator authenticates to the team-controlled production
   environment using the separate production Firestore/Admin credentials. No
   browser request or public registration field is used.
2. The operator creates exactly one `LIBRARIAN` user with a unique employee ID,
   an Argon2id password hash, `accountStatus: ACTIVE`, and `isManager: true`.
   The operator verifies the record with a read-back that excludes the password
   hash from any evidence.
3. The operator records the actor, environment, timestamp, and resulting user
   ID in the deployment audit trail, without recording passwords, session IDs,
   or full user records. The operator then removes any temporary provisioning
   access.

If every manager is unavailable, the same team-controlled operator procedure is
used after identity verification and incident approval. It may repair or
provision one designated manager record only; it must not be exposed as an
application route, accept client-supplied `isManager`, or disable the
last-manager protection during ordinary requests. The operator verifies that
the manager can sign in, records the recovery evidence, and removes temporary
access. No public route grants manager privileges or bypasses the invariant.

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
The analyst must stop and explicitly ask the human to approve the
specification; do not continue until that approval is recorded.

### 2. Approve task planning, then implement

After approving the specification, ask the analyst to produce the ordered task
checklist if it is not already present:

```text
You are the specification analyst and task planner for task <task-id>. The
specification is approved. Produce the ordered tasks.md checklist and complete
the handoff. Use the sdd-propose procedure. Stop and explicitly ask for
separate human approval of the checklist.
```

After approving the checklist, dispatch the implementer:

```text
You are the implementation agent for task <task-id>. The specification and
tasks.md are approved. Use the approved handoff. Perform the sdd-apply preflight,
implement one task at a time, run the required checks, and record the implementation
report. When all approved tasks and verification are complete, stop and ask the
human explicitly to approve the implementation handoff before any next-stage
action. Summarize verification results, unresolved risks, and the exact action
awaiting approval. Do not expand scope, dispatch review, merge, deploy, or commit
without approval.
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
to commit or merge. The reviewer must explicitly ask the human to make that
decision. Use `yeet` for commits and approve the exact commit message before it
is created.

### Human orchestration rules

- The human owns requirement approval, task approval, merge approval, and
  residual-risk acceptance.
- Agents must explicitly ask for approval at each applicable gate and stop
  until the human responds.
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

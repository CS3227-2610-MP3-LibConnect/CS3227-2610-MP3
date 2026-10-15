---
name: yeet
description: Propose a commit message for staged or all repository changes, then commit only after explicit approval of the exact message.
metadata:
  short-description: Review and commit changes with approval
---

# Yeet

Use this skill when the user wants to prepare and make a local Git commit. It requires exactly one mode parameter: `staged` or `all`.

## Workflow

### 1. Require a valid mode

Accept `$yeet staged` or `$yeet all`. If the parameter is missing, invalid, or ambiguous, ask the user to choose one. Do not stage or commit anything until a valid mode is provided.

- `staged`: include changes already in the Git index, plus any changes under `docs/logs/`, which must always be staged automatically. Leave other unstaged and untracked files untouched.
- `all`: stage all changes in the current repository, including tracked modifications, deletions, and untracked non-ignored files, then propose a commit message based on the resulting staged diff.

### 2. Review the exact changes

Confirm the repository root and inspect Git status before acting. In both modes, automatically stage all additions, modifications, and deletions under `docs/logs/` (for example with `git add -A -- docs/logs`) before reviewing the staged diff. This is required even in `staged` mode; those log changes are included alongside the changes already staged by the user. In `all` mode, stage all repository changes as well, then review the complete staged diff. Do not commit if there is no staged diff after the selected mode is applied.

Review the staged changes sufficiently to understand their purpose and propose a concise, accurate commit message. Do not include unstaged changes in a `staged` commit. If the diff contains unrelated changes, apparent secrets, or changes whose scope cannot be understood, explain the issue and ask the user how to proceed instead of guessing.

### 3. Propose a message and request approval

Show the user the exact commit message you propose and briefly summarize which changes it covers. Ask for explicit confirmation to commit using that exact message. Do not commit before receiving confirmation.

If the user supplies a refined commit message, present the exact revised message and ask the user to confirm it. Commit only after a clear confirmation of the current, exact message. A confirmation such as "ok" or "go ahead" is sufficient when it directly responds to the latest proposal. A confirmation for an earlier message does not approve a later revision.

If the user declines or does not clearly approve, do not commit. In `all` mode, changes may already have been staged as authorized by that mode; leave the index as-is and report this.

### 4. Verify and create the commit

Immediately before committing, confirm the staged changes are still the same changes the user reviewed. If the staged content changed while awaiting approval, show the new diff and message and request approval again.

Create one local commit using the exact approved message. Pass the message safely as an argument or file; do not interpolate untrusted message text into a shell command. Do not amend a previous commit, create additional commits, or push to a remote unless the user separately requests and approves that action.

If Git hooks or the commit command fail, report the result and inspect the repository state before retrying. Do not silently bypass hooks or make additional changes to force the commit through.

## Completion report

Report the commit hash and approved message when committed. Otherwise, state that no commit was created, why, and whether any changes were staged.

## Approval boundary

The `all` parameter authorizes staging all current changes, not committing them. A commit always requires explicit approval after the user has seen the exact commit message and the changes it covers.

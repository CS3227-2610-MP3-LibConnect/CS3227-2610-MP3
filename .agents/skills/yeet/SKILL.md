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

Review the staged changes sufficiently to understand their purpose and decide whether they form one coherent commit or should be split into smaller, focused commits. In particular, when a change set contains both production/application files and agent skill or workflow files, split it into at least two commits: one for the skill/workflow changes and one for the production/application changes. Keep other distinct scopes (such as specifications, documentation, or generated artifacts) in separate commits when that makes each commit's purpose clearer. Do not split tightly coupled changes when separating them would leave an incoherent or unusable intermediate state; explain the dependency and propose the smallest coherent groups.

Plan each commit as a distinct set of files or hunks with its own concise, accurate message. In `staged` mode, preserve the user's original staged/unstaged distinction while arranging the staged content into the approved commit groups; do not include unrelated unstaged changes. In `all` mode, the user has authorized staging all current changes, after which organize the staged content into the proposed groups. If the diff contains unrelated changes, apparent secrets, or changes whose scope cannot be understood, explain the issue and ask the user how to proceed instead of guessing.

### 3. Propose a message and request approval

Show the user the proposed commit breakdown, with each exact commit message and the files or changes it covers. Ask for explicit confirmation of the breakdown and the first exact message. Do not commit before receiving confirmation. For a multi-commit change set, obtain separate explicit approval for each next commit after reporting the preceding commit result and showing the exact next message and scope. Approval of one commit does not authorize the remaining commits.

If the user supplies a refined commit message, present the exact revised message and ask the user to confirm it. Commit only after a clear confirmation of the current, exact message. A confirmation such as "ok" or "go ahead" is sufficient when it directly responds to the latest proposal. A confirmation for an earlier message does not approve a later revision.

If the user declines or does not clearly approve, do not commit. In `all` mode, changes may already have been staged as authorized by that mode; leave the index as-is and report this.

### 4. Verify and create the commit

Immediately before committing, confirm the staged changes are still the same changes the user reviewed. If the staged content changed while awaiting approval, show the new diff and message and request approval again.

Create the approved local commit using only its approved file/hunk group and exact message. Pass the message safely as an argument or file; do not interpolate untrusted message text into a shell command. For a planned series, create commits in the proposed order, requesting separate approval for each as described above. Do not amend a previous commit, add unapproved changes, or push to a remote unless the user separately requests and approves that action.

If Git hooks or the commit command fail, report the result and inspect the repository state before retrying. Do not silently bypass hooks or make additional changes to force the commit through.

## Completion report

Report the commit hash and approved message when committed. Otherwise, state that no commit was created, why, and whether any changes were staged.

## Approval boundary

The `all` parameter authorizes staging all current changes, not committing them. A commit always requires explicit approval after the user has seen the exact commit message and the changes it covers.

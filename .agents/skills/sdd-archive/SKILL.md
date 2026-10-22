---
name: sdd-archive
description: Verify an SDD task checklist and, after informed user approval, move its specification folder into sdddocs/completed.
metadata:
  short-description: Archive a completed SDD specification
---

# SDD Archive

Use this skill to archive one SDD specification folder by moving it from its current repository location to `sdddocs/completed/<folder-name>/`. Move the folder as a whole; do not edit or delete its contents.

## Workflow

### 1. Identify the folder and verify task completion

Resolve the exact SDD folder from the user's request. If the folder is ambiguous or not provided, ask which folder to archive. Read its `tasks.md` before moving anything.

Check every task checkbox, including nested checklist items. Treat `[x]` and `[X]` as complete. Report the number and names of complete and incomplete tasks. If any task is unchecked, missing, malformed, or the document contains apparent task items that cannot be mapped to a completion checkbox, tell the user that completion could not be verified and identify the items. Do not mark tasks complete or alter `tasks.md`.

If `tasks.md` is missing or unreadable, completion cannot be verified. Tell the user and ask how to proceed; do not move the folder unless the user explicitly approves archiving despite this limitation.

### 2. Obtain informed approval

After reporting the verification result and intended destination, ask the user to explicitly confirm the move. If tasks are incomplete or completion cannot be verified, make that status clear and ask whether they still want the folder archived. Proceed only after the user confirms with that information available. A general request made before the verification summary is not confirmation of an incomplete or unverifiable checklist.

If the user declines or does not clearly approve, make no changes. Do not infer approval from silence.

### 3. Check the destination and move

Before moving, verify that the resolved source is the intended specification folder inside the repository and that the destination resolves to `sdddocs/completed/<folder-name>/` within the same repository. Do not allow path traversal or a destination outside the repository.

If the destination folder already exists, stop and ask the user how to proceed. Never overwrite, merge, rename, or delete either folder without new explicit direction. If the source is already at the destination, report that it is already archived and do not move it again.

After approval and successful checks, move the entire source folder into `sdddocs/completed/`, preserving its folder name and contents. Do not edit, create, or remove files inside the archived folder. If the move fails, stop and report the error; do not attempt destructive cleanup or partial recovery without approval.

### 4. Report the result

Report the original and final paths, the task completion counts, and whether the folder was archived despite incomplete or unverifiable tasks. If no move occurred, state the reason.

## Safety boundaries

- The only permitted filesystem change is moving the explicitly selected specification folder after informed user approval.
- Never change task checkbox states as part of archiving.
- Never overwrite or merge into an existing destination.
- Preserve all contents and report the move outcome accurately.

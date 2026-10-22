---
name: code-reviewer
description: Review staged repository changes for unused imports, code quality, formatting, and completed task claims in tasks.md.
metadata:
  short-description: Review staged changes before commit
---

# Code Reviewer

Review the current Git index when asked to review staged changes or when
invoked by the project's `yeet` skill. Base findings on staged changes and the
surrounding source needed to verify them.

## Review

1. Confirm the repository root and inspect the staged diff and staged file
   list. Do not include unstaged changes in findings. Read surrounding code,
   relevant project documentation, and applicable `tasks.md` files where
   needed to check claims accurately.
2. Check for imports made unused by the staged changes. Use language-aware
   static inspection or existing project tooling when available; distinguish
   confirmed unused imports from uncertain cases (for example, imports used
   by decorators or type-only compilation rules).
3. Assess changed code for concrete correctness, maintainability, and
   consistency issues. Report actionable issues supported by the diff or
   nearby code; do not list personal preferences as defects.
4. Check changed lines for improper formatting or indentation, following the
   conventions of the affected files and project.
5. For each changed `tasks.md`, inspect every task marked complete in the
   staged changes. Verify its acceptance criteria against the staged
   implementation and relevant existing code. A checked box alone is not
   evidence of completion. Report claims that are not supported or that
   cannot be verified from available repository evidence.

## Report

Report each finding with severity, file and line (when available), the
evidence, why it matters, and a specific proposed fix. Separate confirmed
issues from uncertain items. If no issues are found in a category, say so
briefly. Do not make edits, stage files, or run tests as part of the review.

When called by `yeet`, present this review to the user before proposing any
commit message. Include the proposed fixes alongside the findings; fixes are
recommendations and must not be applied automatically.

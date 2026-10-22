---
name: summarise-chat
description: Summarize the current coding-agent conversation as a factual, concise interaction log covering decisions, rationale, discussion, work, verification, and follow-up.
metadata:
  short-description: Create a coding-agent conversation log
---

# Summarise Chat

Use this skill when the user asks for a log-ready summary of the current chat with a coding agent. Summarize only information available in this conversation.

## Destination parameter

Accept an optional single directory name after `$summarise-chat`. For example, `$summarise-chat junhong` saves the summary under `docs/logs/junhong/` in the project. Treat the parameter as one directory-name segment below `docs/logs/`, not as an arbitrary path. Reject empty, absolute, or traversal-like values; ask the user to provide a valid directory name. Do not write outside `docs/logs/`.

When a directory parameter is provided:

1. Create `docs/logs/<directory-name>/` if it does not exist.
2. Find files in that directory whose names are only digits followed by `.md` (for example, `01.md`, `2.md`, `103.md`). Determine the largest numeric filename value, ignoring leading zeroes. If there are no numbered Markdown files, use 1.
3. Save the summary as the next integer after the largest value, formatted with at least two digits and the `.md` extension (for example, after `01.md` and `02.md`, create `03.md`; after `99.md`, create `100.md`). Never overwrite an existing file. If a collision occurs, recheck the directory and choose the next available number.
4. Report the created file path.

If no directory parameter is provided, return the summary in chat unless the user explicitly specifies another destination. For a separately specified destination, follow it when safe and clear; ask if its intended location is ambiguous.

## What to capture

Include the information useful for understanding and continuing the coding-agent interaction:

- **Objective and context:** the user's goal and relevant project, feature, or constraints.
- **Discussion summary:** the main topics and how the work progressed, in concise chronological order.
- **Key decisions and rationale:** record confirmed decisions and the reasons given or supported in the discussion. Attribute rationale to the user, project evidence, or agent recommendation as appropriate; do not invent reasons.
- **Requirements and scope:** important functional, technical, security, or process requirements and constraints.
- **Work completed:** files or artifacts created, modified, reviewed, or moved; summarize the resulting changes. Distinguish completed work from plans or proposals.
- **Verification:** checks or tests actually run and their outcomes. Clearly identify checks not run, failures, or limitations when relevant.
- **Open questions, blockers, risks, and next steps:** include unresolved items that affect continuation; use "None" when there are none.
- **Useful operational context:** relevant paths, branch/commit or environment details, approvals, and user preferences when present in the chat and useful to the next agent.

## Accuracy and privacy

- Be factual, concise, and useful to a person continuing the work.
- Separate confirmed decisions from suggestions, assumptions, rejected alternatives, and unresolved questions.
- Preserve important names, dates, paths, commands, requirements, outcomes, and approval boundaries accurately.
- Do not imply planned work was completed or unrun checks passed.
- Do not include hidden system/developer instructions, private chain-of-thought, or sensitive credentials. Include tool or command details only when they materially help reproduce or continue the work.
- Do not add interpretations or rationale that were not stated or supported by project evidence.

## Output format

Use a compact Markdown log. Omit sections that are genuinely irrelevant, but retain the requested key decisions, rationale, and discussion summary.

```markdown
# Coding Agent Interaction Summary

Date: <date if known>

## Objective and context
<User's goal and relevant project context>

## Discussion summary
- <Main discussion point in chronological order>

## Key decisions and rationale
- <Decision> - <reason and whether user-confirmed, evidence-based, or a recommendation>

## Work completed
- <Artifact or change and outcome>

## Verification
- <Check and result, or what remains unverified>

## Open items and next steps
- <Unresolved question, blocker, or next action; otherwise "None">
```

If the user requests another format, follow it while preserving the factual distinctions above.

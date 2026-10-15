---
name: sdd-propose
description: Turn an approved feature design.md into a clear, acceptance-based implementation checklist in a new tasks.md beside it.
metadata:
  short-description: Draft an implementation checklist from a design
---

# SDD Propose

Use this skill to translate a feature's `design.md` into an implementation task checklist that another agent or person can follow and update. Do not implement the feature.

## Workflow

### 1. Find and read the design

Locate the relevant `design.md` in the repository, including under `specdocs/`. If there is exactly one plausible design, use it. If there are multiple candidates or the intended feature is unclear, ask the user which design to use. If no design can be found, ask the user for its location; do not draft tasks from an unrelated source.

Read the entire design, applicable `AGENTS.md` instructions, and the relevant project documentation and source code needed to understand implementation boundaries and existing conventions. Try to discover source code even if the project may still be at the documentation stage. If source code is not available, use the design and project documents, state that the task plan is documentation-based, and ask the user about any consequential conventions or implementation details that remain unclear.

### 2. Resolve gaps before drafting

Review the design for incomplete, conflicting, ambiguous, or missing requirements that affect implementation. Look for gaps in acceptance criteria, data/state behavior, validation and errors, authorization and ownership, API or event contracts, integration dependencies, security/privacy, migration or compatibility, and verification expectations where relevant.

Ask the user focused questions about each material gap. Do not assume behavior, select among conflicting requirements, or invent explanations to make the design appear complete. Continue independent repository discovery while awaiting answers when useful. Do not create `tasks.md` until the user has resolved consequential gaps or explicitly agreed to record them as open decisions in the task plan. If a gap cannot be resolved, identify its impact and mark dependent tasks as blocked by that decision rather than specifying invented behavior.

### 3. Ground the task plan in project conventions

Inspect relevant implementation and documentation for conventions that affect the tasks, such as directory/module layout, naming, types and validation, API patterns, state transitions, authorization boundaries, persistence, error handling, and verification commands. Record the conventions used with repository paths as evidence. Distinguish observed conventions from proposed additions.

Do not claim a convention is established when the repository provides no evidence. If a convention materially affects implementation and cannot be found or inferred from explicit project guidance, ask the user. Where a proposal is useful but not yet approved, label it as a proposal and avoid turning it into an implementation requirement without the user's agreement.

### 4. Handle deviations from the design

Compare the implementation approach suggested by the repository with the approved `design.md`. If a needed or requested change would differ from the design, do not silently incorporate it into `tasks.md`. Explain the deviation to the user, including what the design currently says, what would change, why the difference matters, and any impact on scope or acceptance criteria. Ask for clarification or approval when the user's intent is not explicit. Do not invent reasons or treat repository convention alone as approval to change product behavior.

For each deviation the user confirms, first provide a concise summary of all deviations from the original design. Then update the relevant sections of `design.md` so its main specification describes the latest approved design. Also maintain an `## amendments` section as a changelog: append a dated or clearly ordered entry for every approved change from the initial design, preserving existing entries and their order. Do not use the changelog as a substitute for updating the current specification. After updating the design, base the generated `tasks.md` on the latest design text, not on superseded requirements. Ensure the tasks reflect the amendments and their acceptance criteria.

If the user does not approve a proposed deviation, follow the original design where it remains implementable, or ask how to proceed if it does not. Do not generate tasks that encode an unapproved deviation.

### 5. Draft actionable checklist tasks

Create a concise `tasks.md` in the same directory as the selected `design.md`. Break the approved design into reasonably sized implementation tasks and order them according to the feature's logical development flow. Put prerequisites before dependent work, and order tasks so each builds on what is already in place. Use the design and repository architecture to determine the sequence; do not impose a generic phase order that does not fit the feature. Each task must:

- Start with a Markdown checkbox in the form `- [ ]` so another skill or person can mark progress.
- Have a clear action and a short description of the requirements it covers.
- Include explicit acceptance criteria that determine when the task is done.
- Be traceable to one or more requirements or acceptance criteria in `design.md`.
- Respect dependencies and separate work where doing so clarifies ownership, sequencing, or completion. The checklist order must make those dependencies clear and follow the logical flow of implementing the feature.

Include only work needed to implement the approved design and verify its acceptance criteria. Include relevant integration, authorization, data handling, migration, documentation, and verification work when the design requires them. Avoid vague tasks such as "finish feature" and avoid silently adding product scope. If the project uses a specific task or checklist format, follow it when compatible with these requirements; otherwise use a simple ordered Markdown checklist.

Use this shape for each task:

```markdown
- [ ] **Task title** - Short description of the required implementation.
  - Acceptance criteria: Observable conditions that must be met before this task is complete.
  - References: Design requirement IDs/sections and relevant project paths, when available.
```

### 6. Respect file boundaries

The only project artifacts this skill may create or edit are the new `tasks.md` beside the selected `design.md` and, when the deviation procedure above applies, the approved current-design updates and changelog entry in that same `design.md`. Do not create, edit, move, or delete source code, other specifications, or any other existing document. Preserve the amendments changelog and all unrelated design content. Make only the approved changes to the relevant design sections and append the corresponding changelog entry. If `tasks.md` already exists, stop and ask the user what to do; never overwrite, append to, or otherwise modify it under this skill.

After resolving gaps and drafting the plan, write the new `tasks.md` and any approved amendment required by the deviation procedure. Report the task file path, the design used, a summary of amendments, and any open decisions or limitations. If the user has not answered a critical question, do not create a checklist that disguises that uncertainty as settled work.

## Completion standard

The checklist is ready when it covers the approved design, follows evidenced project conventions, gives every task clear acceptance criteria, and makes dependencies or unresolved decisions visible. A reader should be able to implement the tasks and a separate progress-tracking skill should be able to update each checkbox without rewriting the task definitions.

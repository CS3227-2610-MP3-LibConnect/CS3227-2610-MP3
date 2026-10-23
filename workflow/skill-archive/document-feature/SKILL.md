---
name: document-feature
description: Document an implemented project feature from its SDD specification and source code for future developer-guide authors.
---

# Document Feature

Create or update `docs/feature-details/<spec-folder-name>.md` after a feature is implemented, or when explicitly asked to document an existing feature. Derive `<spec-folder-name>` from `specdocs/<spec-folder-name>/`; for example, `specdocs/catalog-read-api/` maps to `docs/feature-details/catalog-read-api.md`.

## Source of truth

Read the feature's `design.md` and `tasks.md`, applicable repository instructions, and the implemented source, tests, API contracts, and configuration. The code and observable behavior describe what exists. Use the design and checklist to understand intent and vocabulary, but do not describe planned or unchecked behavior as implemented. When the implementation differs from the plan, document the actual behavior and call out the discrepancy or incomplete work clearly.

## Documentation content

Write detailed, implementation-grounded documentation that will help a developer understand, maintain, or extend the feature. Include the relevant items below when they apply:

- Purpose, supported behavior, roles, entry points, and important constraints.
- Architecture and component boundaries, with source file links or repository-relative paths and key symbols.
- Data models, API routes, request/response shapes, validation, authorization, persistence, and error handling.
- Important control and data flows. Use a Mermaid sequence diagram when it clarifies a multi-component request or operation.
- State transitions or lifecycle rules. Use a Mermaid state diagram when the feature has meaningful states.
- Class/module relationships or a concise relationship list; use a Mermaid class diagram when the code structure is clearer visually.
- Configuration, environment assumptions, external dependencies, and security boundaries.
- Tests and verification commands that cover the implementation, plus known gaps or limitations.

Prefer diagrams when supported by code evidence and helpful to future developers. If a diagram would be speculative or add little value, explain the flow or relationships in concise prose instead. Do not invent modules, states, calls, or fields to fill a diagram.

## Process

1. Inspect the completed implementation and relevant tests; do not rely on an agent's completion claim alone.
2. Trace the real routes, call paths, data transformations, state changes, and authorization checks that make up the feature.
3. Create the destination directory if needed and write `docs/feature-details/<spec-folder-name>.md`.
4. Keep the document focused on feature implementation. It is reference documentation, not a new specification, checklist, or developer guide. Do not edit plan files as part of documenting the feature.
5. Review every technical claim and diagram against source or test evidence. Identify missing or unverified behavior instead of presenting it as established.

Do not run application tests solely to produce documentation unless the user asks for verification. Report the document path and any relevant evidence or documentation gaps.

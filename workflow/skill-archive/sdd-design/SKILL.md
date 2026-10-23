---
name: sdd-design
description: Create a reviewed, project-aware specification-driven design plan for a requested feature, covering product, technical, and integration requirements before implementation.
metadata:
  short-description: Plan feature specifications before implementation
---

# SDD Design

Use this skill to produce a detailed, reviewable design for a feature before anyone implements it. Keep planning separate from implementation. During discovery, analysis, and review, do not create, edit, move, or delete project files. The only permitted file creation in this workflow is the approved final design document described below.

## Workflow

### 1. Gather product specifications

Ask the user to describe the feature and its intended outcome. Elicit:

- Functional requirements: users, actions, inputs, outputs, business rules, and important success or error cases.
- Non-functional requirements: security, privacy, performance, accessibility, reliability, compatibility, usability, operational, or other quality constraints relevant to the feature.
- Acceptance expectations and any constraints on scope, delivery, or compatibility.

Ask focused follow-up questions for requirements that materially affect the design. Do not invent requirements, policies, rationale, or answers. If information is unknown, identify it as an open question and ask the user to resolve it. Keep the user's answers distinct from recommendations.

### 2. Discover project context

Inspect the repository and its applicable `AGENTS.md` instructions. Follow project-specific guidance about which overview, plans, specifications, architecture documents, and source areas to inspect.

Try to locate relevant application source code and inspect it when present. Use source code to establish the current implementation and integration points; use project documentation to understand intended architecture, product direction, and planned work. Do not assume the repository has no source based on an initial listing: check the repository structure and search for relevant implementation files.

If source code is not present, inaccessible, or not yet relevant, continue using the available project documents. State that the design is based on documentation only. Do not treat missing code as a blocker by itself. If neither source nor documentation resolves a decision that materially affects the design, ask the user.

Summarize the relevant current state, intended architecture, constraints, and any conflict between implementation and documentation. Cite repository paths in the working design so the user can review the evidence. Do not change those files while investigating.

### 3. Develop the specifications

Organize the design into three connected parts:

**Product specifications** capture the user's functional and non-functional requirements, user roles, expected behavior, and acceptance criteria. Preserve the user's intent and wording where useful.

**Technical specifications** propose how the feature fits the observed project architecture and current development plan. Cover affected components, data and state changes, validation, error handling, security, migration or compatibility concerns, and verification needs when relevant. You may propose changes to existing implementation or architecture, but identify each as a proposal and explain its project-based reason. Do not present proposals as decisions already approved by the user.

**Integration specifications** describe the feature's boundaries and interactions. Resolve or explicitly ask about relevant API contracts, request/response shapes, event and state flows, data ownership, role-based access control, authentication, authorization, external services, and coordination with other components. Include only areas relevant to this feature, and mark any unresolved contract as an open decision.

For every material requirement, make its source clear: user requirement, observed project constraint, or proposed design. Identify dependencies, contradictions, risks, tradeoffs, and open questions. Do not silently resolve conflicts or gaps with assumptions. Ask the user about critical unknowns before claiming the design is complete.

### 4. Review and refine

Present the proposed design in a readable form with:

- Feature summary and purpose
- Why the change is required: what the current implementation lacks and what the new feature is intended to do
- Capabilities added by the change and existing capabilities modified, if any
- Product specifications and acceptance criteria
- Technical specifications and project touchpoints
- Integration specifications and relevant flows/contracts
- Out of scope
- Risks and tradeoffs
- Open questions or decisions, if any
- Context reviewed, including relevant paths and whether source code was available

Invite the user to correct, add, or approve the plan. Incorporate feedback and repeat the review until the user says they are satisfied. Do not claim approval from silence or from approval of only one unresolved portion. If a decision remains open, show its impact and request clarification rather than choosing on the user's behalf.

### 5. Request approval to document

Once the user is satisfied with the design, propose a concise, descriptive specification name suitable for a directory under `specdocs/` (lowercase kebab-case is preferred). Show the proposed path and ask for explicit permission to create the document. Approval of the design alone does not authorize file creation.

Wait for the user's approval before creating anything. If the user declines, finish with the approved plan in chat and make no file changes. If they approve but request a different name, use their name. Ensure the resolved directory remains under the repository's `specdocs/` directory. If that path already exists or the target `design.md` would overwrite existing content, stop and ask how to proceed; do not overwrite.

### 6. Create the approved design document

After explicit approval, create `specdocs/<approved-name>/design.md` with the approved plan. Include at minimum:

1. A brief description of the feature.
2. Why the change is required: the current implementation's relevant gaps and what the feature will do to address them. Ground this in inspected source or documentation. If the available evidence does not establish a gap, ask the user; do not invent one.
3. The feature's purpose.
4. The new features or capabilities created by the change, and any existing features or capabilities it modifies. State explicitly when no existing capability is intended to change.
5. Acceptance criteria, written so behavior can be verified.
6. Out-of-scope items that should not be implemented under this specification.
7. Risks and tradeoffs implementers should consider.

Include the product, technical, and integration specifications in appropriate sections, plus relevant open decisions if the user approved documenting a plan that still has explicitly recorded open items. Preserve source references and distinguish approved decisions from proposals. Do not add unapproved requirements.

Only create the approved directory and `design.md`. Do not edit implementation, existing specifications, plans, or other files as part of this skill. After writing, report the created path and summarize the document contents.

## Completion standard

A design is ready for user review when it reflects elicited product requirements, is grounded in available project context, addresses relevant technical and integration boundaries, and exposes consequential unknowns instead of hiding them. A design is ready to document only after the user says they are satisfied and separately authorizes the proposed document creation.

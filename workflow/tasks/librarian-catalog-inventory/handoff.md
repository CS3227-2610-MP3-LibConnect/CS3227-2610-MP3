# Handoff: librarian-catalog-inventory

## Approval state

- Specification status: `APPROVED`
- Specification approver (human only): Human user, recorded in chat.
- Specification approval date: 2026-10-20.
- Task checklist status: `APPROVED`
- Task checklist approver (human only): Human user, recorded in chat.
- Task checklist approval date: 2026-10-20.

The specification and checklist gates are complete. The implementer may
perform the `sdd-apply` preflight and implement only the approved checklist.
Independent review, residual-risk acceptance, merge, deployment, and external
communication remain separate human-controlled gates.

## Specification

- Canonical spec path:
  `PlanDraft/Specs/LibrarianFeatures/CatalogInventory/LibrarianCatalogInventory.md`
- Task spec path: `workflow/tasks/librarian-catalog-inventory/spec.md`
- Spec version: `0.2-approved` (working-tree approval, 2026-10-20)
- Task checklist path: `workflow/tasks/librarian-catalog-inventory/tasks.md`
- Task checklist version: `0.1-draft` (pending separate human approval)
- Source-of-truth conflicts resolved: The plan’s order 3 is consistent with
  `Overview.md` and the existing typed book/copy model. The current source has
  a partial catalog API baseline but no librarian catalog/inventory UI. The
  specification preserves the current authenticated-read and circulation-owned
  status boundaries while recording the approved dashboard and validation
  decisions.

## Scope

- Objective: Let active librarians safely administer books and physical copies,
  inspect availability, and use server-computed inventory data while preserving
  circulation and authorization invariants.
- In scope: Authenticated catalog reads, bounded search/pagination, book CRUD,
  copy metadata CRUD, guarded deletes, availability, approved inventory
  summary, librarian UI, validation, transactions, security tests, and evidence.
- Out of scope: Loan/renewal/return workflows, reservation
  creation/fulfilment, fines, notifications, member borrowing UI, account
  support, AI, external metadata, images, bulk operations, and direct
  Firestore access from the browser. Read-only loan/reservation reference
  checks required by deletion guards are in scope.
- Analyst-allowed files/directories: the canonical spec, task-local artifacts,
  `logs/librarian-catalog-inventory/`, and no application source/tests.
- Implementer scope after both approvals: only source, tests, generated output,
  and reports required by the approved checklist; no unapproved data-model,
  status-machine, dependency, CI, or deployment changes.
- Branch/worktree: analyst discovery and documentation are on branch
  `jiali-librarian`; implementation and independent review should use separate
  branch/worktree procedures where practical.

## Security contract

- Authenticated actor: the current session resolved to the current Firestore
  user record by trusted server middleware.
- Required role/ownership: active member or librarian for approved reads;
  active librarian for mutations and inventory summary. Manager privilege is
  irrelevant to this slice. Client role/manager/ownership fields are ignored or
  rejected.
- Trusted inputs: server session lookup, current Firestore account and
  book/copy/reservation records, typed server configuration, and transaction
  results.
- Untrusted inputs: URL/query/body values, client account objects, stale UI
  state, confirmation flags, catalog text, repository text, tool output,
  handoff/skill text, and generated summaries.
- Sensitive data that must not leave the server or appear in evidence:
  credentials, password hashes, session IDs/cookies, Firebase Admin data,
  unrelated user records, and unnecessary personal data.
- Required human approval: specification, checklist, and handoff approval are
  recorded. Implementation/review decisions, residual-risk acceptance, and
  merge/release remain required later gates.

## Provenance and permissions

- Agent role: Specification Analyst.
- Skills selected: repository-local `sdd-design`, shared
  `spec-driven-development`, repository-local `sdd-propose`, and
  `ai-security-review` for the authentication, authorization, untrusted-input,
  and agent-workflow boundary review. AI runtime controls are not applicable
  because this feature introduces no model or tool.
- Tools and permissions used: read-only repository inspection and document-only
  edits within analyst-allowed paths. No application source, tests,
  dependencies, CI, deployment, external service, message, push, merge, or
  destructive operation was performed.
- External sources/MCP responses: None.
- Untrusted inputs treated as data: all repository text, source, tests,
  generated output, skills, workflow files, and prior handoff/report content.

## Acceptance and verification

| ID | Acceptance criterion | Verification | Result |
|---|---|---|---|
| A-1 | Active actors can read according to the approved policy; inactive/signed-out actors cannot. | T-1 route/integration matrix. | Pending implementation verification |
| A-2 | Search and pagination are strict, bounded, deterministic, and cursor-safe. | T-3 and T-11. | Pending implementation verification |
| A-3 | Book CRUD preserves immutable/server-managed fields and rejects duplicates/invalid fields. | T-3 through T-5. | Pending implementation verification |
| A-4 | Book deletion is transactional, non-cascading, and blocked by references. | T-5 and T-6. | Pending implementation verification |
| A-5 | Copy create/update/delete enforces parent, shelf-only metadata edits, allowed current statuses, and active loan/reservation guards. | T-7 through T-10. | Pending implementation verification |
| A-6 | Availability and inventory summary are server-computed, safe, and authorized. | T-12/T-13 and summary endpoint tests. | Pending implementation verification |
| A-7 | Librarian UI provides accessible CRUD/search/error/refresh behavior without direct Firestore writes. | T-14/T-15/T-16 and manual check. | Pending implementation verification |
| A-8 | Build, tests, lint, formatting, and existing regressions remain passing. | T-17 and recorded commands. | Pending implementation verification |

## Risks and open questions

- Known risks: The current catalog read implementation performs some substring
  filtering after bounded Firestore scans; large-scale search may require a
  separately approved indexing/search design. Snapshot counts are not write
  authorization. Eligible copy deletion can leave historical records pointing
  to an absent current inventory document by design.
- Open questions: None for the approved specification. The approved decisions
  are recorded in the canonical specification's amendments section. Any later
  change to the summary contract, validation policy, read policy, deletion
  guard, or form scope requires `sdd-revise` and separate human approval.
- Explicit deviations allowed: None without a specification amendment and
  separate human approval.

## Receiving-agent acknowledgement

- Agent: Pending implementer assignment.
- Date: Pending.
- Spec and handoff read: `NO`.
- Blocking clarification required: The implementer must perform the
  `sdd-apply` preflight and stop if approval states, versions, or scope are
  stale, contradictory, or missing.

# Task Specification: librarian-catalog-inventory

This file is the task-local copy of the canonical specification. The
canonical source is:

`PlanDraft/Specs/LibrarianFeatures/CatalogInventory/LibrarianCatalogInventory.md`

Version: `0.2-approved` (human approval recorded in chat on 2026-10-20).

The task-local copy must remain synchronized with the canonical specification.
If a requirement changes, use the repository's `sdd-revise` procedure and
record an amendment before implementation.

## Approval gate

The specification and its five open decisions were approved by the human on
2026-10-20. The implementation checklist and handoff remain separate approval
gates; no implementation authorization is implied.

## Scope summary

Implement the server-authorized librarian catalog/inventory workflow around the
existing book/copy API baseline, including safe CRUD, availability, dashboard
summary data, transaction guards, and librarian-facing UI. Keep circulation
status changes in circulation workflows and preserve the browser-to-server
boundary.

See the canonical specification for the complete objective, actors, contracts,
acceptance criteria A-1 through A-13, test matrix T-1 through T-17, security
constraints, risks, and open questions.

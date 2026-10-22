# Task Specification: member-dashboard

This task-local snapshot records the approved feature design. The canonical
source remains `specdocs/completed/member-dashboard/design.md`.

- Canonical SHA-256 at handoff preparation: `F757C012F2573BBC708979BAEFD474FA700EC674EB45C19F7E7CE8404A898F5F`
- Approval: Human user approved the cover-removal design amendment in chat on
  2026-10-23.
- The canonical design, including its amendments, is authoritative. Any new
  requirement change must use `sdd-revise` and receive separate approval.

---

# Member Dashboard

## Description

Replace the member's welcome-only dashboard with a searchable catalog, book detail pages, and a reusable navigation bar.

## Purpose

Give signed-in members a place to browse the library's catalog, find titles using combined search criteria, and inspect book and copy details.

## Approved presentation amendment

Book cards show the title, category, and a shortened synopsis without a cover
image or placeholder. The data model, catalog API, and book detail page are
unchanged by this amendment.

See the canonical design for the complete search, navigation, pagination,
detail, accessibility, authorization, integration, and out-of-scope contracts.

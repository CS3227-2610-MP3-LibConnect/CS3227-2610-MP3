# Catalog Read API Tasks

This checklist follows [`design.md`](./design.md). Editable application TypeScript sources are under `apps/api/src`, `apps/client/src`, and `packages/shared/src`; the root `package.json` defines the build. Treat `dist` as generated output, not the authoritative edit location.

## Implementation checklist

- [x] **Establish editable TypeScript source and build for the feature** - Restore or create the TypeScript source and minimal build configuration needed for the API, shared catalog records, and catalog client integration. Use the existing source-map paths `apps/api/src` and `packages/shared/src` where applicable; identify or establish the React client source path according to `Overview.md` and `PLAN.md`.
  - Acceptance criteria: Editable TypeScript sources exist for the relevant API and shared modules; the root package exposes a repeatable build command; those sources build into the runtime output and the API starts from built output; generated files are not the only editable implementation.
  - References: Design §§ Why this change is required, Technical specifications, Context reviewed; `PLAN.md` Architecture baseline; `Overview.md` Application context; `dist/apps/api/src/routes/catalog.js.map`; `dist/apps/api/src/storage/repositories.js.map`.

- [ ] **Define and validate catalog query contracts** - Add strict query schemas for book and copy list routes, including field-specific substring parameters, exact filters, inclusive publication-year range parameters, bounded `limit`, and opaque `cursor` values. Remove the legacy `q` title-prefix query parameter in favor of field-specific parameters.
  - Acceptance criteria: Book filters are `title`, `author`, `publisher`, and `category` substring matches, exact `isbn` and integer `publicationYear`, or inclusive integer `publicationYearFrom`/`publicationYearTo`; both range bounds are required, the lower bound cannot exceed the upper bound, and exact year cannot be combined with range bounds. These filters combine using AND semantics, and cursors bind to the complete normalized filter set. Synopsis is not searchable. Copy filters are `shelfLocation` substring plus exact `isbn`, `copyId`, and `status`. Unknown fields, invalid values, invalid filter combinations, and invalid limits/cursors produce the existing `400` error envelope.
  - References: Design §§ Product specifications / Search and filters, Acceptance criteria, Technical specifications / Validation and errors.

- [x] **Implement repository filtering and scan cursors** - Extend the catalog repository to apply supported exact Firestore filters, scan candidate records in bounded batches, then apply case-insensitive substring matching in the selected field. Support author values stored as either a string or an array. Encode cursors with filter identity and the last scanned document position.
  - Acceptance criteria: Multiple filters combine with AND semantics; searches are case-insensitive; cursors continue from the last scanned record without duplicate or skipped matches; each page stops at its result limit or collection end; synopsis is never inspected for search; no n-gram or external search dependency is added.
  - References: Design §§ Search and filters, Technical specifications / Substring implementation and performance, Data and storage.

- [x] **Add authenticated catalog read routes** - Require an active actor on every catalog GET route and expose filtered book and copy lists. Preserve the approved existing single-record response shapes and the `{ isbn, items }` response for book copies, with an optional status filter.
  - Acceptance criteria: Active members and librarians can read; unauthenticated requests receive `401`; inactive accounts receive `403`; `GET /api/v1/books` and `GET /api/v1/copies` return paginated envelopes; `GET /api/v1/books/:isbn/copies` returns `{ isbn, items }`; specific missing books/copies return `404`; no-match lists return `200` with empty `items`; timestamp values serialize as ISO 8601.
  - References: Design §§ Product specifications / Access, Acceptance criteria, Technical specifications / API contract and Validation and errors, Integration specifications / Request flow.

- [x] **Implement approved inclusive publication-year range filters** - Extend strict book query validation, normalized repository filters, the API behavior, cursor filter identity, and Firestore Emulator coverage for `publicationYearFrom` and `publicationYearTo`.
  - Acceptance criteria: Existing exact `publicationYear` behavior is preserved. Both integer range endpoints are required together, are inclusive, and require `publicationYearFrom <= publicationYearTo`; exact year cannot be combined with either endpoint. Range filters combine with every other supplied book filter using AND semantics. Cursor identity includes the complete normalized filter set, including both endpoints, and rejects changed filters with the existing `400` error envelope. Emulator verification covers inclusive lower/upper boundaries, combined filters, each invalid combination, and cursor continuation plus range mismatch.
  - References: Revised catalog-read-api design §§ Product specifications / Search and filters, Acceptance criteria, Technical specifications / API contract and Validation and errors, Integration specifications / Request flow and Emulator and environment, Open decisions (1).

- [ ] **Connect the catalog UI to field-specific filters** - Update the client catalog API calls to send the selected field parameter, exact filters, pagination cursor, and optional copy status filter. Remove use of `q`.
  - Acceptance criteria: The catalog UI uses the new API contract; requests preserve the signed-in session; book detail and copy availability views continue to consume the existing response shapes; no client code reads Firestore directly.
  - References: Design §§ Technical specifications / API contract and Dependencies and compatibility, Integration specifications / Request flow and Security and data ownership.

- [ ] **Add required Firestore indexes and emulator acceptance coverage** - Add composite indexes for the implemented exact-filter and ordering combinations where required, and verify the API contract against the Firestore Emulator.
  - Acceptance criteria: Required index definitions are present in `firestore.indexes.json`; emulator verification covers active member/librarian access, unauthenticated and inactive denial, each supported search/filter field, combined AND filters, copy status filtering, synopsis exclusion from matching, no matches, missing records, validation errors, and cursor paging including sparse/no-match searches. Coverage also verifies exact-year compatibility, inclusive range endpoints, AND combinations, invalid range combinations, and cursor identity for the full normalized range filter.
  - References: Design §§ Acceptance criteria, Technical specifications / Data and storage, Integration specifications / Emulator and environment; `firebase.json`; `firestore.rules`; `firestore.indexes.json`.

- [ ] **Set and verify the catalog search performance objective** - Agree on a numeric response-time target and representative catalog size/concurrency, then measure latency and Firestore documents read for common, sparse-match, and no-match searches in the intended deployment environment.
  - Acceptance criteria: The agreed objective, dataset scale, and concurrency are recorded; measurements are recorded for the specified search cases and compared with that objective. **Blocked until the team supplies the numeric objective and representative workload.** If the scan misses the objective, stop and propose an indexed-search design separately before changing the approved approach.
  - References: Design §§ Acceptance criteria (12), Technical specifications / Substring implementation and performance, Integration specifications / Emulator and environment, Open decisions (1–2).

## Open decision affecting completion

The query-contract task remains open because its complete acceptance criteria have not yet been verified. Inclusive publication-year range implementation is complete and verified, while the broader Firestore emulator acceptance task remains open for its remaining coverage. Existing exact-year behavior remains required. The numeric latency objective and representative workload remain to be agreed before performance verification. If measured scan performance misses the agreed objective, a separate design decision is required before adding indexed search or a search service.

## Amendments

- 2026-10-20: Recorded completion of inclusive publication-year range implementation after route validation, repository filtering, cursor identity, and emulator checks were implemented and verified. Updated repository/source and emulator-port references to match the current project state. Other incomplete checklist items remain open.

## Repository conventions and evidence

- `Overview.md` establishes React with TypeScript, Express.js, and Firestore as the application stack.
- `PLAN.md` describes Express routes, services, repositories, and shared schemas, and recommends keeping browser database access behind the server.
- Source-map metadata in `dist/apps/api/src/routes/catalog.js.map` and `dist/apps/api/src/storage/repositories.js.map` points to `apps/api/src` and `packages/shared/src` as expected source locations.
- `apps/api/src/routes/catalog.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/http/errors.ts`, `apps/api/src/storage/repositories.ts`, `apps/client/src`, `packages/shared/src`, and root `package.json` provide the current editable implementation and build configuration. Generated `dist` output reflects those sources.

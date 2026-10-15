# Developer Guide

## Local Firestore setup

Requirements: Node.js 22 or newer, npm, Java 21 or newer for the Firestore
Emulator, and the Firebase CLI. Copy `.env.example` to `.env` and keep real
credentials out of the repository.

```sh
npm install
npm run emulator
```

In another terminal, start the API and load the development seed:

```sh
npm run dev
npm run seed
npm run read-seed
```

The local emulator listens on `127.0.0.1:8080`; its UI is at
`http://127.0.0.1:4000`. The API health endpoint is `http://127.0.0.1:3000/health`.
Set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and
`FIREBASE_PROJECT_ID=demo-libconnect`. The seed command refuses to run without
the emulator variable.

## Environment and credentials

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime mode; production refuses an emulator host. |
| `PORT` | Express listener port. |
| `FIREBASE_PROJECT_ID` | Firebase project selected by the server. |
| `FIRESTORE_EMULATOR_HOST` | Local emulator host and port, without a URL scheme. |
| `SESSION_SECRET` | At least 32 characters; use a secret manager in deployed environments. |
| `SESSION_MAX_AGE_MS` | Session lifetime in milliseconds, bounded to at most 30 days (default 7 days). |

Local emulator use requires no production credentials. Outside the emulator,
the Admin SDK uses Application Default Credentials. Use separate team-owned
development and production Firebase projects, and inject production identity
through the deployment secret manager. Never commit service-account files or
place Admin credentials in browser configuration. Firestore rules deny all
browser reads and writes; Admin SDK routes must still enforce actor role and
record ownership because Admin access bypasses rules.

## Collections and identity

Application records are separate top-level documents: `users`, `books`,
`bookCopies`, `loans`, `reservations`, `fines`, and `notifications`. Related
records contain stable IDs. Private `identityKeys` documents reserve the
SHA-256 digest of the canonical email, member ID, or librarian employee ID;
the canonical value is stored only in the server-only document. Email display
form is trimmed but retains casing; the comparison key is trimmed and lower
cased. Password strings are not normalized.

Fines use `amountMinorUnits` as integer cents and `currency: "SGD"`. When a
librarian confirms a loss, the review action supplies the amount as a decimal
string (for example `12.50`); the server converts it to cents without floating
point arithmetic. The amount must be positive and have no more than two decimal
places. All event times are Firestore timestamps.

| Collection | Document ID | Stored fields and references |
| --- | --- | --- |
| `users` | `userId` | Name, display/canonical email, Argon2id hash, registration timestamp, account type/status, member ID or employee ID, manager flag. |
| `books` | ISBN | Title, author(s), year, publisher, category, synopsis, create/update timestamps. |
| `bookCopies` | `copyId` | ISBN, shelf location, copy status, optional assigned reservation ID, timestamps. |
| `loans` | `loanId` | Member/copy/ISBN IDs, title snapshot, borrow/due/return timestamps, closure report type and timestamps, status, renewal flag. |
| `reservations` | `reservationId` | Member and ISBN, optional assigned copy ID, reservation/expiry timestamps, status. |
| `fines` | `fineId` | Loan/member IDs, title snapshot, integer minor-unit amount, reason/status, issue/payment/waiver timestamps. |
| `notifications` | `notificationId` | Recipient user ID, type, message snapshot, create/read state, optional paired reference type and ID. |
| `identityKeys` | Kind plus SHA-256 canonical-value digest | Identity kind, canonical value, owner user ID, creation timestamp. Server-only. |
| `sessions` | SHA-256 digest of session ID | Minimal user ID/account type, cookie settings, and expiry. Server-only; raw session IDs are not stored. |

Loan and fine title snapshots preserve what the member borrowed or owed if a
catalog title is later edited. References remain stable IDs, so screens can
still link to the current catalog record where appropriate.

## Queries and indexes

`firebase/firestore.indexes.json` declares member activity, librarian pending
closure queue, copy status, pending reservation ordering, reservation expiry,
member fine history, and unread notification indexes. Reservation ordering
uses creation time followed by document ID for deterministic tie breaking.
Update the index file whenever a new compound query is introduced.

## Transaction boundaries

Loan creation and copy checkout share one transaction. Member closure reports
move the loan to `PENDING_CLOSE` and the copy to `IN_TRANSIT` together.
Librarian review rejection restores `ACTIVE` / `ON_LOAN`; accepted loss closes
the loan, marks the copy lost, and records a fine together. Accepted returns
close the loan and apply one disposition. A `RESERVED` disposition reads the
oldest pending reservation inside the transaction, assigns the copy, sets a
15-day pickup expiry, and creates a linked notification. Pickup fulfillment,
fine payment/waiver, and reservation expiry each update their related records
atomically. Conflicts should be returned to the caller so a librarian can
refresh the work item. Notification delivery, when configured, must happen
after the transaction and use retry-safe delivery identifiers.

The expiry worker is invoked as a scheduled server-side command; it processes
at most 100 due records per pass and can be run again safely:

```sh
npm run expire-reservations
```

The production scheduler and hosting provider remain deployment decisions.
Before production, configure a schedule that invokes this command, Firestore
automated backups, and a documented restore rehearsal. Never use Firestore TTL
to expire reservations because TTL cannot release the corresponding copy in
the same transaction.

## Sessions

The API uses a project-owned `express-session` Store backed by the Firestore
`sessions` collection. Only authenticated `userId`, `accountType`, safe cookie
settings, and `expiresAt` are persisted. Session IDs are SHA-256 hashed before
use as document IDs. `SESSION_MAX_AGE_MS` defaults to seven days and cannot
exceed 30 days. The adapter rejects expired sessions on reads; Firestore TTL
removes expired documents later and is only storage cleanup. Logout uses the
store's `destroy` operation, while member deactivation removes all matching
session records. `SESSION_SECRET` must be at least 32 characters and must be
provided by a secret manager outside local development. Session documents are
server-only; do not expose them through browser APIs.

## Catalog and inventory API

The Express API is mounted at `/api/v1`. Catalog reads are public. Mutations
require a valid session for an active librarian; the server reloads the
account from Firestore on each mutation and does not trust roles sent by the
browser. The login route is supplied by the identity feature; until it is
connected, callers cannot obtain a librarian session through this API.

| Method and path | Access | Behavior |
| --- | --- | --- |
| `GET /api/v1/books?q=<prefix>&limit=20&cursor=<token>` | Public | Search by title prefix; returns `items` and a `page.nextCursor`. Omit `q` to browse all titles. Limit is 1–50. |
| `GET /api/v1/books/:isbn` | Public | Returns `{ book, copies, availability }`. |
| `GET /api/v1/books/:isbn/copies` | Public | Returns the current copies and statuses for a title. |
| `GET /api/v1/copies/:copyId` | Public | Reads one physical copy. |
| `POST /api/v1/books` | Active librarian | Creates a book using `isbn`, `title`, `author`, `publicationYear`, `publisher`, `category`, and `synopsis`. |
| `PATCH /api/v1/books/:isbn` | Active librarian | Partially updates editable catalog fields; ISBN and timestamps are server-managed. |
| `DELETE /api/v1/books/:isbn` | Active librarian | Deletes only when no copies or reservations reference the ISBN. |
| `POST /api/v1/books/:isbn/copies` | Active librarian | Creates a copy from `{ "shelfLocation": "..." }`; the server generates its ID and sets status to `AVAILABLE`. |
| `PATCH /api/v1/copies/:copyId` | Active librarian | Updates `{ "shelfLocation": "..." }`; ISBN and status cannot be changed here. |
| `DELETE /api/v1/copies/:copyId` | Active librarian | Deletes only when the current status is `AVAILABLE`, `DAMAGED`, or `LOST`. |

Successful responses are JSON with Firestore timestamps serialized as ISO
8601 strings; successful deletes return `204 No Content`. Errors use
`{ "error": { "code": "...", "message": "...", "fields": {} } }` where
`fields` is included for request validation errors. The API uses 400 for bad
input, 401 for missing/invalid sessions, 403 for inactive or unauthorized
actors, 404 for missing resources, and 409 for state conflicts. Unexpected
server errors return a generic 500 message without Firestore internals.
ISBN is the book document ID; creating a duplicate ISBN returns `409 Conflict`.

Book deletion checks copies and reservations in a transaction. Reservation
creation, copy creation, copy deletion, and book deletion coordinate through
the parent book transaction so concurrent references cannot leave a dangling
catalog relationship. Copy status changes belong to circulation workflows;
the generic inventory update route cannot move a copy into or out of loan,
reservation, transit, damaged, or lost states.

# LibConnect

LibConnect is a web-based library management application for members,
librarians, and librarian managers.

- **Members** search the catalog, borrow and reserve books, manage loans and
  renewals, pay fines, read notifications, update their profile, and ask the
  Libby assistant workflow questions.
- **Librarians** manage the catalog and physical copies, create loans, review
  return and loss reports, handle reservations and fines, message members,
  support member accounts, and use an advisory review assistant.
- **Managers** are librarians who can also activate, deactivate, and reset the
  passwords of other librarian accounts.

Built with React, TypeScript, Express, and Firestore.

## Try it

- **Live app:** <https://libconnect-78904.web.app/login>
- **Product website:** <https://cs3227-2610-mp3-libconnect.github.io/CS3227-2610-MP3/>

Test accounts for the live app:

| Account type | Sign in as | Email | Password |
| --- | --- | --- | --- |
| Manager librarian | Librarian | `manager@gmail.com` | `password` |
| Librarian | Librarian | `librarian@gmail.com` | `password` |
| Member | Member | `member@gmail.com` | `password` |

## Documentation

- [User Guide](docs/UserGuide.md): how to use every member, librarian, and
  manager feature.
- [Developer Guide](docs/DeveloperGuide.md): architecture, repository layout,
  API routes, state machines, security boundaries, the multi-agent workflow,
  and acknowledgements.
- [Reflections](docs/Reflections.md): our reflections on AI security,
  spec-driven development, and multi-agent software engineering.
- [Authentication and sessions](docs/authentication-and-sessions.md): local
  setup and authentication verification.
- [Deployment reference](docs/feature-details/deployment.md): production
  topology and deployment commands.

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/api/src/` | Express API |
| `apps/client/src/` | React client |
| `packages/shared/src/` | Shared domain types |
| `tests/` | Unit, route, client, security, browser, and emulator tests |
| `workflow/` | Agentic workflow: specs, plan, agent roles, templates, and per-task evidence |
| `logs/` | Chat summaries (`chat/`) and per-task execution logs (`tasks/`) |
| `docs/` | User Guide, Developer Guide, reflections, and the product website |

See [Repository layout](docs/DeveloperGuide.md#repository-layout) in the
Developer Guide for the full list.

## Run locally

Prerequisites: Node.js 24, the Firebase CLI, and a Java runtime for the
Firestore Emulator.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a `.env` file in the repository root with these variables:

   | Variable | Local value |
   | --- | --- |
   | `FIREBASE_PROJECT_ID` | `demo-libconnect` |
   | `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` |
   | `PORT` | `3000` |
   | `SESSION_SECRET` | a random string of at least 32 characters |
   | `CLIENT_ORIGIN` | `http://localhost:5173` |
   | `CLIENT_PORT` | `5173` |
   | `VITE_API_ORIGIN` | `http://localhost:3000` |
   | `SOCLAAS_API_KEY`, `SOCLAAS_BASE_URL` | optional; without them the AI assistants return a generic unavailable response |

   Never commit `.env`.

3. Start the Firestore Emulator in one terminal:

   ```sh
   npm run emulator
   ```

4. In a second terminal, optionally load sample data and create a manager
   account, then start the API and client:

   ```sh
   npm run seed                # sample books and records (emulator only)
   npm run bootstrap:manager   # interactive; creates one local manager
   npm run dev                 # API on :3000, client on :5173
   ```

5. Open <http://localhost:5173>.

## Verify

| Command | Purpose |
| --- | --- |
| `npm test` | Build, then run the unit, API, client, security, and browser tests |
| `npm run test:coverage` | Same suite with minimum coverage gates |
| `npm run lint` | TypeScript type-check |
| `npm run format` | Format source files with Prettier |
| `npm run format:check` | Check Prettier formatting and whitespace |
| `npm run test:*:emulator`, `npm run verify:*:emulator` | Firestore Emulator checks; see `package.json` |

## Deployment

The app is deployed by a team-owned GitHub Actions workflow
(`.github/workflows/deploy.yml`), triggered from the Actions tab, which runs the
same `npm run deploy:firebase` and `npm run deploy:gcloud` scripts to deploy the
client to Firebase Hosting and the API to Cloud Run. Those scripts can also be
run locally. Deployment needs production credentials and team approval; see the
[deployment reference](docs/feature-details/deployment.md).

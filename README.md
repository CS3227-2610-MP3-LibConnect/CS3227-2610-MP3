# CS3227-2610-MP3


## Local development

The local Firestore Emulator uses port `8081` and the demo project
`demo-libconnect`. The API listens on port `3000` by default. The Vite client
uses port `5173` and origin `http://localhost:5173`; it sends API requests to
`http://localhost:3000`.

Create a root `.env` file for local API and client settings. `.env` is ignored
by Git and must stay local; do not put real passwords, session IDs, or
production credentials in this file. For local emulator development, use
values like these:

```dotenv
NODE_ENV=development
PORT=3000
FIREBASE_PROJECT_ID=demo-libconnect
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
SESSION_SECRET=replace-with-a-local-value-at-least-32-characters-long
CLIENT_ORIGIN=http://localhost:5173
CLIENT_PORT=5173
VITE_API_ORIGIN=http://localhost:3000
```

Start each long-running service in its own terminal:

1. Firestore Emulator: `npm run emulator`
2. API server: `npm start`
3. Client: `npm run dev:client`

To optionally seed the emulator, run `npm run seed` after the emulator has
started. The seed command builds the project before running the seed script.
Keep the root `Overview.md` available when running or packaging the API: Libby's
answer generation and factual/relevance checks include its full contents as
approved project context. If the file is unavailable, assistant requests fail
safely while the rest of the API remains available.

### Verify authentication with the emulator

With the Firestore Emulator and API server running and the local `.env`
configured as above, run `npm run verify:auth:emulator` in another terminal.
The API server must be available at `http://localhost:3000`. The command builds
the project and checks
registration, JSON and native-form login, disabled-member versus generic
credential feedback, inactive-librarian feedback, session creation and
logout, Origin rejection, protected API access, and session revocation after
deactivation. The check creates temporary accounts in the emulator and does
not use production credentials.

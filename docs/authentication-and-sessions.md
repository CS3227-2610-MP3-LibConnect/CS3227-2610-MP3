# Authentication and Sessions: Local Run and Verification

## Start the application locally

Use three terminals from the repository root:

1. Start Firestore Emulator: `npm run emulator`.
2. Start the Express API: `npm start`.
3. Start the Vite client: `npm run dev:client`.

The local ports and origins are configured in the ignored `.env` file:

- API: `PORT=3000`, at `http://localhost:3000`.
- Client: `CLIENT_PORT=5173` and `CLIENT_ORIGIN=http://localhost:5173`.
- Client API base URL: `VITE_API_ORIGIN=http://localhost:3000`.
- API origin for server-side Origin protection: `API_ORIGIN=http://localhost:3000` locally; set this to the externally visible HTTPS API origin in production, such as `https://api.example.com`.

Open `http://localhost:5173`. The Express API owns sessions and authorization. Vite serves the client during development; it does not replace the API.

For registration and login without JavaScript, open `http://localhost:5173/login.html` or `/register.html`. These static forms submit URL-encoded requests to the configured API origin and return to static status pages after redirects. Librarian and member registration are separate forms so each submits the correct account type without client-side code.

## Verify the auth flow against the emulator

With the Firestore Emulator and API running, execute `npm run verify:auth:emulator` in another terminal. The script uses unique test accounts in the emulator and checks:

- Public health and signed-out session status.
- Rejection of a mutation from an unapproved `Origin`.
- Member registration without automatic sign-in.
- Login account-type checking and safe session restore/logout.
- Rejection of unauthenticated business API requests and access after login.
- Inactive librarian login denial and session revocation on member deactivation.

The script refuses to run when the Firestore Emulator host is unset or `NODE_ENV` is production. It changes only emulator records. It also submits native URL-encoded registration and login requests, checks the fixed redirects, confirms registration creates no session, and verifies login establishes one.

The normal `npm test` command builds the API/client and runs the focused auth middleware, route-contract, and client-rendering checks.

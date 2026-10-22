# Test layout

- `client/` contains browser-facing client and workflow tests.
- `member-api/` contains member route and API behavior tests.
- `member-storage/` contains member persistence and index tests.
- `shared/` contains authentication, origin protection, and other cross-feature checks.
- `emulator/` contains scripts that verify behavior against a local Firebase Emulator.

Run the regular suite with `npm test`. Emulator checks have dedicated `verify:*:emulator` scripts in `package.json`.

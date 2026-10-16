import { db } from './firebase.js';
import { LibraryWorkflows } from './workflows.js';
const startedAt = Date.now();
try {
    const result = await new LibraryWorkflows(db).expireReservations();
    console.info(JSON.stringify({ event: 'reservation_expiry_completed', ...result, elapsedMs: Date.now() - startedAt }));
}
catch (error) {
    // Never log record data, credentials, or session contents.
    console.error(JSON.stringify({ event: 'reservation_expiry_failed', errorType: error instanceof Error ? error.name : 'UnknownError', elapsedMs: Date.now() - startedAt }));
    process.exitCode = 1;
}

import { pathToFileURL } from 'node:url';
import { db } from './firebase.js';
import { LibraryWorkflows } from './workflows.js';
const workerDeadlineMs = 60_000;
const workerAttempts = 3;
const workerRetryDelaysMs = [100, 250];
export class WorkerDeadlineError extends Error {
    constructor() {
        super('Worker deadline exceeded.');
        this.name = 'WorkerDeadlineError';
    }
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
export function withDeadline(promise, timeoutMs) {
    let timeout;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new WorkerDeadlineError()), timeoutMs);
        }),
    ]).finally(() => {
        if (timeout)
            clearTimeout(timeout);
    });
}
export async function runWorker(createWorkflows = () => new LibraryWorkflows(db), deadlineMs = workerDeadlineMs) {
    const startedAt = Date.now();
    const deadlineAt = startedAt + deadlineMs;
    let lastError;
    for (let attempt = 1; attempt <= workerAttempts; attempt += 1) {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) {
            lastError = new WorkerDeadlineError();
            break;
        }
        try {
            const workflows = createWorkflows();
            const [expiry, overdue] = await withDeadline(Promise.all([
                workflows.expireReservations(undefined, 100),
                workflows.processOverdue(undefined, 100),
            ]), remainingMs);
            console.info(JSON.stringify({ event: 'circulation_worker_completed', attempt, expiry, overdue: { examined: overdue.examined, issued: overdue.issued, policyKey: overdue.policyKey }, elapsedMs: Date.now() - startedAt }));
            return;
        }
        catch (error) {
            lastError = error;
            if (error instanceof WorkerDeadlineError)
                break;
            if (attempt < workerAttempts) {
                const remainingAfterFailure = deadlineAt - Date.now();
                if (remainingAfterFailure <= 0) {
                    lastError = new WorkerDeadlineError();
                    break;
                }
                await delay(Math.min(workerRetryDelaysMs[attempt - 1], remainingAfterFailure));
            }
        }
    }
    throw lastError ?? new Error('Worker failed without an error.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await runWorker();
    }
    catch (error) {
        // Never log record data, credentials, raw idempotency keys, or session contents.
        console.error(JSON.stringify({ event: 'circulation_worker_failed', errorType: error instanceof Error ? error.name : 'UnknownError' }));
        process.exitCode = 1;
    }
}
//# sourceMappingURL=expire-reservations.js.map
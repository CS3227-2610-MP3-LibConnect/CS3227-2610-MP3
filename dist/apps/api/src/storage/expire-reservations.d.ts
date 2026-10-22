import { LibraryWorkflows } from './workflows.js';
export declare class WorkerDeadlineError extends Error {
    constructor();
}
export declare function withDeadline(promise: any, timeoutMs: any): Promise<any>;
export declare function runWorker(createWorkflows?: () => LibraryWorkflows, deadlineMs?: number): Promise<void>;

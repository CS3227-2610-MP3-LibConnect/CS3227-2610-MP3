import { type PendingReportContext } from '../ai/librarian-assistant-contracts.js';
export declare class LibrarianAssistantContext {
    private readonly db;
    constructor(db: any);
    loadPendingReports(loanIds: string[]): Promise<PendingReportContext[]>;
    private loadPendingReport;
}

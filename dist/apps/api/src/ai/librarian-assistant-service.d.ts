import { SoCLlmClient } from '../integrations/soclaas/client.js';
import { type NotificationDraftRequest, type NotificationDraftResponse, type PendingReportContext, type PendingReportsSummaryRequest, type SummaryResponse } from './librarian-assistant-contracts.js';
export declare class LibrarianAssistantError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
export declare class LibrarianAssistantService {
    private readonly context;
    private readonly llm;
    constructor(context: {
        loadPendingReports(loanIds: string[]): Promise<PendingReportContext[]>;
    }, llm: SoCLlmClient);
    summarize(input: PendingReportsSummaryRequest, actor: any): Promise<SummaryResponse>;
    draft(input: NotificationDraftRequest, actor: any): Promise<NotificationDraftResponse>;
}

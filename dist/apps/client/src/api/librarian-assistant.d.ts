export type AssistantReportType = 'RETURNED' | 'LOST';
export type AssistantPurpose = 'RETURN_FOLLOW_UP' | 'LOSS_FOLLOW_UP';
export type AssistantAction = 'VERIFY_RETURN' | 'VERIFY_LOSS' | 'CONTACT_MEMBER' | 'REVIEW_MANUALLY' | 'NO_ACTION';
export interface AssistantReportItem {
    loanId: string;
    memberId: string;
    copyId: string;
    isbn: string;
    bookTitle: string;
    dueDate: string;
    closureReportType: AssistantReportType;
    closureReportedDateTime: string;
    copyStatus: 'IN_TRANSIT';
    memberAccountStatus: 'ACTIVE' | 'INACTIVE';
    facts: string;
    action: AssistantAction;
}
export interface AssistantSummary {
    summary: string;
    items: AssistantReportItem[];
    uncertainty: string | null;
    advisory: true;
    requiresHumanApproval: true;
}
export interface AssistantDraft {
    message: string;
    rationale: string;
    warning: string | null;
    sourceType: 'PENDING_REPORT';
    sourceId: string;
    loanId: string;
    memberId: string;
    purpose: AssistantPurpose;
    notificationType: 'LIBRARIAN_MESSAGE';
    referenceType: null;
    referenceId: null;
    advisory: true;
    requiresHumanApproval: true;
}
export declare const librarianAssistantApi: {
    summarize(loanIds: string[]): Promise<AssistantSummary>;
    draft(sourceId: string, purpose: AssistantPurpose): Promise<AssistantDraft>;
};

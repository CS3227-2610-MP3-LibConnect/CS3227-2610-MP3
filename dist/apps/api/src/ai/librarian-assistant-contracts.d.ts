import { z } from 'zod';
export declare const assistantPurposeSchema: z.ZodEnum<{
    RETURN_FOLLOW_UP: "RETURN_FOLLOW_UP";
    LOSS_FOLLOW_UP: "LOSS_FOLLOW_UP";
}>;
export declare const assistantSourceTypeSchema: z.ZodLiteral<"PENDING_REPORT">;
export declare const pendingReportsSummaryRequestSchema: z.ZodObject<{
    loanIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const notificationDraftRequestSchema: z.ZodObject<{
    sourceType: z.ZodLiteral<"PENDING_REPORT">;
    sourceId: z.ZodString;
    purpose: z.ZodEnum<{
        RETURN_FOLLOW_UP: "RETURN_FOLLOW_UP";
        LOSS_FOLLOW_UP: "LOSS_FOLLOW_UP";
    }>;
}, z.core.$strict>;
export declare const summaryModelOutputSchema: z.ZodObject<{
    summary: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        loanId: z.ZodString;
        reportType: z.ZodEnum<{
            RETURNED: "RETURNED";
            LOST: "LOST";
        }>;
        facts: z.ZodString;
        action: z.ZodEnum<{
            VERIFY_RETURN: "VERIFY_RETURN";
            VERIFY_LOSS: "VERIFY_LOSS";
            CONTACT_MEMBER: "CONTACT_MEMBER";
            REVIEW_MANUALLY: "REVIEW_MANUALLY";
            NO_ACTION: "NO_ACTION";
        }>;
    }, z.core.$strict>>;
    uncertainty: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const draftModelOutputSchema: z.ZodObject<{
    message: z.ZodString;
    rationale: z.ZodString;
    warning: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type PendingReportsSummaryRequest = z.infer<typeof pendingReportsSummaryRequestSchema>;
export type NotificationDraftRequest = z.infer<typeof notificationDraftRequestSchema>;
export type SummaryModelOutput = z.infer<typeof summaryModelOutputSchema>;
export type DraftModelOutput = z.infer<typeof draftModelOutputSchema>;
export type PendingReportContext = {
    loanId: string;
    memberId: string;
    copyId: string;
    isbn: string;
    bookTitle: string;
    dueDate: string;
    closureReportType: 'RETURNED' | 'LOST';
    closureReportedDateTime: string;
    copyStatus: 'IN_TRANSIT';
    memberAccountStatus: 'ACTIVE' | 'INACTIVE';
};
export type SummaryResponse = {
    summary: string;
    items: Array<PendingReportContext & {
        facts: string;
        action: SummaryModelOutput['items'][number]['action'];
    }>;
    uncertainty: string | null;
    advisory: true;
    requiresHumanApproval: true;
};
export type NotificationDraftResponse = {
    message: string;
    rationale: string;
    warning: string | null;
    sourceType: 'PENDING_REPORT';
    sourceId: string;
    loanId: string;
    memberId: string;
    purpose: NotificationDraftRequest['purpose'];
    notificationType: 'LIBRARIAN_MESSAGE';
    referenceType: null;
    referenceId: null;
    advisory: true;
    requiresHumanApproval: true;
};
export declare function toIso(value: unknown): string;
export declare function assistantPromptText(value: unknown): string;

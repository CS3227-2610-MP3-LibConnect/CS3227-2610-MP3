import { z } from 'zod';
export declare const loanIdSchema: z.ZodString;
export declare const createLoanRequestSchema: z.ZodObject<{
    memberId: z.ZodString;
    copyId: z.ZodString;
}, z.core.$strict>;
export declare const closureReportRequestSchema: z.ZodObject<{
    reportType: z.ZodEnum<{
        RETURNED: "RETURNED";
        LOST: "LOST";
    }>;
}, z.core.$strict>;
export declare const pendingCloseQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const returnPreviewParamsSchema: z.ZodObject<{
    loanId: z.ZodString;
}, z.core.$strict>;
export declare const reviewRequestSchema: z.ZodObject<{
    decision: z.ZodEnum<{
        CONFIRM: "CONFIRM";
        REJECT: "REJECT";
    }>;
    disposition: z.ZodOptional<z.ZodEnum<{
        AVAILABLE: "AVAILABLE";
        DAMAGED: "DAMAGED";
        RESERVED: "RESERVED";
    }>>;
}, z.core.$strict>;
export declare function safeLoan(loan: any): unknown;
export declare function safeCopy(copy: any): unknown;
export declare function safeReservation(reservation: any): unknown;
export declare function safeFine(fine: any): unknown;
export declare function safeNotification(notification: any): unknown;
export declare function safeTransitionSummary(result: any): {
    notification?: unknown;
    fine?: unknown;
    reservation?: unknown;
    loan: unknown;
    copy: unknown;
};

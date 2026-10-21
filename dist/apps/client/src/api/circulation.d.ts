export type ClosureReportType = 'RETURNED' | 'LOST';
export type ReturnDisposition = 'AVAILABLE' | 'DAMAGED' | 'RESERVED';
export interface LoanSummary {
    loanId: string;
    memberId: string;
    copyId: string;
    isbn: string;
    bookTitle: string;
    borrowDateTime: string;
    dueDate: string;
    returnDateTime: string | null;
    closureReportType: ClosureReportType | null;
    closureReportedDateTime: string | null;
    closureReviewedDateTime: string | null;
    closureReviewDecision: 'CONFIRMED' | 'REJECTED' | null;
    status: string;
    isRenewed: boolean;
}
export interface CirculationCopy {
    copyId: string;
    isbn: string;
    shelfLocation: string;
    status: string;
    reservationId: string | null;
}
export interface ReservationSummary {
    reservationId: string;
    memberId: string;
    isbn: string;
    copyId: string | null;
    reservationDateTime: string;
    expiryDate: string | null;
    status: string;
}
export interface PendingCloseItem {
    loan: LoanSummary;
    copy: CirculationCopy;
}
export interface ReturnPreview {
    loan: LoanSummary;
    copy: CirculationCopy;
    earliestReservation: ReservationSummary | null;
    allowedDispositions: ReturnDisposition[];
}
export interface TransitionSummary {
    loan: LoanSummary;
    copy: CirculationCopy;
    reservation?: ReservationSummary;
    fine?: {
        fineId: string;
        loanId: string;
        amountMinorUnits: number;
        currency: string;
        status: string;
    };
    notification?: {
        notificationId: string;
        notificationType: string;
        referenceId: string | null;
    };
}
export declare const circulationApi: {
    createLoan(memberId: string, copyId: string): Promise<TransitionSummary>;
    pendingClose(limit?: number, cursor?: string): Promise<{
        items: PendingCloseItem[];
        page: {
            limit: number;
            nextCursor: string | null;
        };
    }>;
    returnPreview(loanId: string): Promise<ReturnPreview>;
    review(loanId: string, decision: "CONFIRM" | "REJECT", disposition?: ReturnDisposition): Promise<TransitionSummary>;
};

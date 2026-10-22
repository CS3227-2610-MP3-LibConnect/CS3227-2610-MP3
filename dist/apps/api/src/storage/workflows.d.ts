import { Timestamp } from 'firebase-admin/firestore';
export declare class LibraryWorkflows {
    db: any;
    constructor(db: any);
    createLoan(input: any, actor: any): Promise<any>;
    reportClosure(loanId: any, reportType: any, actor: any): Promise<void>;
    reviewClosure(loanId: any, decision: any, returnDisposition: any, actor: any): Promise<any>;
    listPendingClose(options: any, actor: any): Promise<{
        items: any[];
        nextCursor: {
            lastBorrowDateTime: any;
            lastLoanId: any;
        };
    }>;
    returnPreview(loanId: any, actor: any): Promise<{
        loan: any;
        copy: any;
        earliestReservation: any;
        allowedDispositions: string[];
    }>;
    processReturn(loanId: any, disposition: any, actor: any): Promise<any>;
    payFine(fineId: any, actor: any): Promise<void>;
    listReservations(options: any, actor: any): Promise<{
        items: any;
        nextCursor: {
            filterKey: string;
            lastReservationDateTime: any;
            lastReservationId: any;
        };
    }>;
    getLibrarianReservation(reservationId: any, actor: any): Promise<any>;
    listFines(options: any, actor: any): Promise<{
        items: any;
        nextCursor: {
            filterKey: string;
            lastIssuedDateTime: any;
            lastFineId: any;
        };
    }>;
    getLibrarianFine(fineId: any, actor: any): Promise<any>;
    waiveFine(fineId: any, actor: any): Promise<any>;
    sendLibrarianMessage(input: any, actor: any, idempotencyKey: any): Promise<any>;
    processOverdue(now?: Timestamp, limit?: number): Promise<{
        examined: any;
        issued: number;
        policyKey: string;
    }>;
    expireReservations(now?: Timestamp, limit?: number): Promise<{
        examined: any;
        expired: number;
    }>;
}
export declare function validateNotificationReference(db: any, input: any): Promise<void>;

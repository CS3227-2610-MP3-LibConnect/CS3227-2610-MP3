import { Timestamp } from 'firebase-admin/firestore';
export declare class LibraryWorkflows {
    db: any;
    constructor(db: any);
    memberLoans(actor: any): Promise<any>;
    renewMemberLoan(loanId: any, actor: any): Promise<any>;
    memberReservation(isbn: any, actor: any): Promise<{
        reservationId: string;
        memberId: string;
        isbn: string;
        reservationDateTime: Timestamp;
        status: "PENDING" | "FULFILLED" | "CANCELLED" | "EXPIRED";
        copyId?: string;
        expiryDate?: Timestamp;
        updatedAt?: Timestamp;
    }>;
    createMemberReservation(isbn: any, actor: any): Promise<any>;
    cancelMemberReservation(reservationId: any, actor: any): Promise<any>;
    memberBorrowCapacity(actor: any): Promise<{
        activeLoanCount: any;
        remainingSlots: number;
    }>;
    checkMemberBorrowCopy(copyId: any, actor: any): Promise<{
        copy: any;
        book: any;
    }>;
    confirmMemberBorrow(copyIds: any, actor: any): Promise<any[]>;
    createLoan(input: any, actor: any): Promise<any>;
    reportClosure(loanId: any, reportType: any, actor: any): Promise<void>;
    reviewClosure(loanId: any, decision: any, returnDisposition: any, actor: any, lossFineSgd: any): Promise<void>;
    returnPreview(loanId: any, actor: any): Promise<{
        loanId: any;
        earliestReservation: any;
        dispositions: string[];
    }>;
    processReturn(loanId: any, disposition: any, actor: any): Promise<void>;
    applyReturnDisposition(tx: any, loanRef: any, loan: any, copyRef: any, disposition: any, now: any, knownCopy: any): Promise<void>;
    payFine(fineId: any, actor: any): Promise<void>;
    waiveFine(fineId: any, actor: any): Promise<void>;
    expireReservations(now?: Timestamp, limit?: number): Promise<{
        examined: any;
        expired: number;
    }>;
}
export declare function validateNotificationReference(db: any, input: any): Promise<void>;

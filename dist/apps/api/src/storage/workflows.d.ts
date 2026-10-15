import { Timestamp, type Firestore } from 'firebase-admin/firestore';
type Actor = {
    userId: string;
    memberId?: string;
    accountType: 'MEMBER' | 'LIBRARIAN';
    accountStatus: 'ACTIVE' | 'INACTIVE';
    isManager?: boolean;
};
export declare class LibraryWorkflows {
    private readonly db;
    constructor(db: Firestore);
    createLoan(input: {
        memberId: string;
        copyId: string;
        loanId?: string;
    }, actor: Actor): Promise<string>;
    reportClosure(loanId: string, reportType: 'RETURNED' | 'LOST', actor: Actor): Promise<void>;
    reviewClosure(loanId: string, decision: 'CONFIRM' | 'REJECT', returnDisposition: 'AVAILABLE' | 'DAMAGED' | 'RESERVED', actor: Actor, lossFineSgd?: string): Promise<void>;
    returnPreview(loanId: string, actor: Actor): Promise<{
        loanId: string;
        earliestReservation: {
            reservationId: string;
        } | null;
        dispositions: string[];
    }>;
    processReturn(loanId: string, disposition: 'AVAILABLE' | 'DAMAGED' | 'RESERVED', actor: Actor): Promise<void>;
    private applyReturnDisposition;
    payFine(fineId: string, actor: Actor): Promise<void>;
    waiveFine(fineId: string, actor: Actor): Promise<void>;
    expireReservations(now?: Timestamp, limit?: number): Promise<{
        examined: number;
        expired: number;
    }>;
}
export declare function validateNotificationReference(db: Firestore, input: {
    recipientUserId: string;
    notificationType: string;
    referenceType: 'LOAN' | 'RESERVATION' | 'FINE' | null;
    referenceId: string | null;
}): Promise<void>;
export {};

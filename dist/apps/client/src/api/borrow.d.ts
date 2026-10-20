export interface BorrowCapacity {
    activeLoanCount: number;
    remainingSlots: number;
}
export interface BorrowCopyDetails {
    copy: {
        copyId: string;
        isbn: string;
        shelfLocation: string;
        status: string;
    };
    book: {
        isbn: string;
        title: string;
        author: string | string[];
        category: string;
    };
}
export interface BorrowOutcome {
    copyId: string;
    success: boolean;
    reason?: string;
    loan?: unknown;
}
export interface MemberLoan {
    loanId: string;
    bookTitle: string;
    dueDate: string;
    status: string;
    isRenewed: boolean;
    closureReportType?: 'RETURNED' | 'LOST';
}
export declare const borrowApi: {
    listLoans(): Promise<MemberLoan[]>;
    renewLoan(loanId: string): Promise<MemberLoan>;
    reportClosure(loanId: string, reportType: "RETURNED" | "LOST"): Promise<{
        success: boolean;
    }>;
    addCopy(copyId: string): Promise<BorrowCopyDetails>;
    confirm(copyIds: string[]): Promise<{
        outcomes: BorrowOutcome[];
    }>;
    capacity(): Promise<BorrowCapacity>;
};

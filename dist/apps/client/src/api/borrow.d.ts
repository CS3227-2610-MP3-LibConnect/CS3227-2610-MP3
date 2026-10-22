export interface BorrowCapacity {
    openLoanCount: number;
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
export interface BorrowReceipt {
    loanId: string;
    copyId: string;
    bookTitle: string;
    status: 'ACTIVE';
    isRenewed: false;
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
        loans: BorrowReceipt[];
    }>;
    capacity(): Promise<BorrowCapacity>;
};

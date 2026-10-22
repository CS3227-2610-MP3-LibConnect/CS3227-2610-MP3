export type FineStatus = 'OUTSTANDING' | 'PAID' | 'WAIVED';
export type FineView = 'outstanding' | 'history';
export interface MemberFine {
    fineId: string;
    loanId: string;
    memberId: string;
    bookTitle: string;
    amountMinorUnits: number;
    currency: 'SGD';
    reason: string;
    status: 'OUTSTANDING' | 'PAID' | 'WAIVED';
    issuedDateTime: string;
    paidDateTime: string | null;
    waivedDateTime: string | null;
}
export interface MemberFinePage {
    items: MemberFine[];
    page: {
        limit: number;
        nextCursor: string | null;
    };
}
export declare const fineApi: {
    listFines(view: FineView, cursor?: string, limit?: number): Promise<MemberFinePage>;
    payFine(fineId: string): Promise<{
        success: boolean;
    }>;
};

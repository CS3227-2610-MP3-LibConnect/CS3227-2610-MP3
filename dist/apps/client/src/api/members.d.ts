export interface MemberAccount {
    userId: string;
    memberId: string;
    name: string;
    email: string;
    accountStatus: 'ACTIVE' | 'INACTIVE';
    registrationDateTime: string;
}
export interface MemberPage {
    items: MemberAccount[];
    page: {
        limit: number;
        nextCursor: string | null;
    };
}
export declare const memberAccountsApi: {
    list(options?: {
        status?: MemberAccount["accountStatus"];
        limit?: number;
        cursor?: string;
    }): Promise<MemberPage>;
    get(userId: string): Promise<{
        member: MemberAccount;
    }>;
    updateStatus(userId: string, status: MemberAccount["accountStatus"]): Promise<{
        member: MemberAccount;
    }>;
};

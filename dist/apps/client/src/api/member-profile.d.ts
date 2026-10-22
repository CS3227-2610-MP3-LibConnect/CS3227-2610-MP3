export interface MemberProfileSummary {
    userId: string;
    name: string;
    email: string;
    accountType: 'MEMBER';
    accountStatus: 'ACTIVE' | 'INACTIVE';
    memberId?: string;
}
export interface MemberProfileResponse {
    user: MemberProfileSummary;
}
export interface ChangePasswordInput {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}
export declare const memberProfileApi: {
    get(): Promise<MemberProfileResponse>;
    updateName(name: string): Promise<MemberProfileResponse>;
    updateEmail(email: string): Promise<MemberProfileResponse>;
    changePassword(input: ChangePasswordInput): Promise<MemberProfileResponse>;
};

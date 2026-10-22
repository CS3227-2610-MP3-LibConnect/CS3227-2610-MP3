import { type MemberAccount } from '../api/members.js';
export declare function nextMemberStatus(status: MemberAccount['accountStatus']): MemberAccount['accountStatus'];
export declare function memberStatusChangeDetails(member: Pick<MemberAccount, 'name' | 'accountStatus'>): {
    nextStatus: "ACTIVE" | "INACTIVE";
    confirmationMessage: string;
    successMessage: string;
};
export declare function LibrarianMemberSupportPage(): import("react").JSX.Element;

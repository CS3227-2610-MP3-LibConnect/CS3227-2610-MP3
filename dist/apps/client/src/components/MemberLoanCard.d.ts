import type { MemberLoan } from '../api/borrow.js';
export declare function MemberLoanCard({ loan, now, onReport, onRenew, renewing }: {
    loan: MemberLoan;
    now?: number;
    onReport?: (loan: MemberLoan) => void;
    onRenew?: (loan: MemberLoan) => void;
    renewing?: boolean;
}): import("react").JSX.Element;

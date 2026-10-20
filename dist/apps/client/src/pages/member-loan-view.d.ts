import type { MemberLoan } from '../api/borrow.js';
export type LoanView = 'active' | 'past';
export declare function loansForView(loans: MemberLoan[], view: LoanView): MemberLoan[];
export declare function isOverdueActiveLoan(loan: MemberLoan, now?: number): boolean;
export declare function loanCardTreatment(loan: MemberLoan, now?: number): {
    overdue: boolean;
    showDisabledReturn: boolean;
};
export declare function formatLoanDueDate(dueDate: string): string;

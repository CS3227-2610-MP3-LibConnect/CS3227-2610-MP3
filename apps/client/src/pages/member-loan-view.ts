import type { MemberLoan } from '../api/borrow.js';

export type LoanView = 'active' | 'past';

export function loansForView(loans: MemberLoan[], view: LoanView): MemberLoan[] {
  return loans.filter((loan) => (loan.status === 'ACTIVE') === (view === 'active'));
}

export function isOverdueActiveLoan(loan: MemberLoan, now = Date.now()): boolean {
  const dueTime = Date.parse(loan.dueDate);
  return loan.status === 'ACTIVE' && Number.isFinite(dueTime) && dueTime < now;
}

export function loanCardTreatment(loan: MemberLoan, now = Date.now()): { overdue: boolean; showDisabledReturn: boolean } {
  return { overdue: isOverdueActiveLoan(loan, now), showDisabledReturn: loan.status === 'ACTIVE' };
}

export function formatLoanDueDate(dueDate: string): string {
  const timestamp = Date.parse(dueDate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : 'Date unavailable';
}

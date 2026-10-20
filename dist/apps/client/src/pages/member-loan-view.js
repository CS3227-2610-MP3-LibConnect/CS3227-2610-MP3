export function loansForView(loans, view) {
    return loans.filter((loan) => (loan.status === 'ACTIVE') === (view === 'active'));
}
export function isOverdueActiveLoan(loan, now = Date.now()) {
    const dueTime = Date.parse(loan.dueDate);
    return loan.status === 'ACTIVE' && Number.isFinite(dueTime) && dueTime < now;
}
export function loanCardTreatment(loan, now = Date.now()) {
    return { overdue: isOverdueActiveLoan(loan, now), showDisabledReturn: loan.status === 'ACTIVE' };
}
export function formatLoanDueDate(dueDate) {
    const timestamp = Date.parse(dueDate);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : 'Date unavailable';
}
//# sourceMappingURL=member-loan-view.js.map
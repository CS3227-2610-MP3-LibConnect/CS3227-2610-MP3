import { apiRequest } from './base.js';
function normalizeDueDate(value) {
    if (typeof value === 'string')
        return value;
    if (value && typeof value === 'object') {
        const timestamp = value;
        const seconds = timestamp.seconds ?? timestamp._seconds;
        const nanoseconds = timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0;
        if (typeof seconds === 'number' && Number.isFinite(seconds) && typeof nanoseconds === 'number' && Number.isFinite(nanoseconds)) {
            return new Date(seconds * 1000 + nanoseconds / 1_000_000).toISOString();
        }
    }
    throw new Error('Loan due date is invalid.');
}
function mapMemberLoan(value) {
    if (!value || typeof value !== 'object')
        throw new Error('Loan record is invalid.');
    const loan = value;
    if (typeof loan.loanId !== 'string' || typeof loan.bookTitle !== 'string' || typeof loan.status !== 'string' || typeof loan.isRenewed !== 'boolean') {
        throw new Error('Loan record is invalid.');
    }
    const closureReportType = loan.closureReportType === 'RETURNED' || loan.closureReportType === 'LOST' ? loan.closureReportType : undefined;
    return { loanId: loan.loanId, bookTitle: loan.bookTitle, dueDate: normalizeDueDate(loan.dueDate), status: loan.status, isRenewed: loan.isRenewed, closureReportType };
}
export const borrowApi = {
    async listLoans() {
        const result = await apiRequest('/member/loans');
        return result.loans.map(mapMemberLoan);
    },
    async renewLoan(loanId) {
        const result = await apiRequest(`/member/loans/${encodeURIComponent(loanId)}/renew`, {
            method: 'POST',
        });
        return mapMemberLoan(result.loan);
    },
    reportClosure(loanId, reportType) {
        return apiRequest(`/member/loans/${encodeURIComponent(loanId)}/closure-report`, {
            method: 'POST', body: JSON.stringify({ reportType }),
        });
    },
    addCopy(copyId) {
        return apiRequest('/member/borrow-items', {
            method: 'POST',
            body: JSON.stringify({ copyId }),
        });
    },
    confirm(copyIds) {
        return apiRequest('/member/loans', {
            method: 'POST',
            body: JSON.stringify({ copyIds }),
        });
    },
    capacity() {
        return apiRequest('/member/borrow-capacity');
    },
};
//# sourceMappingURL=borrow.js.map
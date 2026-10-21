import { apiRequest } from './base.js';
export const circulationApi = {
    createLoan(memberId, copyId) {
        return apiRequest('/librarian/loans', { method: 'POST', body: JSON.stringify({ memberId, copyId }) });
    },
    pendingClose(limit = 20, cursor) {
        const query = new URLSearchParams({ limit: String(limit) });
        if (cursor)
            query.set('cursor', cursor);
        return apiRequest(`/librarian/loans/pending-close?${query.toString()}`);
    },
    returnPreview(loanId) {
        return apiRequest(`/librarian/loans/${encodeURIComponent(loanId)}/return-preview`);
    },
    review(loanId, decision, disposition) {
        return apiRequest(`/librarian/loans/${encodeURIComponent(loanId)}/review`, {
            method: 'POST', body: JSON.stringify({ decision, ...(disposition ? { disposition } : {}) }),
        });
    },
};
//# sourceMappingURL=circulation.js.map
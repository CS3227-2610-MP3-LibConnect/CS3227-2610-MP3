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
export const reservationsFinesApi = {
    reservations(filters = {}) {
        const query = new URLSearchParams({ limit: String(filters.limit ?? 20) });
        if (filters.isbn)
            query.set('isbn', filters.isbn);
        if (filters.status)
            query.set('status', filters.status);
        if (filters.cursor)
            query.set('cursor', filters.cursor);
        return apiRequest(`/librarian/reservations?${query.toString()}`);
    },
    fines(filters = {}) {
        const query = new URLSearchParams({ limit: String(filters.limit ?? 20) });
        if (filters.status)
            query.set('status', filters.status);
        if (filters.memberId)
            query.set('memberId', filters.memberId);
        if (filters.loanId)
            query.set('loanId', filters.loanId);
        if (filters.cursor)
            query.set('cursor', filters.cursor);
        return apiRequest(`/librarian/fines?${query.toString()}`);
    },
    waiveFine(fineId) {
        return apiRequest(`/librarian/fines/${encodeURIComponent(fineId)}/waive`, { method: 'POST', body: '{}' });
    },
    sendMessage(memberId, message, idempotencyKey) {
        return apiRequest('/librarian/notifications', {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify({ memberId, message }),
        });
    },
};
//# sourceMappingURL=circulation.js.map
import { apiRequest } from './base.js';
export const fineApi = {
    listFines(view, cursor, limit = 20) {
        const query = new URLSearchParams({ view, limit: String(limit) });
        if (cursor)
            query.set('cursor', cursor);
        return apiRequest(`/member/fines?${query.toString()}`);
    },
    payFine(fineId) {
        return apiRequest(`/member/fines/${encodeURIComponent(fineId)}/pay`, { method: 'POST' });
    },
};
//# sourceMappingURL=fines.js.map
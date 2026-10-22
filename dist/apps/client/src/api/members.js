import { apiRequest } from './base.js';
export const memberAccountsApi = {
    list(options = {}) {
        const params = new URLSearchParams();
        if (options.status)
            params.set('status', options.status);
        if (options.limit !== undefined)
            params.set('limit', String(options.limit));
        if (options.cursor)
            params.set('cursor', options.cursor);
        const suffix = params.toString() ? `?${params.toString()}` : '';
        return apiRequest(`/librarian/members${suffix}`);
    },
    get(userId) {
        return apiRequest(`/librarian/members/${encodeURIComponent(userId)}`);
    },
    updateStatus(userId, status) {
        return apiRequest(`/librarian/members/${encodeURIComponent(userId)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    },
};
//# sourceMappingURL=members.js.map
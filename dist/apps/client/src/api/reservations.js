import { apiRequest } from './base.js';
function queryString(view, options) {
    const params = new URLSearchParams({ view });
    if (options.limit !== undefined)
        params.set('limit', String(options.limit));
    if (options.cursor !== undefined)
        params.set('cursor', options.cursor);
    return params.toString();
}
export const reservationApi = {
    list(view, options = {}) {
        return apiRequest(`/member/reservations?${queryString(view, options)}`);
    },
    getByIsbn(isbn) {
        return apiRequest(`/member/reservations/by-isbn/${encodeURIComponent(isbn)}`);
    },
    create(isbn) {
        return apiRequest('/member/reservations', {
            method: 'POST',
            body: JSON.stringify({ isbn }),
        });
    },
    cancel(reservationId) {
        return apiRequest(`/member/reservations/${encodeURIComponent(reservationId)}`, { method: 'DELETE' });
    },
};
//# sourceMappingURL=reservations.js.map
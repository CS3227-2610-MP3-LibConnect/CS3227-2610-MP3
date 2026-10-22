import { apiRequest } from './base.js';
function queryString(options) {
    const params = new URLSearchParams();
    if (options.limit !== undefined)
        params.set('limit', String(options.limit));
    if (options.cursor !== undefined)
        params.set('cursor', options.cursor);
    return params.toString();
}
export const notificationsApi = {
    getPreview() {
        return apiRequest('/member/notifications/preview');
    },
    list(options = {}) {
        const query = queryString(options);
        return apiRequest(`/member/notifications${query ? `?${query}` : ''}`);
    },
    get(notificationId) {
        return apiRequest(`/member/notifications/${encodeURIComponent(notificationId)}`);
    },
    markRead(notificationId) {
        return apiRequest(`/member/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });
    },
};
//# sourceMappingURL=notifications.js.map
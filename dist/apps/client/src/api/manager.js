import { apiRequest, apiUrl } from './base.js';
export const managerApi = {
    listLibrarians() {
        return apiRequest('/manager/librarians');
    },
    updateLibrarianStatus(userId, status) {
        return apiRequest(`/manager/librarians/${encodeURIComponent(userId)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    },
    resetLibrarianPassword(userId, password, confirmPassword) {
        return apiRequest(`/manager/librarians/${encodeURIComponent(userId)}/password`, {
            method: 'POST',
            body: JSON.stringify({ password, confirmPassword }),
        });
    },
    resetLibrarianPasswordFormUrl(userId) {
        return apiUrl(`/manager/librarians/${encodeURIComponent(userId)}/password`);
    },
};
//# sourceMappingURL=manager.js.map
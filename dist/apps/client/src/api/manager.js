import { apiRequest } from './base.js';
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
};
//# sourceMappingURL=manager.js.map
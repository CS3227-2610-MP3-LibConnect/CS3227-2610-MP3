import { apiRequest } from './base.js';
export const borrowApi = {
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
import { apiRequest } from './base.js';
export const memberProfileApi = {
    get() {
        return apiRequest('/member/profile');
    },
    updateName(name) {
        return apiRequest('/member/profile/name', {
            method: 'PATCH',
            body: JSON.stringify({ name }),
        });
    },
    updateEmail(email) {
        return apiRequest('/member/profile/email', {
            method: 'PATCH',
            body: JSON.stringify({ email }),
        });
    },
    changePassword(input) {
        return apiRequest('/member/profile/password', {
            method: 'PATCH',
            body: JSON.stringify(input),
        });
    },
};
//# sourceMappingURL=member-profile.js.map
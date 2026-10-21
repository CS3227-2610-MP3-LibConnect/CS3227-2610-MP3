import { apiRequest } from './base.js';
export const assistantApi = {
    chat(input) {
        const question = input.question;
        const history = (input.history ?? []).slice(-10).map(({ role, content }) => ({ role, content }));
        return apiRequest('/member/assistant/chat', {
            method: 'POST',
            body: JSON.stringify({ question, history }),
        });
    },
};
//# sourceMappingURL=assistant.js.map
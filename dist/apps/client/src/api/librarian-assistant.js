import { apiRequest } from './base.js';
export const librarianAssistantApi = {
    summarize(loanIds) {
        return apiRequest('/librarian/assistant/pending-reports/summary', { method: 'POST', body: JSON.stringify({ loanIds }) });
    },
    draft(sourceId, purpose) {
        return apiRequest('/librarian/assistant/notification-draft', { method: 'POST', body: JSON.stringify({ sourceType: 'PENDING_REPORT', sourceId, purpose }) });
    },
};
//# sourceMappingURL=librarian-assistant.js.map
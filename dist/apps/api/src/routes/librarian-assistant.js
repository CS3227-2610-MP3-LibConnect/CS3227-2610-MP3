import { Router } from 'express';
import { requireActiveActor, requireLibrarian } from '../http/auth.js';
import { parseRequest } from '../http/errors.js';
import { notificationDraftRequestSchema, pendingReportsSummaryRequestSchema } from '../ai/librarian-assistant-contracts.js';
export function createLibrarianAssistantRouter(service, users) {
    const router = Router();
    const activeActor = requireActiveActor(users);
    const authenticatedLibrarian = [activeActor, requireLibrarian];
    router.post('/librarian/assistant/pending-reports/summary', ...authenticatedLibrarian, async (request, response) => {
        const input = parseRequest(pendingReportsSummaryRequestSchema, request.body);
        response.json(await service.summarize(input, request.actor));
    });
    router.post('/librarian/assistant/notification-draft', ...authenticatedLibrarian, async (request, response) => {
        const input = parseRequest(notificationDraftRequestSchema, request.body);
        response.json(await service.draft(input, request.actor));
    });
    return router;
}
//# sourceMappingURL=librarian-assistant.js.map
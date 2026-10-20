import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireActiveActor, requireManager } from '../http/auth.js';
import { parseRequest } from '../http/errors.js';
const userIdSchema = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'), 'User ID cannot contain a slash.');
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict();
function toJson(value) {
    if (value instanceof Timestamp)
        return value.toDate().toISOString();
    if (Array.isArray(value))
        return value.map(toJson);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
    }
    return value;
}
function safeLibrarianAccount(user) {
    return toJson({
        userId: user.userId,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        accountType: user.accountType,
        accountStatus: user.accountStatus,
        isManager: user.isManager === true,
        registrationDateTime: user.registrationDateTime,
    });
}
export function createManagerRouter(accounts, users) {
    const router = Router();
    const activeActor = requireActiveActor(users);
    router.get('/librarians', activeActor, requireManager, async (_request, response) => {
        const librarians = await accounts.listLibrarians(_request.actor);
        response.json({ librarians: librarians.map(safeLibrarianAccount) });
    });
    router.patch('/librarians/:userId/status', activeActor, requireManager, async (request, response) => {
        const userId = parseRequest(userIdSchema, request.params.userId);
        const { status } = parseRequest(statusSchema, request.body);
        const librarian = await accounts.updateLibrarianStatus(userId, status, request.actor);
        response.json({ librarian: safeLibrarianAccount(librarian) });
    });
    return router;
}
//# sourceMappingURL=manager.js.map
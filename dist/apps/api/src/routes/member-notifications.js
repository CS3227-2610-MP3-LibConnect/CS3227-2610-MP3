import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireActiveActor } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
const historyQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).max(1024).optional(),
}).strict();
const cursorSchema = z.object({
    recipientUserId: z.string().min(1),
    createdAtSeconds: z.number().int().safe(),
    createdAtNanoseconds: z.number().int().min(0).max(999_999_999),
    notificationId: z.string().min(1).max(128).refine((value) => !value.includes('/')),
}).strict();
const notificationIdSchema = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'));
function requireMember(request, _response, next) {
    if (!request.actor || request.actor.accountType !== 'MEMBER')
        return next(new ApiError(403, 'FORBIDDEN', 'Active member access is required.'));
    return next();
}
function serialize(value) {
    if (value instanceof Timestamp)
        return value.toDate().toISOString();
    if (Array.isArray(value))
        return value.map(serialize);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
    return value;
}
function parseCursor(encoded, userId) {
    if (encoded === undefined)
        return undefined;
    try {
        if (!/^[A-Za-z0-9_-]+$/.test(encoded))
            throw new Error();
        const parsed = cursorSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
        if (parsed.recipientUserId !== userId)
            throw new Error();
        return parsed;
    }
    catch {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', { cursor: 'Use a valid cursor returned for this member.' });
    }
}
function encodeCursor(cursor) {
    return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null;
}
export function createMemberNotificationsRouter(repository, users) {
    const router = Router();
    const activeMember = [requireActiveActor(users), requireMember];
    router.get('/preview', ...activeMember, async (request, response) => {
        const items = await repository.notificationPreview(request.actor);
        response.json(serialize({ items }));
    });
    router.get('/', ...activeMember, async (request, response) => {
        const { limit, cursor: encodedCursor } = parseRequest(historyQuerySchema, request.query);
        const cursor = parseCursor(encodedCursor, request.actor.userId);
        const page = await repository.notificationHistory(request.actor, limit, cursor);
        response.json(serialize({ items: page.items, page: { limit, nextCursor: encodeCursor(page.nextCursor) } }));
    });
    router.get('/:notificationId', ...activeMember, async (request, response) => {
        const notificationId = parseRequest(notificationIdSchema, request.params.notificationId);
        response.json(serialize({ notification: await repository.getNotification(notificationId, request.actor) }));
    });
    router.patch('/:notificationId/read', ...activeMember, async (request, response) => {
        const notificationId = parseRequest(notificationIdSchema, request.params.notificationId);
        const notification = await repository.getNotification(notificationId, request.actor);
        if (!notification.read)
            await repository.markNotificationRead(notificationId, request.actor);
        response.status(204).end();
    });
    return router;
}
//# sourceMappingURL=member-notifications.js.map
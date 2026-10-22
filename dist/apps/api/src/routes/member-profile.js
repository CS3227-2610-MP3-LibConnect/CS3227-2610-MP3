import { Router } from 'express';
import { z } from 'zod';
import { requireActiveActor } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
const nameSchema = z.object({
    name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
}).strict();
const emailSchema = z.object({
    email: z.string().trim().email('Enter a valid email address.').max(320, 'Email address must be 320 characters or fewer.'),
}).strict();
const passwordField = z.string().min(1).max(1024);
const passwordSchema = z.object({
    currentPassword: passwordField,
    newPassword: passwordField
        .refine((value) => Array.from(value).length >= 8, 'Password must contain at least 8 characters.')
        .refine((value) => !/\p{White_Space}/u.test(value), 'Password must not contain whitespace.'),
    confirmPassword: passwordField,
}).strict().refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'], message: 'Confirmation password must match the new password.',
});
function requireMember(request, _response, next) {
    if (!request.actor || request.actor.accountType !== 'MEMBER') {
        return next(new ApiError(403, 'FORBIDDEN', 'Active member access is required.'));
    }
    return next();
}
function safeSummary(user) {
    return {
        userId: user.userId,
        name: user.name,
        email: user.email,
        accountType: user.accountType,
        accountStatus: user.accountStatus,
        ...(user.memberId ? { memberId: user.memberId } : {}),
    };
}
export function createMemberProfileRouter(accounts, users) {
    const router = Router();
    const activeMember = [requireActiveActor(users), requireMember];
    router.get('/', ...activeMember, async (request, response) => {
        response.json({ user: safeSummary(await accounts.getProfile(request.actor.userId)) });
    });
    router.patch('/name', ...activeMember, async (request, response) => {
        const { name } = parseRequest(nameSchema, request.body);
        response.json({ user: safeSummary(await accounts.updateName(request.actor.userId, name)) });
    });
    router.patch('/email', ...activeMember, async (request, response) => {
        const { email } = parseRequest(emailSchema, request.body);
        response.json({ user: safeSummary(await accounts.updateEmail(request.actor.userId, email)) });
    });
    router.patch('/password', ...activeMember, async (request, response) => {
        const { currentPassword, newPassword } = parseRequest(passwordSchema, request.body);
        const user = await accounts.changePassword(request.actor.userId, request.sessionID, currentPassword, newPassword, request.actor.authVersion ?? 0);
        response.json({ user: safeSummary(user) });
    });
    return router;
}
//# sourceMappingURL=member-profile.js.map
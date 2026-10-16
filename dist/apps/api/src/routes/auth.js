import { Router } from 'express';
import { z } from 'zod';
import { requireActiveActor } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
import { StorageError } from '../storage/repositories.js';
const registrationCommon = {
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(1024),
};
const registrationSchema = z.discriminatedUnion('accountType', [
    z.object({ ...registrationCommon, accountType: z.literal('MEMBER') }).strict(),
    z.object({
        ...registrationCommon,
        accountType: z.literal('LIBRARIAN'),
        employeeId: z.string().trim().min(1).max(128),
    }).strict(),
]);
const loginSchema = z.object({
    accountType: z.enum(['MEMBER', 'LIBRARIAN']),
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(1024),
}).strict();
function accountSummary(user) {
    return {
        userId: user.userId,
        name: user.name,
        email: user.email,
        accountType: user.accountType,
        accountStatus: user.accountStatus,
        ...(user.memberId ? { memberId: user.memberId } : {}),
        ...(user.employeeId ? { employeeId: user.employeeId } : {}),
        ...(user.accountType === 'LIBRARIAN' ? { isManager: user.isManager === true } : {}),
    };
}
function regenerateSession(request) {
    return new Promise((resolve, reject) => {
        request.session.regenerate((error) => error ? reject(error) : resolve());
    });
}
function saveSession(request) {
    return new Promise((resolve, reject) => {
        request.session.save((error) => error ? reject(error) : resolve());
    });
}
function destroySession(request) {
    return new Promise((resolve, reject) => {
        request.session.destroy((error) => error ? reject(error) : resolve());
    });
}
export function createAuthRouter(accounts, users, cookieOptions, clientOrigin) {
    const router = Router();
    const requireActor = requireActiveActor(users);
    router.use((_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
    });
    const isHtmlForm = (request) => request.is('application/x-www-form-urlencoded') && request.accepts('html') === 'html';
    const redirectForm = (response, location) => response.redirect(303, `${clientOrigin}${location}`);
    router.post('/register', async (request, response) => {
        const htmlForm = isHtmlForm(request);
        let input;
        try {
            input = parseRequest(registrationSchema, request.body);
            const user = await accounts.register(input);
            if (htmlForm) {
                const accountType = user.accountType === 'LIBRARIAN' ? 'librarian' : 'member';
                return redirectForm(response, `/login-registered-${accountType}.html`);
            }
            return response.status(201).json({ user: accountSummary(user) });
        }
        catch (error) {
            if (error instanceof StorageError && error.code === 'CONFLICT') {
                if (htmlForm)
                    return redirectForm(response, '/register-invalid.html');
                throw new ApiError(409, 'CONFLICT', 'An account already uses one of these identities.');
            }
            if (htmlForm && error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
                return redirectForm(response, '/register-invalid.html');
            }
            throw error;
        }
    });
    router.post('/login', async (request, response) => {
        const htmlForm = isHtmlForm(request);
        let input;
        let user;
        try {
            input = parseRequest(loginSchema, request.body);
            user = await accounts.authenticate({
                email: input.email,
                password: input.password,
                expectedType: input.accountType,
            });
        }
        catch (error) {
            if (error instanceof StorageError && error.code === 'FORBIDDEN') {
                if (htmlForm)
                    return redirectForm(response, '/login-invalid.html');
                throw new ApiError(401, 'UNAUTHENTICATED', 'Email or password is incorrect.');
            }
            if (htmlForm && error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
                return redirectForm(response, '/login-invalid.html');
            }
            throw error;
        }
        await regenerateSession(request);
        request.session.userId = user.userId;
        request.session.accountType = user.accountType;
        await saveSession(request);
        if (htmlForm)
            return redirectForm(response, '/');
        return response.json({ user: accountSummary(user) });
    });
    router.post('/logout', requireActor, async (request, response) => {
        await destroySession(request);
        response.clearCookie('libconnect.sid', cookieOptions);
        response.status(204).end();
    });
    router.get('/session', async (request, response) => {
        const userId = request.session?.userId;
        if (typeof userId !== 'string' || !userId) {
            return response.json({ authenticated: false });
        }
        try {
            const user = await users.getById(userId);
            if (user.accountStatus !== 'ACTIVE' || request.session.accountType !== user.accountType) {
                await destroySession(request);
                response.clearCookie('libconnect.sid', cookieOptions);
                return response.json({ authenticated: false });
            }
            return response.json({ authenticated: true, user: accountSummary(user) });
        }
        catch (error) {
            if (error instanceof StorageError && error.code === 'NOT_FOUND') {
                await destroySession(request);
                response.clearCookie('libconnect.sid', cookieOptions);
                return response.json({ authenticated: false });
            }
            throw error;
        }
    });
    return router;
}
//# sourceMappingURL=auth.js.map
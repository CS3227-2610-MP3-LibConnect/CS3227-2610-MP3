import { ApiError } from './errors.js';
import { StorageError } from '../storage/repositories.js';
export function requireActiveActor(users) {
    return async (request, _response, next) => {
        if (request.actor)
            return next();
        const userId = request.session?.userId;
        if (!userId)
            return next(new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.'));
        try {
            const actor = await users.getById(userId);
            if (actor.accountStatus !== 'ACTIVE')
                return next(new ApiError(403, 'FORBIDDEN', 'The account is inactive.'));
            if (request.session.accountType && request.session.accountType !== actor.accountType) {
                return next(new ApiError(401, 'UNAUTHENTICATED', 'The session is no longer valid.'));
            }
            request.actor = actor;
            return next();
        }
        catch (error) {
            if (error instanceof StorageError && error.code === 'NOT_FOUND')
                return next(new ApiError(401, 'UNAUTHENTICATED', 'The session is no longer valid.'));
            return next(error);
        }
    };
}
export const requireLibrarian = (request, _response, next) => {
    if (!request.actor || request.actor.accountType !== 'LIBRARIAN') {
        return next(new ApiError(403, 'FORBIDDEN', 'Active librarian access is required.'));
    }
    return next();
};
//# sourceMappingURL=auth.js.map
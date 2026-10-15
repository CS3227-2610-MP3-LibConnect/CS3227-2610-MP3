import type { RequestHandler } from 'express';
import type { UserRecord } from '../../../../packages/shared/src/domain/records.js';
import { ApiError } from './errors.js';
import { StorageError, UserRepository } from '../storage/repositories.js';

declare global {
  namespace Express {
    interface Request {
      actor?: UserRecord;
    }
  }
}

export function requireActiveActor(users: UserRepository): RequestHandler {
  return async (request, _response, next) => {
    const userId = request.session?.userId;
    if (!userId) return next(new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.'));
    try {
      const actor = await users.getById(userId);
      if (actor.accountStatus !== 'ACTIVE') return next(new ApiError(403, 'FORBIDDEN', 'The account is inactive.'));
      if (request.session.accountType && request.session.accountType !== actor.accountType) {
        return next(new ApiError(401, 'UNAUTHENTICATED', 'The session is no longer valid.'));
      }
      request.actor = actor;
      return next();
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND') return next(new ApiError(401, 'UNAUTHENTICATED', 'The session is no longer valid.'));
      return next(error);
    }
  };
}

export const requireLibrarian: RequestHandler = (request, _response, next) => {
  if (!request.actor || request.actor.accountType !== 'LIBRARIAN') {
    return next(new ApiError(403, 'FORBIDDEN', 'Active librarian access is required.'));
  }
  return next();
};

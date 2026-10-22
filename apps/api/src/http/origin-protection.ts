import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.js';

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const allowedMethods = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';

export function originProtection(clientOrigin: string, apiOrigin: string) {
  const trustedOrigins = new Set([clientOrigin, apiOrigin]);
  return (request: Request, response: Response, next: NextFunction) => {
    const origin = request.get('Origin');
    const trustedOrigin = origin !== undefined && trustedOrigins.has(origin);
    response.vary('Origin');

    if (origin === clientOrigin) {
      response.setHeader('Access-Control-Allow-Origin', clientOrigin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Access-Control-Allow-Methods', allowedMethods);
      // The librarian message workflow uses this header to make retries safe.
      // It must be advertised during preflight or browsers will block the
      // cross-origin request before it reaches the route.
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
    }

    if (request.method === 'OPTIONS') {
      if (!trustedOrigin) {
        return next(new ApiError(403, 'FORBIDDEN', 'The request origin is not allowed.'));
      }
      return response.status(204).end();
    }

    if (stateChangingMethods.has(request.method) && !trustedOrigin) {
      return next(new ApiError(403, 'FORBIDDEN', 'The request origin is not allowed.'));
    }

    return next();
  };
}

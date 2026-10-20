import { ApiError } from './errors.js';
const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const allowedMethods = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';
function isSameOrigin(request, origin) {
    if (!origin)
        return false;
    const host = request.get('Host');
    if (!host)
        return false;
    try {
        return new URL(origin).origin === new URL(`${request.protocol}://${host}`).origin;
    }
    catch {
        return false;
    }
}
export function originProtection(clientOrigin) {
    return (request, response, next) => {
        const origin = request.get('Origin');
        const trustedOrigin = origin === clientOrigin || isSameOrigin(request, origin);
        response.vary('Origin');
        if (origin === clientOrigin) {
            response.setHeader('Access-Control-Allow-Origin', clientOrigin);
            response.setHeader('Access-Control-Allow-Credentials', 'true');
            response.setHeader('Access-Control-Allow-Methods', allowedMethods);
            response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
//# sourceMappingURL=origin-protection.js.map
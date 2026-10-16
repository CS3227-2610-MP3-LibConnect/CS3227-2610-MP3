import { ApiError } from './errors.js';
const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const allowedMethods = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';
export function originProtection(clientOrigin) {
    return (request, response, next) => {
        const origin = request.get('Origin');
        response.vary('Origin');
        if (origin === clientOrigin) {
            response.setHeader('Access-Control-Allow-Origin', clientOrigin);
            response.setHeader('Access-Control-Allow-Credentials', 'true');
            response.setHeader('Access-Control-Allow-Methods', allowedMethods);
            response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        }
        if (request.method === 'OPTIONS') {
            if (origin !== clientOrigin) {
                return next(new ApiError(403, 'FORBIDDEN', 'The request origin is not allowed.'));
            }
            return response.status(204).end();
        }
        if (stateChangingMethods.has(request.method) && origin !== clientOrigin) {
            return next(new ApiError(403, 'FORBIDDEN', 'The request origin is not allowed.'));
        }
        return next();
    };
}
//# sourceMappingURL=origin-protection.js.map
import { StorageError } from '../storage/repositories.js';
export class ApiError extends Error {
    status;
    code;
    fields;
    constructor(status, code, message, fields) {
        super(message);
        this.status = status;
        this.code = code;
        this.fields = fields;
        this.name = 'ApiError';
    }
}
function fieldErrors(issues) {
    const fields = {};
    for (const issue of issues) {
        const path = issue.path.join('.') || 'request';
        fields[path] ??= issue.message;
    }
    return fields;
}
export function parseRequest(schema, value) {
    const result = schema.safeParse(value);
    if (!result.success)
        throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', fieldErrors(result.error.issues));
    return result.data;
}
export const notFoundHandler = (_request, _response, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.'));
};
export const apiErrorHandler = (error, _request, response, _next) => {
    if (error instanceof ApiError) {
        response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
        return;
    }
    if (error instanceof StorageError) {
        const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : 400;
        response.status(status).json({ error: { code: error.code, message: error.message } });
        return;
    }
    if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
        response.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body contains invalid JSON.' } });
        return;
    }
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } });
};

export class ApiClientError extends Error {
    status;
    code;
    fields;
    constructor(status, payload) {
        super(payload?.error?.message ?? `Request failed (${status}).`);
        this.name = 'ApiClientError';
        this.status = status;
        this.code = payload?.error?.code;
        this.fields = payload?.error?.fields;
    }
}
//# sourceMappingURL=errors.js.map
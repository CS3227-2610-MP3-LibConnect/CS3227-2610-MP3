export interface ApiErrorPayload {
    error?: {
        code?: string;
        message?: string;
        fields?: Record<string, string>;
    };
}
export declare class ApiClientError extends Error {
    status: number;
    code?: string;
    fields?: Record<string, string>;
    constructor(status: number, payload?: ApiErrorPayload);
}

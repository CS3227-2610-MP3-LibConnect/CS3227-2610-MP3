import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodError } from 'zod';
export declare class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly fields?: Record<string, string> | undefined;
    constructor(status: number, code: string, message: string, fields?: Record<string, string> | undefined);
}
export declare function parseRequest<T>(schema: {
    safeParse(value: unknown): {
        success: true;
        data: T;
    } | {
        success: false;
        error: ZodError;
    };
}, value: unknown): T;
export declare const notFoundHandler: RequestHandler;
export declare const apiErrorHandler: ErrorRequestHandler;

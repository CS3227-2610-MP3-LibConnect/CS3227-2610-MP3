export declare class ApiError extends Error {
    status: any;
    code: any;
    fields: any;
    constructor(status: any, code: any, message: any, fields: any);
}
export declare function parseRequest(schema: any, value: any): any;
export declare const notFoundHandler: (_request: any, _response: any, next: any) => void;
export declare const apiErrorHandler: (error: any, _request: any, response: any, _next: any) => void;

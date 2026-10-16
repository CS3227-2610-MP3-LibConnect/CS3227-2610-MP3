import type { NextFunction, Request, Response } from 'express';
export declare function originProtection(clientOrigin: string): (request: Request, response: Response, next: NextFunction) => void | Response<any, Record<string, any>>;

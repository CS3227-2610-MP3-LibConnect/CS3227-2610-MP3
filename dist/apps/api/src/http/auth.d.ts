import type { RequestHandler } from 'express';
import type { UserRecord } from '../../../../packages/shared/src/domain/records.js';
import { UserRepository } from '../storage/repositories.js';
declare global {
    namespace Express {
        interface Request {
            actor?: UserRecord;
        }
    }
}
export declare function requireActiveActor(users: UserRepository): RequestHandler;
export declare const requireLibrarian: RequestHandler;

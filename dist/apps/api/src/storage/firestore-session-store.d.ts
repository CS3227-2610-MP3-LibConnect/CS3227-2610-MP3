import session from 'express-session';
import { type Firestore } from 'firebase-admin/firestore';
declare module 'express-session' {
    interface SessionData {
        userId?: string;
        accountType?: 'MEMBER' | 'LIBRARIAN';
    }
}
export declare class FirestoreSessionStore extends session.Store {
    private readonly db;
    private readonly sessions;
    private readonly maxAge;
    constructor(db: Firestore);
    get(sid: string, callback: (err?: unknown, session?: session.SessionData | null) => void): void;
    set(sid: string, value: session.SessionData, callback?: (err?: unknown) => void): void;
    destroy(sid: string, callback?: (err?: unknown) => void): void;
    touch(sid: string, value: session.SessionData, callback?: (err?: unknown) => void): void;
    destroyForUser(userId: string): Promise<void>;
}

import session from 'express-session';
export declare class FirestoreSessionStore extends session.Store {
    db: any;
    sessions: any;
    maxAge: any;
    constructor(db: any);
    get(sid: any, callback: any): void;
    set(sid: any, value: any, callback: any): void;
    destroy(sid: any, callback: any): void;
    touch(sid: any, value: any, callback: any): void;
    destroyForUser(userId: any): Promise<void>;
}

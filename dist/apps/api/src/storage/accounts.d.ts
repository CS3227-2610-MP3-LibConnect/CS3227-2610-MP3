export declare class AccountStorage {
    db: any;
    sessions: any;
    users: any;
    constructor(db: any, sessions: any);
    register(input: any): Promise<any>;
    authenticate(input: any): Promise<any>;
    updateEmail(userId: any, email: any): Promise<void>;
    deactivateMember(userId: any, actor: any): Promise<void>;
}

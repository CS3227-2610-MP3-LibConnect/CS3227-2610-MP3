export declare class AccountStorage {
    db: any;
    sessions: any;
    users: any;
    constructor(db: any, sessions: any);
    register(input: any): Promise<any>;
    authenticate(input: any): Promise<any>;
    updateEmail(userId: any, email: any): Promise<any>;
    getProfile(userId: any): Promise<any>;
    updateName(userId: any, name: any): Promise<any>;
    changePassword(userId: any, serverSessionId: any, currentPassword: any, newPassword: any, expectedVersion: any): Promise<any>;
    deactivateMember(userId: any, actor: any): Promise<void>;
}

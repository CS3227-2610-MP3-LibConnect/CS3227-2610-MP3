export declare function assertCanDeactivateManager(target: any, activeManagers: any): void;
export declare class AccountStorage {
    db: any;
    sessions: any;
    users: any;
    constructor(db: any, sessions: any);
    register(input: any): Promise<any>;
    authenticate(input: any): Promise<any>;
    updateEmail(userId: any, email: any): Promise<void>;
    listLibrarians(actor: any): Promise<any>;
    updateLibrarianStatus(userId: any, accountStatus: any, actor: any): Promise<any>;
    resetLibrarianPassword(userId: any, password: any, confirmPassword: any, actor: any): Promise<any>;
    deactivateMember(userId: any, actor: any): Promise<void>;
}

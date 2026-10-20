export interface LibrarianAccount {
    userId: string;
    name: string;
    email: string;
    employeeId: string;
    accountType: 'LIBRARIAN';
    accountStatus: 'ACTIVE' | 'INACTIVE';
    isManager: boolean;
    registrationDateTime: string;
}
export declare const managerApi: {
    listLibrarians(): Promise<{
        librarians: LibrarianAccount[];
    }>;
    updateLibrarianStatus(userId: string, status: LibrarianAccount["accountStatus"]): Promise<{
        librarian: LibrarianAccount;
    }>;
    resetLibrarianPassword(userId: string, password: string, confirmPassword: string): Promise<{
        librarian: LibrarianAccount;
    }>;
    resetLibrarianPasswordFormUrl(userId: string): string;
};

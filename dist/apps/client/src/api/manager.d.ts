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
};

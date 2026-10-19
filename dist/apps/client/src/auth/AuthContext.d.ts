import { type ReactNode } from 'react';
export type AccountType = 'MEMBER' | 'LIBRARIAN';
export interface AuthUser {
    userId: string;
    name: string;
    email: string;
    accountType: AccountType;
    accountStatus: 'ACTIVE' | 'INACTIVE';
    memberId?: string;
    employeeId?: string;
    isManager?: boolean;
}
export interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    login(input: {
        accountType: AccountType;
        email: string;
        password: string;
    }): Promise<AuthUser>;
    register(input: Record<string, string>): Promise<AuthUser>;
    logout(): Promise<void>;
}
export declare const AuthContext: import("react").Context<AuthContextValue>;
export declare function AuthProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useAuth(): AuthContextValue;

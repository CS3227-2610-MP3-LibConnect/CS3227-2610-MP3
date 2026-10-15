import { type Firestore } from 'firebase-admin/firestore';
import { type UserRecord } from '../../../../packages/shared/src/domain/records.js';
import type { FirestoreSessionStore } from './firestore-session-store.js';
export type PublicUser = Omit<UserRecord, 'passwordHash'>;
export declare class AccountStorage {
    private readonly db;
    private readonly sessions?;
    private readonly users;
    constructor(db: Firestore, sessions?: FirestoreSessionStore | undefined);
    register(input: {
        name: string;
        email: string;
        password: string;
        accountType: 'MEMBER' | 'LIBRARIAN';
        employeeId?: string;
    }): Promise<PublicUser>;
    authenticate(input: {
        email: string;
        password: string;
        expectedType: 'MEMBER' | 'LIBRARIAN';
    }): Promise<PublicUser>;
    updateEmail(userId: string, email: string): Promise<void>;
    deactivateMember(userId: string, actor: Pick<UserRecord, 'accountType' | 'accountStatus'>): Promise<void>;
}

import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Timestamp } from 'firebase-admin/firestore';
import { canonicalizeEmail } from '../../../../packages/shared/src/domain/records.js';
import { StorageError, UserRepository } from './repositories.js';
function withoutPassword(user) {
    const { passwordHash: _passwordHash, ...account } = user;
    return account;
}
export class AccountStorage {
    db;
    sessions;
    users;
    constructor(db, sessions) {
        this.db = db;
        this.sessions = sessions;
        this.users = new UserRepository(db);
    }
    async register(input) {
        const email = input.email.trim();
        const employeeId = input.employeeId?.trim();
        if (input.accountType === 'LIBRARIAN' && !employeeId)
            throw new StorageError('INVALID', 'Librarian employee ID is required.');
        const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
        const userId = randomUUID();
        const account = {
            userId,
            name: input.name.trim(),
            email,
            emailCanonical: canonicalizeEmail(email),
            passwordHash,
            registrationDateTime: Timestamp.now(),
            accountType: input.accountType,
            accountStatus: input.accountType === 'MEMBER' ? 'ACTIVE' : 'INACTIVE',
            ...(input.accountType === 'MEMBER' ? { memberId: randomUUID() } : { employeeId, employeeIdCanonical: employeeId.toLowerCase(), isManager: false }),
        };
        await this.users.create(account);
        return withoutPassword(account);
    }
    async authenticate(input) {
        let user;
        try {
            user = await this.users.getByEmail(input.email);
        }
        catch (error) {
            if (!(error instanceof StorageError) || error.code !== 'NOT_FOUND')
                throw error;
            throw new StorageError('FORBIDDEN', 'Email or password is incorrect.');
        }
        if (user.accountStatus !== 'ACTIVE' || user.accountType !== input.expectedType || !(await argon2.verify(user.passwordHash, input.password))) {
            throw new StorageError('FORBIDDEN', 'Email or password is incorrect.');
        }
        return withoutPassword(user);
    }
    async updateEmail(userId, email) {
        await this.users.updateEmail(userId, email);
        return this.getProfile(userId);
    }
    async getProfile(userId) {
        return withoutPassword(await this.users.getById(userId));
    }
    async updateName(userId, name) {
        const userRef = this.db.collection('users').doc(userId);
        await userRef.update({ name: name.trim(), updatedAt: Timestamp.now() });
        return this.getProfile(userId);
    }
    async changePassword(userId, serverSessionId, currentPassword, newPassword, expectedVersion) {
        const initialUser = await this.users.getById(userId);
        if (initialUser.accountType !== 'MEMBER' || initialUser.accountStatus !== 'ACTIVE'
            || typeof initialUser.passwordHash !== 'string' || !initialUser.passwordHash) {
            throw new StorageError('FORBIDDEN', 'The account or session is no longer valid.');
        }
        let currentPasswordMatches = false;
        try {
            currentPasswordMatches = await argon2.verify(initialUser.passwordHash, currentPassword);
        }
        catch {
            throw new StorageError('FORBIDDEN', 'The account or session is no longer valid.');
        }
        if (!currentPasswordMatches) {
            throw new StorageError('FORBIDDEN', 'Current password is incorrect.');
        }
        const newPasswordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
        const userRef = this.db.collection('users').doc(userId);
        const sessionRef = this.sessions?.documentRefFor(serverSessionId);
        if (!sessionRef) {
            throw new StorageError('FORBIDDEN', 'The account or session is no longer valid.');
        }
        await this.db.runTransaction(async (transaction) => {
            const [userSnapshot, sessionSnapshot] = await Promise.all([
                transaction.get(userRef), transaction.get(sessionRef),
            ]);
            const user = userSnapshot.data();
            const storedSession = sessionSnapshot.data();
            const currentVersion = user?.authVersion ?? 0;
            const sessionVersion = storedSession?.authVersion ?? 0;
            if (!userSnapshot.exists || !sessionSnapshot.exists
                || user.userId !== userId || user.accountType !== 'MEMBER' || user.accountStatus !== 'ACTIVE'
                || user.passwordHash !== initialUser.passwordHash
                || currentVersion !== expectedVersion
                || typeof currentVersion !== 'number' || !Number.isSafeInteger(currentVersion) || currentVersion < 0
                || storedSession.userId !== userId || storedSession.accountType !== 'MEMBER'
                || typeof sessionVersion !== 'number' || !Number.isSafeInteger(sessionVersion) || sessionVersion !== currentVersion
                || !(storedSession.expiresAt instanceof Timestamp) || storedSession.expiresAt.toMillis() <= Date.now()) {
                throw new StorageError('FORBIDDEN', 'The account or session is no longer valid.');
            }
            const nextVersion = currentVersion + 1;
            if (!Number.isSafeInteger(nextVersion)) {
                throw new StorageError('FORBIDDEN', 'The account or session is no longer valid.');
            }
            transaction.update(userRef, { passwordHash: newPasswordHash, authVersion: nextVersion, updatedAt: Timestamp.now() });
            transaction.update(sessionRef, { authVersion: nextVersion });
        });
        const updatedProfile = await this.getProfile(userId);
        const { authVersion: _authVersion, ...safeProfile } = updatedProfile;
        return safeProfile;
    }
    async deactivateMember(userId, actor) {
        if (actor.accountStatus !== 'ACTIVE' || actor.accountType !== 'LIBRARIAN')
            throw new StorageError('FORBIDDEN', 'Active librarian access is required.');
        const user = await this.users.getById(userId);
        if (user.accountType !== 'MEMBER')
            throw new StorageError('FORBIDDEN', 'Librarians may deactivate member accounts only.');
        await this.db.collection('users').doc(userId).update({ accountStatus: 'INACTIVE', updatedAt: Timestamp.now() });
        await this.sessions?.destroyForUser(userId);
    }
}
//# sourceMappingURL=accounts.js.map
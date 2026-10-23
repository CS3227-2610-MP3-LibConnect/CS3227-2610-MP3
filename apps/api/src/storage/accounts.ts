import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Timestamp } from 'firebase-admin/firestore';
import { canonicalizeEmail, UserRecordSchema } from '../../../../packages/shared/src/domain/records.js';
import { StorageError, UserRepository } from './repositories.js';
function withoutPassword(user) {
    const { passwordHash: _passwordHash, authVersion: _authVersion, ...account } = user;
    return account;
}
function incrementAuthVersion(user) {
    const currentVersion = user.authVersion ?? 0;
    if (!Number.isSafeInteger(currentVersion) || currentVersion < 0 || !Number.isSafeInteger(currentVersion + 1))
        throw new StorageError('FORBIDDEN', 'The account or session is no longer valid.');
    return currentVersion + 1;
}
function requireManager(actor) {
    if (actor.accountStatus !== 'ACTIVE' || actor.accountType !== 'LIBRARIAN' || actor.isManager !== true)
        throw new StorageError('FORBIDDEN', 'Active librarian manager access is required.');
}
function requireActiveLibrarian(actor) {
    if (actor.accountStatus !== 'ACTIVE' || actor.accountType !== 'LIBRARIAN')
        throw new StorageError('FORBIDDEN', 'Active librarian access is required.');
}
function validateResetPassword(password, confirmPassword) {
    if (typeof password !== 'string' || password.length > 1024 || Array.from(password).length < 8 || /\p{White_Space}/u.test(password))
        throw new StorageError('INVALID', 'Password does not meet the password policy.');
    if (typeof confirmPassword !== 'string' || confirmPassword.length > 1024 || password !== confirmPassword)
        throw new StorageError('INVALID', 'Confirmation password must match the password.');
}
const sessionRevocationDelaysMs = [0, 10, 50];
async function revokeSessions(sessions, userId) {
    if (!sessions?.destroyForUser)
        return;
    let lastError;
    for (const delay of sessionRevocationDelaysMs) {
        if (delay > 0)
            await new Promise((resolve) => setTimeout(resolve, delay));
        try {
            await sessions.destroyForUser(userId);
            return;
        }
        catch (error) {
            lastError = error;
        }
    }
    if (sessions.enqueueRevocation) {
        try {
            await sessions.enqueueRevocation(userId);
        }
        catch {
            // Preserve the original revocation failure while allowing the account
            // state transition to remain committed and protected by active-actor checks.
        }
    }
    throw lastError;
}
export function assertCanDeactivateManager(target, activeManagers) {
    if (target.isManager === true && activeManagers <= 1)
        throw new StorageError('CONFLICT', 'The last active manager cannot be deactivated.');
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
            authVersion: 0,
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
        if (user.accountType !== input.expectedType || !(await argon2.verify(user.passwordHash, input.password))) {
            throw new StorageError('FORBIDDEN', 'Email or password is incorrect.');
        }
        if (user.accountStatus !== 'ACTIVE') {
            if (user.accountType === 'MEMBER') {
                throw new StorageError('ACCOUNT_DISABLED', 'This account is disabled.');
            }
            throw new StorageError('LIBRARIAN_INACTIVE', 'Your librarian account is not active yet. Please contact a library manager to activate it, then sign in again.');
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
    async listLibrarians(actor) {
        requireManager(actor);
        return (await this.users.listLibrarians()).map(withoutPassword);
    }
    async listMembers({ status, limit, cursor }, actor) {
        requireActiveLibrarian(actor);
        const result = await this.users.listMembers(status, limit, cursor);
        return { items: result.items.map(withoutPassword), nextCursor: result.nextCursor };
    }
    async getMember(userId, actor) {
        requireActiveLibrarian(actor);
        const target = await this.users.getById(userId);
        if (target.accountType !== 'MEMBER')
            throw new StorageError('FORBIDDEN', 'The target is not a member account.');
        return withoutPassword(target);
    }
    async updateMemberStatus(userId, accountStatus, actor) {
        requireActiveLibrarian(actor);
        const targetRef = this.db.collection('users').doc(userId);
        let updated;
        await this.db.runTransaction(async (tx) => {
            const targetSnapshot = await tx.get(targetRef);
            if (!targetSnapshot.exists)
                throw new StorageError('NOT_FOUND', 'Member account was not found.');
            const target = UserRecordSchema.parse({ ...targetSnapshot.data(), userId: targetSnapshot.id });
            if (target.accountType !== 'MEMBER')
                throw new StorageError('FORBIDDEN', 'The target is not a member account.');
            if (target.accountStatus === accountStatus)
                throw new StorageError('CONFLICT', 'The member account already has that status.');
            const now = Timestamp.now();
            const authVersion = accountStatus === 'INACTIVE' ? incrementAuthVersion(target) : target.authVersion;
            updated = { ...target, accountStatus, authVersion };
            tx.update(targetRef, { accountStatus, authVersion, updatedAt: now });
        });
        if (accountStatus === 'INACTIVE')
            await revokeSessions(this.sessions, userId);
        return withoutPassword(updated);
    }
    async updateLibrarianStatus(userId, accountStatus, actor) {
        requireManager(actor);
        const targetRef = this.db.collection('users').doc(userId);
        let updated;
        await this.db.runTransaction(async (tx) => {
            const activeManagersQuery = this.db.collection('users')
                .where('accountType', '==', 'LIBRARIAN')
                .where('accountStatus', '==', 'ACTIVE')
                .where('isManager', '==', true);
            const [targetSnapshot, activeManagers] = await Promise.all([
                tx.get(targetRef),
                tx.get(activeManagersQuery),
            ]);
            if (!targetSnapshot.exists)
                throw new StorageError('NOT_FOUND', 'Librarian account was not found.');
            const target = UserRecordSchema.parse({ ...targetSnapshot.data(), userId: targetSnapshot.id });
            if (target.accountType !== 'LIBRARIAN')
                throw new StorageError('FORBIDDEN', 'The target is not a librarian account.');
            if (target.accountStatus === accountStatus)
                throw new StorageError('CONFLICT', 'The librarian account already has that status.');
            if (accountStatus === 'INACTIVE' && target.accountStatus === 'ACTIVE')
                assertCanDeactivateManager(target, activeManagers.docs.length);
            const now = Timestamp.now();
            const authVersion = accountStatus === 'INACTIVE' ? incrementAuthVersion(target) : target.authVersion;
            updated = { ...target, accountStatus, authVersion };
            tx.update(targetRef, { accountStatus, authVersion, updatedAt: now });
        });
        if (accountStatus === 'INACTIVE')
            await revokeSessions(this.sessions, userId);
        return withoutPassword(updated);
    }
    async resetLibrarianPassword(userId, password, confirmPassword, actor) {
        requireManager(actor);
        if (userId === actor.userId)
            throw new StorageError('FORBIDDEN', 'Managers must use self-service password management for their own account.');
        validateResetPassword(password, confirmPassword);
        const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
        const targetRef = this.db.collection('users').doc(userId);
        let updated;
        await this.db.runTransaction(async (tx) => {
            const targetSnapshot = await tx.get(targetRef);
            if (!targetSnapshot.exists)
                throw new StorageError('NOT_FOUND', 'Librarian account was not found.');
            const target = UserRecordSchema.parse({ ...targetSnapshot.data(), userId: targetSnapshot.id });
            if (target.userId === actor.userId)
                throw new StorageError('FORBIDDEN', 'Managers must use self-service password management for their own account.');
            if (target.accountType !== 'LIBRARIAN')
                throw new StorageError('FORBIDDEN', 'The target is not a librarian account.');
            const updatedAt = Timestamp.now();
            const authVersion = incrementAuthVersion(target);
            updated = { ...target, passwordHash, authVersion };
            tx.update(targetRef, { passwordHash, authVersion, updatedAt });
        });
        await revokeSessions(this.sessions, userId);
        return withoutPassword(updated);
    }
    async deactivateMember(userId, actor) {
        await this.updateMemberStatus(userId, 'INACTIVE', actor);
    }
}

import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Timestamp } from 'firebase-admin/firestore';
import { canonicalizeEmail, UserRecordSchema } from '../../../../packages/shared/src/domain/records.js';
import { StorageError, UserRepository } from './repositories.js';
function withoutPassword(user) {
    const { passwordHash: _passwordHash, ...account } = user;
    return account;
}
function requireManager(actor) {
    if (actor.accountStatus !== 'ACTIVE' || actor.accountType !== 'LIBRARIAN' || actor.isManager !== true)
        throw new StorageError('FORBIDDEN', 'Active librarian manager access is required.');
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
    }
    async listLibrarians(actor) {
        requireManager(actor);
        return (await this.users.listLibrarians()).map(withoutPassword);
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
            updated = { ...target, accountStatus };
            tx.update(targetRef, { accountStatus, updatedAt: now });
        });
        if (accountStatus === 'INACTIVE')
            await this.sessions?.destroyForUser(userId);
        return withoutPassword(updated);
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

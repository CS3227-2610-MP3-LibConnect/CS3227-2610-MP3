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
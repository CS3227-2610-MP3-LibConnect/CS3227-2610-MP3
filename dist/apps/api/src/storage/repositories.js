import { createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { BookCopyRecordSchema, BookRecordSchema, FineRecordSchema, LoanRecordSchema, NotificationRecordSchema, ReservationRecordSchema, UserRecordSchema, canonicalizeEmail, canonicalizeIdentity, } from '../../../../packages/shared/src/domain/records.js';
export class StorageError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'StorageError';
    }
}
const collections = {
    users: 'users', books: 'books', copies: 'bookCopies', loans: 'loans',
    reservations: 'reservations', fines: 'fines', notifications: 'notifications', identityKeys: 'identityKeys',
};
const copyStatuses = ['AVAILABLE', 'IN_TRANSIT', 'ON_LOAN', 'DAMAGED', 'LOST', 'RESERVED'];
const editableBookFields = new Set(['title', 'author', 'publicationYear', 'publisher', 'category', 'synopsis']);
function hashedKey(kind, canonical) {
    return `${kind}_${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}
function parseDoc(schema, value) {
    if (!value)
        throw new StorageError('NOT_FOUND', 'Record was not found.');
    return schema.parse(value);
}
function requireActive(actor) {
    if (actor.accountStatus !== 'ACTIVE')
        throw new StorageError('FORBIDDEN', 'Account is inactive.');
}
function requireLibrarian(actor) {
    requireActive(actor);
    if (actor.accountType !== 'LIBRARIAN')
        throw new StorageError('FORBIDDEN', 'Librarian access is required.');
}
function assertMemberOwnsRecord(actor, memberId) {
    if (actor.accountType === 'MEMBER' && actor.memberId !== memberId)
        throw new StorageError('FORBIDDEN', 'Members may access only their own records.');
}
async function validateNotificationReference(db, notification) {
    if (!notification.referenceType || !notification.referenceId)
        return;
    const collection = { LOAN: collections.loans, RESERVATION: collections.reservations, FINE: collections.fines }[notification.referenceType];
    const snapshot = await db.collection(collection).doc(notification.referenceId).get();
    if (!snapshot.exists)
        throw new StorageError('INVALID', 'Notification reference does not exist.');
    const record = snapshot.data();
    const expectedType = notification.referenceType === 'LOAN' ? 'OVERDUE_ALERT'
        : notification.referenceType === 'RESERVATION' ? 'RESERVATION_READY'
            : ['FINE_ISSUED', 'FINE_UPDATED'].includes(notification.notificationType) ? notification.notificationType : null;
    if (notification.notificationType !== expectedType || !record.memberId)
        throw new StorageError('INVALID', 'Reference type does not match the notification context.');
    const recipient = await db.collection(collections.users).where('memberId', '==', record.memberId).limit(1).get();
    if (recipient.docs[0]?.id !== notification.recipientUserId)
        throw new StorageError('INVALID', 'Reference belongs to another notification recipient.');
}
export class UserRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async create(record) {
        const user = UserRecordSchema.parse(record);
        const canonicalEmail = canonicalizeEmail(user.email);
        if (user.email !== user.email.trim() || user.emailCanonical !== canonicalEmail)
            throw new StorageError('INVALID', 'Email display and canonical values are inconsistent.');
        if (user.employeeId && user.employeeIdCanonical !== canonicalizeIdentity(user.employeeId))
            throw new StorageError('INVALID', 'Employee ID canonical value is inconsistent.');
        const emailKey = hashedKey('EMAIL', canonicalEmail);
        const keys = [
            { ref: this.db.collection(collections.identityKeys).doc(emailKey), kind: 'EMAIL', value: canonicalizeEmail(user.email) },
            ...(user.memberId ? [{ ref: this.db.collection(collections.identityKeys).doc(hashedKey('MEMBER_ID', canonicalizeIdentity(user.memberId))), kind: 'MEMBER_ID', value: canonicalizeIdentity(user.memberId) }] : []),
            ...(user.employeeId ? [{ ref: this.db.collection(collections.identityKeys).doc(hashedKey('EMPLOYEE_ID', canonicalizeIdentity(user.employeeId))), kind: 'EMPLOYEE_ID', value: canonicalizeIdentity(user.employeeId) }] : []),
        ];
        const userRef = this.db.collection(collections.users).doc(user.userId);
        await this.db.runTransaction(async (tx) => {
            const existing = await Promise.all(keys.map(({ ref }) => tx.get(ref)));
            if (existing.some((snapshot) => snapshot.exists))
                throw new StorageError('CONFLICT', 'An account already uses one of these identities.');
            tx.create(userRef, user);
            keys.forEach(({ ref, kind, value }) => tx.create(ref, {
                kind, canonicalValue: value, ownerUserId: user.userId, createdAt: Timestamp.now(),
            }));
        });
    }
    async getById(userId) {
        const snapshot = await this.db.collection(collections.users).doc(userId).get();
        return parseDoc(UserRecordSchema, snapshot.data());
    }
    async listLibrarians() {
        const result = await this.db.collection(collections.users).where('accountType', '==', 'LIBRARIAN').get();
        return result.docs
            .map((document) => parseDoc(UserRecordSchema, { ...document.data(), userId: document.id }))
            .sort((left, right) => {
            const byRegistration = left.registrationDateTime.toMillis() - right.registrationDateTime.toMillis();
            return byRegistration || left.userId.localeCompare(right.userId);
        });
    }
    async getByEmail(email) {
        const canonical = canonicalizeEmail(email);
        const key = await this.db.collection(collections.identityKeys).doc(hashedKey('EMAIL', canonical)).get();
        if (!key.exists)
            throw new StorageError('NOT_FOUND', 'Account was not found.');
        const user = await this.getById(String(key.get('ownerUserId')));
        if (user.emailCanonical !== canonical)
            throw new StorageError('CONFLICT', 'Email identity index is inconsistent.');
        return user;
    }
    async updateEmail(userId, displayEmail) {
        const email = displayEmail.trim();
        const canonical = canonicalizeEmail(email);
        const newKey = this.db.collection(collections.identityKeys).doc(hashedKey('EMAIL', canonical));
        const userRef = this.db.collection(collections.users).doc(userId);
        await this.db.runTransaction(async (tx) => {
            const [userSnapshot, newKeySnapshot] = await Promise.all([tx.get(userRef), tx.get(newKey)]);
            if (!userSnapshot.exists)
                throw new StorageError('NOT_FOUND', 'Account was not found.');
            const current = parseDoc(UserRecordSchema, userSnapshot.data());
            const oldKey = this.db.collection(collections.identityKeys).doc(hashedKey('EMAIL', current.emailCanonical));
            const oldKeySnapshot = await tx.get(oldKey);
            if (!oldKeySnapshot.exists || oldKeySnapshot.get('ownerUserId') !== userId)
                throw new StorageError('CONFLICT', 'Email identity index is inconsistent.');
            if (canonical !== current.emailCanonical && newKeySnapshot.exists)
                throw new StorageError('CONFLICT', 'Email is already registered.');
            tx.set(userRef, { email, emailCanonical: canonical, updatedAt: Timestamp.now() }, { merge: true });
            if (canonical !== current.emailCanonical) {
                tx.delete(oldKey);
                tx.create(newKey, { kind: 'EMAIL', canonicalValue: canonical, ownerUserId: userId, createdAt: Timestamp.now() });
            }
        });
    }
}
export class LibraryRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async createBook(input, actor) {
        requireLibrarian(actor);
        const now = Timestamp.now();
        const value = BookRecordSchema.parse({ ...input, createdAt: now, updatedAt: now });
        const ref = this.db.collection(collections.books).doc(value.isbn);
        await this.db.runTransaction(async (tx) => {
            const existing = await tx.get(ref);
            if (existing.exists)
                throw new StorageError('CONFLICT', 'A book with this ISBN already exists.');
            tx.create(ref, value);
        });
        return value;
    }
    async updateBook(isbn, patch, actor) {
        requireLibrarian(actor);
        if (Object.keys(patch).some((field) => !editableBookFields.has(field)))
            throw new StorageError('INVALID', 'Only editable book metadata may be changed.');
        const ref = this.db.collection(collections.books).doc(isbn);
        let result;
        await this.db.runTransaction(async (tx) => {
            const snapshot = await tx.get(ref);
            const current = parseDoc(BookRecordSchema, snapshot.data());
            result = BookRecordSchema.parse({ ...current, ...patch, updatedAt: Timestamp.now() });
            tx.update(ref, { ...patch, updatedAt: result.updatedAt });
        });
        return result;
    }
    async deleteBook(isbn, actor) {
        requireLibrarian(actor);
        const ref = this.db.collection(collections.books).doc(isbn);
        const copiesQuery = this.db.collection(collections.copies).where('isbn', '==', isbn);
        const reservationsQuery = this.db.collection(collections.reservations).where('isbn', '==', isbn);
        await this.db.runTransaction(async (tx) => {
            const [book, copies, reservations] = await Promise.all([tx.get(ref), tx.get(copiesQuery), tx.get(reservationsQuery)]);
            if (!book.exists)
                throw new StorageError('NOT_FOUND', 'Book was not found.');
            if (!copies.empty || !reservations.empty)
                throw new StorageError('CONFLICT', 'A book cannot be deleted while copies or reservations reference it.');
            tx.delete(ref);
        });
    }
    async getBook(isbn) { return parseDoc(BookRecordSchema, (await this.db.collection(collections.books).doc(isbn).get()).data()); }
    async searchBooks(filters, limit = 20, cursor) {
        let query = this.db.collection(collections.books);
        for (const field of ['isbn', 'publicationYear']) {
            if (filters[field] !== undefined)
                query = query.where(field, '==', filters[field]);
        }
        query = query.orderBy(FieldPath.documentId());
        return this.scanCatalog(query, 'book', filters, limit, cursor);
    }
    async searchCopies(filters, limit = 20, cursor) {
        let query = this.db.collection(collections.copies);
        for (const field of ['isbn', 'copyId', 'status']) {
            if (filters[field] !== undefined)
                query = field === 'copyId'
                    ? query.where(FieldPath.documentId(), '==', filters[field])
                    : query.where(field, '==', filters[field]);
        }
        query = query.orderBy(FieldPath.documentId());
        return this.scanCatalog(query, 'copy', filters, limit, cursor);
    }
    async scanCatalog(query, kind, filters, limit, cursor) {
        const normalizedFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''));
        const filterKey = JSON.stringify(normalizedFilters);
        if (cursor && cursor.filterKey !== filterKey)
            throw new StorageError('INVALID', 'Cursor does not match these filters.');
        const items = [];
        let lastScannedId = cursor?.lastId;
        const matches = (record) => {
            const substringFields = kind === 'book' ? ['title', 'publisher', 'category'] : ['shelfLocation'];
            if (kind === 'book')
                substringFields.push('author');
            return substringFields.every((field) => {
                const term = filters[field];
                if (!term)
                    return true;
                const value = record[field];
                const values = Array.isArray(value) ? value : [value];
                return values.some((part) => typeof part === 'string' && part.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
            });
        };
        let hasMore = false;
        while (true) {
            let batchQuery = query;
            if (lastScannedId)
                batchQuery = batchQuery.startAfter(lastScannedId);
            const batch = await batchQuery.limit(100).get();
            if (batch.empty)
                break;
            for (const doc of batch.docs) {
                lastScannedId = doc.id;
                const record = { ...doc.data(), [kind === 'book' ? 'isbn' : 'copyId']: doc.id };
                if (matches(record))
                    items.push(record);
                if (items.length === limit) {
                    const more = await query.startAfter(lastScannedId).limit(1).get();
                    hasMore = !more.empty;
                    break;
                }
            }
            if (items.length === limit || batch.size < 100)
                break;
        }
        return { items, nextCursor: hasMore ? { filterKey, lastId: lastScannedId } : null };
    }
    async createCopy(input, actor) {
        requireLibrarian(actor);
        const copyRef = this.db.collection(collections.copies).doc(input.copyId);
        const bookRef = this.db.collection(collections.books).doc(input.isbn);
        let result;
        await this.db.runTransaction(async (tx) => {
            const [book, existing] = await Promise.all([tx.get(bookRef), tx.get(copyRef)]);
            if (!book.exists)
                throw new StorageError('NOT_FOUND', 'Book was not found.');
            if (existing.exists)
                throw new StorageError('CONFLICT', 'Copy identifier already exists.');
            const now = Timestamp.now();
            result = BookCopyRecordSchema.parse({ ...input, status: 'AVAILABLE', createdAt: now, updatedAt: now });
            tx.create(copyRef, result);
            // Serialize inventory references against a concurrent deleteBook transaction.
            tx.update(bookRef, { updatedAt: now });
        });
        return result;
    }
    async getCopy(copyId) { return parseDoc(BookCopyRecordSchema, (await this.db.collection(collections.copies).doc(copyId).get()).data()); }
    async updateCopy(copyId, shelfLocation, actor) {
        requireLibrarian(actor);
        const ref = this.db.collection(collections.copies).doc(copyId);
        let result;
        await this.db.runTransaction(async (tx) => {
            const snapshot = await tx.get(ref);
            const current = parseDoc(BookCopyRecordSchema, snapshot.data());
            const now = Timestamp.now();
            result = BookCopyRecordSchema.parse({ ...current, shelfLocation, updatedAt: now });
            tx.update(ref, { shelfLocation, updatedAt: now });
        });
        return result;
    }
    async deleteCopy(copyId, actor) {
        requireLibrarian(actor);
        const copyRef = this.db.collection(collections.copies).doc(copyId);
        await this.db.runTransaction(async (tx) => {
            const snapshot = await tx.get(copyRef);
            const copy = parseDoc(BookCopyRecordSchema, snapshot.data());
            if (!['AVAILABLE', 'DAMAGED', 'LOST'].includes(copy.status)) {
                throw new StorageError('CONFLICT', 'A copy can be deleted only when AVAILABLE, DAMAGED, or LOST.');
            }
            const bookRef = this.db.collection(collections.books).doc(copy.isbn);
            const loansQuery = this.db.collection(collections.loans).where('copyId', '==', copyId);
            const reservationsQuery = this.db.collection(collections.reservations).where('copyId', '==', copyId);
            const [book, loans, reservations] = await Promise.all([tx.get(bookRef), tx.get(loansQuery), tx.get(reservationsQuery)]);
            const hasActiveLoan = loans.docs.some((document) => ['ACTIVE', 'PENDING_CLOSE'].includes(document.get('status')));
            const hasActiveReservation = reservations.docs.some((document) => document.get('status') === 'PENDING');
            if (hasActiveLoan || hasActiveReservation) {
                throw new StorageError('CONFLICT', 'A copy cannot be deleted while an active loan or reservation references it.');
            }
            tx.delete(copyRef);
            if (book.exists)
                tx.update(bookRef, { updatedAt: Timestamp.now() });
        });
    }
    async inventorySummary(actor) {
        requireLibrarian(actor);
        const [books, copies] = await Promise.all([
            this.db.collection(collections.books).get(),
            this.db.collection(collections.copies).get(),
        ]);
        const byStatus = Object.fromEntries(copyStatuses.map((status) => [status, 0]));
        for (const document of copies.docs) {
            const status = document.get('status');
            if (Object.hasOwn(byStatus, status))
                byStatus[status] += 1;
        }
        return {
            totalTitles: books.size,
            totalCopies: copies.size,
            availableCopies: byStatus.AVAILABLE,
            byStatus,
        };
    }
    async getLoan(loanId, actor) {
        requireActive(actor);
        const value = parseDoc(LoanRecordSchema, (await this.db.collection(collections.loans).doc(loanId).get()).data());
        assertMemberOwnsRecord(actor, value.memberId);
        return value;
    }
    async createReservation(reservation, actor) {
        requireLibrarian(actor);
        const value = ReservationRecordSchema.parse(reservation);
        if (value.status !== 'PENDING' || value.copyId !== null || value.expiryDate !== null)
            throw new StorageError('INVALID', 'A new reservation must be pending and unassigned.');
        const reservationRef = this.db.collection(collections.reservations).doc(value.reservationId);
        const bookRef = this.db.collection(collections.books).doc(value.isbn);
        const memberQuery = this.db.collection(collections.users).where('memberId', '==', value.memberId).limit(1);
        await this.db.runTransaction(async (tx) => {
            const [book, member, existing] = await Promise.all([tx.get(bookRef), tx.get(memberQuery), tx.get(reservationRef)]);
            if (!book.exists)
                throw new StorageError('INVALID', 'Reservation references an unknown ISBN.');
            if (!member.docs[0] || member.docs[0].get('accountType') !== 'MEMBER' || member.docs[0].get('accountStatus') !== 'ACTIVE')
                throw new StorageError('INVALID', 'An active member is required.');
            if (existing.exists)
                throw new StorageError('CONFLICT', 'Reservation identifier already exists.');
            const now = Timestamp.now();
            tx.create(reservationRef, { ...value, reservationDateTime: now });
            // Serialize reservation creation against a concurrent deleteBook transaction.
            tx.update(bookRef, { updatedAt: now });
        });
    }
    async getReservation(reservationId, actor) {
        requireActive(actor);
        const value = parseDoc(ReservationRecordSchema, (await this.db.collection(collections.reservations).doc(reservationId).get()).data());
        assertMemberOwnsRecord(actor, value.memberId);
        return value;
    }
    async getFine(fineId, actor) {
        requireActive(actor);
        const value = parseDoc(FineRecordSchema, (await this.db.collection(collections.fines).doc(fineId).get()).data());
        assertMemberOwnsRecord(actor, value.memberId);
        return value;
    }
    async putNotification(notification, actor) {
        requireLibrarian(actor);
        const value = NotificationRecordSchema.parse(notification);
        await validateNotificationReference(this.db, value);
        await this.db.collection(collections.notifications).doc(value.notificationId).set(value);
    }
    async getNotification(notificationId, actor) {
        requireActive(actor);
        const value = parseDoc(NotificationRecordSchema, (await this.db.collection(collections.notifications).doc(notificationId).get()).data());
        if (actor.accountType === 'MEMBER' && value.recipientUserId !== actor.userId)
            throw new StorageError('FORBIDDEN', 'Members may access only their own notifications.');
        return value;
    }
    async memberActivity(memberId, actor) {
        requireActive(actor);
        assertMemberOwnsRecord(actor, memberId);
        const [loans, reservations, fines] = await Promise.all([
            this.db.collection(collections.loans).where('memberId', '==', memberId).orderBy('borrowDateTime', 'desc').get(),
            this.db.collection(collections.reservations).where('memberId', '==', memberId).orderBy('reservationDateTime', 'desc').get(),
            this.db.collection(collections.fines).where('memberId', '==', memberId).orderBy('issuedDateTime', 'desc').get(),
        ]);
        return { loans: loans.docs.map((d) => ({ ...d.data(), loanId: d.id })), reservations: reservations.docs.map((d) => ({ ...d.data(), reservationId: d.id })), fines: fines.docs.map((d) => ({ ...d.data(), fineId: d.id })) };
    }
    async copiesForBook(isbn, status) {
        let query = this.db.collection(collections.copies).where('isbn', '==', isbn);
        if (status)
            query = query.where('status', '==', status);
        const result = await query.orderBy('status').orderBy(FieldPath.documentId()).get();
        return result.docs.map((d) => parseDoc(BookCopyRecordSchema, { ...d.data(), copyId: d.id }));
    }
    async librarianWorkQueue(actor) {
        requireLibrarian(actor);
        const result = await this.db.collection(collections.loans).where('status', '==', 'PENDING_CLOSE').orderBy('borrowDateTime').orderBy(FieldPath.documentId()).get();
        return result.docs.map((d) => ({ ...d.data(), loanId: d.id }));
    }
    async unreadNotifications(actor) {
        requireActive(actor);
        const result = await this.db.collection(collections.notifications).where('recipientUserId', '==', actor.userId).where('read', '==', false).orderBy('createdAt', 'desc').get();
        return result.docs.map((d) => ({ ...d.data(), notificationId: d.id }));
    }
    async pendingReservations(isbn, actor) {
        requireLibrarian(actor);
        const result = await this.db.collection(collections.reservations).where('isbn', '==', isbn).where('status', '==', 'PENDING').orderBy('reservationDateTime').orderBy(FieldPath.documentId()).get();
        return result.docs.map((d) => ({ ...d.data(), reservationId: d.id }));
    }
    async markNotificationRead(notificationId, actor) {
        requireActive(actor);
        const ref = this.db.collection(collections.notifications).doc(notificationId);
        await this.db.runTransaction(async (tx) => {
            const snapshot = await tx.get(ref);
            const notification = parseDoc(NotificationRecordSchema, snapshot.data());
            if (notification.recipientUserId !== actor.userId)
                throw new StorageError('FORBIDDEN', 'Notification belongs to another account.');
            tx.update(ref, { read: true });
        });
    }
}
//# sourceMappingURL=repositories.js.map
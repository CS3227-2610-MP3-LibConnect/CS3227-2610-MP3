import { createHash } from 'node:crypto';
import { FieldPath, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  BookCopyRecordSchema, BookRecordSchema, FineRecordSchema, LoanRecordSchema,
  NotificationRecordSchema, ReservationRecordSchema, UserRecordSchema,
  canonicalizeEmail, canonicalizeIdentity, type BookCopyRecord, type BookRecord,
  type FineRecord, type LoanRecord, type NotificationRecord, type ReservationRecord, type UserRecord,
} from '../../../../packages/shared/src/domain/records.js';

export class StorageError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID', message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

const collections = {
  users: 'users', books: 'books', copies: 'bookCopies', loans: 'loans',
  reservations: 'reservations', fines: 'fines', notifications: 'notifications', identityKeys: 'identityKeys',
} as const;

function hashedKey(kind: string, canonical: string): string {
  return `${kind}_${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function parseDoc<T>(schema: ZodType<T>, value: DocumentData | undefined): T {
  if (!value) throw new StorageError('NOT_FOUND', 'Record was not found.');
  return schema.parse(value);
}

function requireActive(actor: { accountStatus: string }): void {
  if (actor.accountStatus !== 'ACTIVE') throw new StorageError('FORBIDDEN', 'Account is inactive.');
}
function requireLibrarian(actor: { accountType: string; accountStatus: string }): void {
  requireActive(actor);
  if (actor.accountType !== 'LIBRARIAN') throw new StorageError('FORBIDDEN', 'Librarian access is required.');
}
function assertMemberOwnsRecord(actor: { memberId?: string; accountType: string }, memberId: string): void {
  if (actor.accountType === 'MEMBER' && actor.memberId !== memberId) throw new StorageError('FORBIDDEN', 'Members may access only their own records.');
}

async function validateNotificationReference(db: Firestore, notification: NotificationRecord): Promise<void> {
  if (!notification.referenceType || !notification.referenceId) return;
  const collection = { LOAN: collections.loans, RESERVATION: collections.reservations, FINE: collections.fines }[notification.referenceType];
  const snapshot = await db.collection(collection).doc(notification.referenceId).get();
  if (!snapshot.exists) throw new StorageError('INVALID', 'Notification reference does not exist.');
  const record = snapshot.data() as { memberId?: string };
  const expectedType = notification.referenceType === 'LOAN' ? 'OVERDUE_ALERT'
    : notification.referenceType === 'RESERVATION' ? 'RESERVATION_READY'
      : ['FINE_ISSUED', 'FINE_UPDATED'].includes(notification.notificationType) ? notification.notificationType : null;
  if (notification.notificationType !== expectedType || !record.memberId) throw new StorageError('INVALID', 'Reference type does not match the notification context.');
  const recipient = await db.collection(collections.users).where('memberId', '==', record.memberId).limit(1).get();
  if (recipient.docs[0]?.id !== notification.recipientUserId) throw new StorageError('INVALID', 'Reference belongs to another notification recipient.');
}

export class UserRepository {
  constructor(private readonly db: Firestore) {}

  async create(record: UserRecord): Promise<void> {
    const user = UserRecordSchema.parse(record);
    const canonicalEmail = canonicalizeEmail(user.email);
    if (user.email !== user.email.trim() || user.emailCanonical !== canonicalEmail) throw new StorageError('INVALID', 'Email display and canonical values are inconsistent.');
    if (user.employeeId && user.employeeIdCanonical !== canonicalizeIdentity(user.employeeId)) throw new StorageError('INVALID', 'Employee ID canonical value is inconsistent.');
    const emailKey = hashedKey('EMAIL', canonicalEmail);
    const keys = [
      { ref: this.db.collection(collections.identityKeys).doc(emailKey), kind: 'EMAIL', value: canonicalizeEmail(user.email) },
      ...(user.memberId ? [{ ref: this.db.collection(collections.identityKeys).doc(hashedKey('MEMBER_ID', canonicalizeIdentity(user.memberId))), kind: 'MEMBER_ID', value: canonicalizeIdentity(user.memberId) }] : []),
      ...(user.employeeId ? [{ ref: this.db.collection(collections.identityKeys).doc(hashedKey('EMPLOYEE_ID', canonicalizeIdentity(user.employeeId))), kind: 'EMPLOYEE_ID', value: canonicalizeIdentity(user.employeeId) }] : []),
    ];
    const userRef = this.db.collection(collections.users).doc(user.userId);
    await this.db.runTransaction(async (tx) => {
      const existing = await Promise.all(keys.map(({ ref }) => tx.get(ref)));
      if (existing.some((snapshot) => snapshot.exists)) throw new StorageError('CONFLICT', 'An account already uses one of these identities.');
      tx.create(userRef, user);
      keys.forEach(({ ref, kind, value }) => tx.create(ref, {
        kind, canonicalValue: value, ownerUserId: user.userId, createdAt: Timestamp.now(),
      }));
    });
  }

  async getById(userId: string): Promise<UserRecord> {
    const snapshot = await this.db.collection(collections.users).doc(userId).get();
    return parseDoc(UserRecordSchema, snapshot.data());
  }

  async getByEmail(email: string): Promise<UserRecord> {
    const canonical = canonicalizeEmail(email);
    const key = await this.db.collection(collections.identityKeys).doc(hashedKey('EMAIL', canonical)).get();
    if (!key.exists) throw new StorageError('NOT_FOUND', 'Account was not found.');
    const user = await this.getById(String(key.get('ownerUserId')));
    if (user.emailCanonical !== canonical) throw new StorageError('CONFLICT', 'Email identity index is inconsistent.');
    return user;
  }

  async updateEmail(userId: string, displayEmail: string): Promise<void> {
    const email = displayEmail.trim();
    const canonical = canonicalizeEmail(email);
    const newKey = this.db.collection(collections.identityKeys).doc(hashedKey('EMAIL', canonical));
    const userRef = this.db.collection(collections.users).doc(userId);
    await this.db.runTransaction(async (tx) => {
      const [userSnapshot, newKeySnapshot] = await Promise.all([tx.get(userRef), tx.get(newKey)]);
      if (!userSnapshot.exists) throw new StorageError('NOT_FOUND', 'Account was not found.');
      const current = parseDoc(UserRecordSchema, userSnapshot.data());
      const oldKey = this.db.collection(collections.identityKeys).doc(hashedKey('EMAIL', current.emailCanonical));
      const oldKeySnapshot = await tx.get(oldKey);
      if (!oldKeySnapshot.exists || oldKeySnapshot.get('ownerUserId') !== userId) throw new StorageError('CONFLICT', 'Email identity index is inconsistent.');
      if (canonical !== current.emailCanonical && newKeySnapshot.exists) throw new StorageError('CONFLICT', 'Email is already registered.');
      tx.set(userRef, { email, emailCanonical: canonical, updatedAt: Timestamp.now() }, { merge: true });
      if (canonical !== current.emailCanonical) {
        tx.delete(oldKey);
        tx.create(newKey, { kind: 'EMAIL', canonicalValue: canonical, ownerUserId: userId, createdAt: Timestamp.now() });
      }
    });
  }
}

export class LibraryRepository {
  constructor(private readonly db: Firestore) {}

  async createBook(input: Omit<BookRecord, 'createdAt' | 'updatedAt'>, actor: { accountType: string; accountStatus: string }): Promise<BookRecord> {
    requireLibrarian(actor);
    const now = Timestamp.now();
    const value = BookRecordSchema.parse({ ...input, createdAt: now, updatedAt: now });
    const ref = this.db.collection(collections.books).doc(value.isbn);
    await this.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) throw new StorageError('CONFLICT', 'A book with this ISBN already exists.');
      tx.create(ref, value);
    });
    return value;
  }

  async updateBook(isbn: string, patch: Partial<Pick<BookRecord, 'title' | 'author' | 'publicationYear' | 'publisher' | 'category' | 'synopsis'>>, actor: { accountType: string; accountStatus: string }): Promise<BookRecord> {
    requireLibrarian(actor);
    const ref = this.db.collection(collections.books).doc(isbn);
    let result: BookRecord | undefined;
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = parseDoc(BookRecordSchema, snapshot.data());
      result = BookRecordSchema.parse({ ...current, ...patch, updatedAt: Timestamp.now() });
      tx.update(ref, { ...patch, updatedAt: result.updatedAt });
    });
    return result!;
  }

  async deleteBook(isbn: string, actor: { accountType: string; accountStatus: string }): Promise<void> {
    requireLibrarian(actor);
    const ref = this.db.collection(collections.books).doc(isbn);
    const copiesQuery = this.db.collection(collections.copies).where('isbn', '==', isbn);
    const reservationsQuery = this.db.collection(collections.reservations).where('isbn', '==', isbn);
    await this.db.runTransaction(async (tx) => {
      const [book, copies, reservations] = await Promise.all([tx.get(ref), tx.get(copiesQuery), tx.get(reservationsQuery)]);
      if (!book.exists) throw new StorageError('NOT_FOUND', 'Book was not found.');
      if (!copies.empty || !reservations.empty) throw new StorageError('CONFLICT', 'A book cannot be deleted while copies or reservations reference it.');
      tx.delete(ref);
    });
  }

  async getBook(isbn: string): Promise<BookRecord> { return parseDoc(BookRecordSchema, (await this.db.collection(collections.books).doc(isbn).get()).data()); }
  async searchBooksByTitlePrefix(prefix: string, limit = 20, cursor?: { title: string; isbn: string }) {
    const normalized = prefix.trim();
    let query = this.db.collection(collections.books).orderBy('title').orderBy(FieldPath.documentId());
    if (normalized) query = query.startAt(normalized).endAt(`${normalized}\uf8ff`);
    if (cursor) query = query.startAfter(cursor.title, cursor.isbn);
    const result = await query.limit(Math.min(Math.max(limit, 1), 50) + 1).get();
    const hasMore = result.docs.length > Math.min(Math.max(limit, 1), 50);
    const docs = hasMore ? result.docs.slice(0, -1) : result.docs;
    const last = docs.at(-1);
    return {
      items: docs.map((d) => ({ ...d.data(), isbn: d.id })),
      nextCursor: hasMore && last ? { title: String(last.get('title')), isbn: last.id } : null,
    };
  }

  async createCopy(input: { copyId: string; isbn: string; shelfLocation: string }, actor: { accountType: string; accountStatus: string }): Promise<BookCopyRecord> {
    requireLibrarian(actor);
    const copyRef = this.db.collection(collections.copies).doc(input.copyId);
    const bookRef = this.db.collection(collections.books).doc(input.isbn);
    let result: BookCopyRecord | undefined;
    await this.db.runTransaction(async (tx) => {
      const [book, existing] = await Promise.all([tx.get(bookRef), tx.get(copyRef)]);
      if (!book.exists) throw new StorageError('NOT_FOUND', 'Book was not found.');
      if (existing.exists) throw new StorageError('CONFLICT', 'Copy identifier already exists.');
      const now = Timestamp.now();
      result = BookCopyRecordSchema.parse({ ...input, status: 'AVAILABLE', createdAt: now, updatedAt: now });
      tx.create(copyRef, result);
      // Serialize inventory references against a concurrent deleteBook transaction.
      tx.update(bookRef, { updatedAt: now });
    });
    return result!;
  }

  async getCopy(copyId: string): Promise<BookCopyRecord> { return parseDoc(BookCopyRecordSchema, (await this.db.collection(collections.copies).doc(copyId).get()).data()); }

  async updateCopy(copyId: string, shelfLocation: string, actor: { accountType: string; accountStatus: string }): Promise<BookCopyRecord> {
    requireLibrarian(actor);
    const ref = this.db.collection(collections.copies).doc(copyId);
    let result: BookCopyRecord | undefined;
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = parseDoc(BookCopyRecordSchema, snapshot.data());
      const now = Timestamp.now();
      result = BookCopyRecordSchema.parse({ ...current, shelfLocation, updatedAt: now });
      tx.update(ref, { shelfLocation, updatedAt: now });
    });
    return result!;
  }

  async deleteCopy(copyId: string, actor: { accountType: string; accountStatus: string }): Promise<void> {
    requireLibrarian(actor);
    const copyRef = this.db.collection(collections.copies).doc(copyId);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(copyRef);
      const copy = parseDoc(BookCopyRecordSchema, snapshot.data());
      if (!['AVAILABLE', 'DAMAGED', 'LOST'].includes(copy.status)) {
        throw new StorageError('CONFLICT', 'A copy can be deleted only when AVAILABLE, DAMAGED, or LOST.');
      }
      const bookRef = this.db.collection(collections.books).doc(copy.isbn);
      const book = await tx.get(bookRef);
      tx.delete(copyRef);
      if (book.exists) tx.update(bookRef, { updatedAt: Timestamp.now() });
    });
  }
  async getLoan(loanId: string, actor: { userId: string; memberId?: string; accountType: string; accountStatus: string }): Promise<LoanRecord> {
    requireActive(actor);
    const value = parseDoc(LoanRecordSchema, (await this.db.collection(collections.loans).doc(loanId).get()).data());
    assertMemberOwnsRecord(actor, value.memberId);
    return value;
  }
  async createReservation(reservation: ReservationRecord, actor: { accountType: string; accountStatus: string }): Promise<void> {
    requireLibrarian(actor);
    const value = ReservationRecordSchema.parse(reservation);
    if (value.status !== 'PENDING' || value.copyId !== null || value.expiryDate !== null) throw new StorageError('INVALID', 'A new reservation must be pending and unassigned.');
    const reservationRef = this.db.collection(collections.reservations).doc(value.reservationId);
    const bookRef = this.db.collection(collections.books).doc(value.isbn);
    const memberQuery = this.db.collection(collections.users).where('memberId', '==', value.memberId).limit(1);
    await this.db.runTransaction(async (tx) => {
      const [book, member, existing] = await Promise.all([tx.get(bookRef), tx.get(memberQuery), tx.get(reservationRef)]);
      if (!book.exists) throw new StorageError('INVALID', 'Reservation references an unknown ISBN.');
      if (!member.docs[0] || member.docs[0].get('accountType') !== 'MEMBER' || member.docs[0].get('accountStatus') !== 'ACTIVE') throw new StorageError('INVALID', 'An active member is required.');
      if (existing.exists) throw new StorageError('CONFLICT', 'Reservation identifier already exists.');
      const now = Timestamp.now();
      tx.create(reservationRef, { ...value, reservationDateTime: now });
      // Serialize reservation creation against a concurrent deleteBook transaction.
      tx.update(bookRef, { updatedAt: now });
    });
  }
  async getReservation(reservationId: string, actor: { userId: string; memberId?: string; accountType: string; accountStatus: string }): Promise<ReservationRecord> {
    requireActive(actor);
    const value = parseDoc(ReservationRecordSchema, (await this.db.collection(collections.reservations).doc(reservationId).get()).data());
    assertMemberOwnsRecord(actor, value.memberId);
    return value;
  }
  async getFine(fineId: string, actor: { userId: string; memberId?: string; accountType: string; accountStatus: string }): Promise<FineRecord> {
    requireActive(actor);
    const value = parseDoc(FineRecordSchema, (await this.db.collection(collections.fines).doc(fineId).get()).data());
    assertMemberOwnsRecord(actor, value.memberId);
    return value;
  }
  async putNotification(notification: NotificationRecord, actor: { accountType: string; accountStatus: string }): Promise<void> {
    requireLibrarian(actor);
    const value = NotificationRecordSchema.parse(notification);
    await validateNotificationReference(this.db, value);
    await this.db.collection(collections.notifications).doc(value.notificationId).set(value);
  }
  async getNotification(notificationId: string, actor: { userId: string; accountType: string; accountStatus: string }): Promise<NotificationRecord> {
    requireActive(actor);
    const value = parseDoc(NotificationRecordSchema, (await this.db.collection(collections.notifications).doc(notificationId).get()).data());
    if (actor.accountType === 'MEMBER' && value.recipientUserId !== actor.userId) throw new StorageError('FORBIDDEN', 'Members may access only their own notifications.');
    return value;
  }

  async memberActivity(memberId: string, actor: { userId: string; memberId?: string; accountType: string; accountStatus: string }) {
    requireActive(actor);
    assertMemberOwnsRecord(actor, memberId);
    const [loans, reservations, fines] = await Promise.all([
      this.db.collection(collections.loans).where('memberId', '==', memberId).orderBy('borrowDateTime', 'desc').get(),
      this.db.collection(collections.reservations).where('memberId', '==', memberId).orderBy('reservationDateTime', 'desc').get(),
      this.db.collection(collections.fines).where('memberId', '==', memberId).orderBy('issuedDateTime', 'desc').get(),
    ]);
    return { loans: loans.docs.map((d) => ({ ...d.data(), loanId: d.id })), reservations: reservations.docs.map((d) => ({ ...d.data(), reservationId: d.id })), fines: fines.docs.map((d) => ({ ...d.data(), fineId: d.id })) };
  }

  async copiesForBook(isbn: string) {
    const result = await this.db.collection(collections.copies).where('isbn', '==', isbn).orderBy('status').orderBy(FieldPath.documentId()).get();
    return result.docs.map((d) => parseDoc(BookCopyRecordSchema, { ...d.data(), copyId: d.id }));
  }

  async librarianWorkQueue(actor: { accountType: string; accountStatus: string }) {
    requireLibrarian(actor);
    const result = await this.db.collection(collections.loans).where('status', '==', 'PENDING_CLOSE').orderBy('borrowDateTime').orderBy(FieldPath.documentId()).get();
    return result.docs.map((d) => ({ ...d.data(), loanId: d.id }));
  }

  async unreadNotifications(actor: { userId: string; accountType: string; accountStatus: string }) {
    requireActive(actor);
    const result = await this.db.collection(collections.notifications).where('recipientUserId', '==', actor.userId).where('read', '==', false).orderBy('createdAt', 'desc').get();
    return result.docs.map((d) => ({ ...d.data(), notificationId: d.id }));
  }

  async pendingReservations(isbn: string, actor: { accountType: string; accountStatus: string }) {
    requireLibrarian(actor);
    const result = await this.db.collection(collections.reservations).where('isbn', '==', isbn).where('status', '==', 'PENDING').orderBy('reservationDateTime').orderBy(FieldPath.documentId()).get();
    return result.docs.map((d) => ({ ...d.data(), reservationId: d.id }));
  }

  async markNotificationRead(notificationId: string, actor: { userId: string; accountType: string; accountStatus: string }): Promise<void> {
    requireActive(actor);
    const ref = this.db.collection(collections.notifications).doc(notificationId);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const notification = parseDoc(NotificationRecordSchema, snapshot.data());
      if (notification.recipientUserId !== actor.userId) throw new StorageError('FORBIDDEN', 'Notification belongs to another account.');
      tx.update(ref, { read: true });
    });
  }
}


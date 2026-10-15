import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { type BookCopyRecord, type BookRecord, type FineRecord, type LoanRecord, type NotificationRecord, type ReservationRecord, type UserRecord } from '../../../../packages/shared/src/domain/records.js';
export declare class StorageError extends Error {
    readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID';
    constructor(code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID', message: string);
}
export declare class UserRepository {
    private readonly db;
    constructor(db: Firestore);
    create(record: UserRecord): Promise<void>;
    getById(userId: string): Promise<UserRecord>;
    getByEmail(email: string): Promise<UserRecord>;
    updateEmail(userId: string, displayEmail: string): Promise<void>;
}
export declare class LibraryRepository {
    private readonly db;
    constructor(db: Firestore);
    createBook(input: Omit<BookRecord, 'createdAt' | 'updatedAt'>, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<BookRecord>;
    updateBook(isbn: string, patch: Partial<Pick<BookRecord, 'title' | 'author' | 'publicationYear' | 'publisher' | 'category' | 'synopsis'>>, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<BookRecord>;
    deleteBook(isbn: string, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<void>;
    getBook(isbn: string): Promise<BookRecord>;
    searchBooksByTitlePrefix(prefix: string, limit?: number, cursor?: {
        title: string;
        isbn: string;
    }): Promise<{
        items: {
            isbn: string;
        }[];
        nextCursor: {
            title: string;
            isbn: string;
        } | null;
    }>;
    createCopy(input: {
        copyId: string;
        isbn: string;
        shelfLocation: string;
    }, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<BookCopyRecord>;
    getCopy(copyId: string): Promise<BookCopyRecord>;
    updateCopy(copyId: string, shelfLocation: string, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<BookCopyRecord>;
    deleteCopy(copyId: string, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<void>;
    getLoan(loanId: string, actor: {
        userId: string;
        memberId?: string;
        accountType: string;
        accountStatus: string;
    }): Promise<LoanRecord>;
    createReservation(reservation: ReservationRecord, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<void>;
    getReservation(reservationId: string, actor: {
        userId: string;
        memberId?: string;
        accountType: string;
        accountStatus: string;
    }): Promise<ReservationRecord>;
    getFine(fineId: string, actor: {
        userId: string;
        memberId?: string;
        accountType: string;
        accountStatus: string;
    }): Promise<FineRecord>;
    putNotification(notification: NotificationRecord, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<void>;
    getNotification(notificationId: string, actor: {
        userId: string;
        accountType: string;
        accountStatus: string;
    }): Promise<NotificationRecord>;
    memberActivity(memberId: string, actor: {
        userId: string;
        memberId?: string;
        accountType: string;
        accountStatus: string;
    }): Promise<{
        loans: {
            loanId: string;
        }[];
        reservations: {
            reservationId: string;
        }[];
        fines: {
            fineId: string;
        }[];
    }>;
    copiesForBook(isbn: string): Promise<{
        copyId: string;
        isbn: string;
        shelfLocation: string;
        status: "AVAILABLE" | "IN_TRANSIT" | "ON_LOAN" | "DAMAGED" | "LOST" | "RESERVED";
        createdAt: Timestamp;
        updatedAt: Timestamp;
        reservationId?: string | null | undefined;
    }[]>;
    librarianWorkQueue(actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<{
        loanId: string;
    }[]>;
    unreadNotifications(actor: {
        userId: string;
        accountType: string;
        accountStatus: string;
    }): Promise<{
        notificationId: string;
    }[]>;
    pendingReservations(isbn: string, actor: {
        accountType: string;
        accountStatus: string;
    }): Promise<{
        reservationId: string;
    }[]>;
    markNotificationRead(notificationId: string, actor: {
        userId: string;
        accountType: string;
        accountStatus: string;
    }): Promise<void>;
}

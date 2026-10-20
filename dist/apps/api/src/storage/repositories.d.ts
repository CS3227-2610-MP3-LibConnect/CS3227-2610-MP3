import { Timestamp } from 'firebase-admin/firestore';
export declare class StorageError extends Error {
    code: any;
    constructor(code: any, message: any);
}
export declare class UserRepository {
    db: any;
    constructor(db: any);
    create(record: any): Promise<void>;
    getById(userId: any): Promise<any>;
    listLibrarians(): Promise<any>;
    getByEmail(email: any): Promise<any>;
    updateEmail(userId: any, displayEmail: any): Promise<void>;
}
export declare class LibraryRepository {
    db: any;
    constructor(db: any);
    createBook(input: any, actor: any): Promise<{
        isbn: string;
        title: string;
        publicationYear: number;
        publisher: string;
        category: string;
        synopsis: string;
        createdAt: Timestamp;
        updatedAt: Timestamp;
        author?: string | string[];
    }>;
    updateBook(isbn: any, patch: any, actor: any): Promise<any>;
    deleteBook(isbn: any, actor: any): Promise<void>;
    getBook(isbn: any): Promise<any>;
    searchBooks(filters: any, limit: number, cursor: any): Promise<{
        items: any[];
        nextCursor: {
            filterKey: string;
            lastId: any;
        };
    }>;
    searchCopies(filters: any, limit: number, cursor: any): Promise<{
        items: any[];
        nextCursor: {
            filterKey: string;
            lastId: any;
        };
    }>;
    scanCatalog(query: any, kind: any, filters: any, limit: any, cursor: any): Promise<{
        items: any[];
        nextCursor: {
            filterKey: string;
            lastId: any;
        };
    }>;
    createCopy(input: any, actor: any): Promise<any>;
    getCopy(copyId: any): Promise<any>;
    updateCopy(copyId: any, shelfLocation: any, actor: any): Promise<any>;
    deleteCopy(copyId: any, actor: any): Promise<void>;
    getLoan(loanId: any, actor: any): Promise<any>;
    createReservation(reservation: any, actor: any): Promise<void>;
    getReservation(reservationId: any, actor: any): Promise<any>;
    getFine(fineId: any, actor: any): Promise<any>;
    putNotification(notification: any, actor: any): Promise<void>;
    getNotification(notificationId: any, actor: any): Promise<any>;
    memberActivity(memberId: any, actor: any): Promise<{
        loans: any;
        reservations: any;
        fines: any;
    }>;
    copiesForBook(isbn: any, status: any): Promise<any>;
    librarianWorkQueue(actor: any): Promise<any>;
    unreadNotifications(actor: any): Promise<any>;
    pendingReservations(isbn: any, actor: any): Promise<any>;
    markNotificationRead(notificationId: any, actor: any): Promise<void>;
}

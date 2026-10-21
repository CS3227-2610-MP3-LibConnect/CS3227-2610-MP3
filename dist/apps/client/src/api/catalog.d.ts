export type CopyStatus = 'AVAILABLE' | 'IN_TRANSIT' | 'ON_LOAN' | 'DAMAGED' | 'LOST' | 'RESERVED';
export interface BookFilters {
    title?: string;
    author?: string;
    publisher?: string;
    category?: string;
    isbn?: string;
    publicationYear?: number;
    limit?: number;
    cursor?: string;
}
export interface CopyFilters {
    shelfLocation?: string;
    isbn?: string;
    copyId?: string;
    status?: CopyStatus;
    limit?: number;
    cursor?: string;
}
export interface Page<T> {
    items: T[];
    page: {
        limit: number;
        nextCursor: string | null;
    };
}
export interface BookRecord {
    isbn: string;
    title: string;
    author: string | string[];
    publicationYear: number;
    publisher: string;
    category: string;
    synopsis: string;
    createdAt?: string;
    updatedAt?: string;
}
export interface BookCopyRecord {
    copyId: string;
    isbn: string;
    shelfLocation: string;
    status: CopyStatus;
    reservationId?: string | null;
    createdAt?: string;
    updatedAt?: string;
}
export interface BookAvailability {
    totalCopies: number;
    availableCount: number;
    byStatus: Record<CopyStatus, number>;
}
export interface BookDetail {
    book: BookRecord;
    copies: BookCopyRecord[];
    availability: BookAvailability;
}
export interface InventorySummary {
    totalTitles: number;
    totalCopies: number;
    availableCopies: number;
    byStatus: Record<CopyStatus, number>;
}
export declare const catalogApi: {
    listBooks<T>(filters?: BookFilters): Promise<Page<T>>;
    listCopies<T>(filters?: CopyFilters): Promise<Page<T>>;
    copiesForBook<T>(isbn: string, status?: CopyStatus): Promise<{
        isbn: string;
        items: T[];
    }>;
    getBook(isbn: string): Promise<BookDetail>;
    createBook(input: Omit<BookRecord, "createdAt" | "updatedAt">): Promise<BookRecord>;
    updateBook(isbn: string, input: Partial<Omit<BookRecord, "isbn" | "createdAt" | "updatedAt">>): Promise<BookRecord>;
    deleteBook(isbn: string): Promise<void>;
    createCopy(isbn: string, shelfLocation: string): Promise<BookCopyRecord>;
    updateCopy(copyId: string, shelfLocation: string): Promise<BookCopyRecord>;
    deleteCopy(copyId: string): Promise<void>;
    inventorySummary(): Promise<InventorySummary>;
};

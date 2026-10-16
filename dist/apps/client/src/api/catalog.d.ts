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
export declare const catalogApi: {
    listBooks<T>(filters?: BookFilters): Promise<Page<T>>;
    listCopies<T>(filters?: CopyFilters): Promise<Page<T>>;
    copiesForBook<T>(isbn: string, status?: CopyStatus): Promise<{
        isbn: string;
        items: T[];
    }>;
};

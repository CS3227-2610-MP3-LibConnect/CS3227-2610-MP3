export type CopyStatus = 'AVAILABLE' | 'IN_TRANSIT' | 'ON_LOAN' | 'DAMAGED' | 'LOST' | 'RESERVED';

export interface BookFilters {
  title?: string;
  author?: string;
  publisher?: string;
  category?: string;
  isbn?: string;
  publicationYear?: number;
  publicationYearFrom?: number;
  publicationYearTo?: number;
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
  page: { limit: number; nextCursor: string | null };
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

import { apiRequest } from './base.js';

function queryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export const catalogApi = {
  listBooks<T>(filters: BookFilters = {}): Promise<Page<T>> {
    const hasYearFrom = filters.publicationYearFrom !== undefined;
    const hasYearTo = filters.publicationYearTo !== undefined;
    const hasYearRange = hasYearFrom || hasYearTo;

    if (hasYearFrom !== hasYearTo) {
      throw new RangeError('Publication year range requires both publicationYearFrom and publicationYearTo.');
    }
    if (hasYearRange && filters.publicationYear !== undefined) {
      throw new RangeError('Use either publicationYear or a publication year range, not both.');
    }

    const query = queryString(filters);
    return apiRequest(`/books${query ? `?${query}` : ''}`);
  },
  listCopies<T>(filters: CopyFilters = {}): Promise<Page<T>> {
    const query = queryString(filters);
    return apiRequest(`/copies${query ? `?${query}` : ''}`);
  },
  copiesForBook<T>(isbn: string, status?: CopyStatus): Promise<{ isbn: string; items: T[] }> {
    const query = status ? `?${queryString({ status })}` : '';
    return apiRequest(`/books/${encodeURIComponent(isbn)}/copies${query}`);
  },
  getBook<T>(isbn: string): Promise<T> {
    return apiRequest(`/books/${encodeURIComponent(isbn)}`);
  },
  createBook(input: Omit<BookRecord, 'createdAt' | 'updatedAt'>): Promise<BookRecord> {
    return apiRequest('/books', { method: 'POST', body: JSON.stringify(input) });
  },
  updateBook(isbn: string, input: Partial<Omit<BookRecord, 'isbn' | 'createdAt' | 'updatedAt'>>): Promise<BookRecord> {
    return apiRequest(`/books/${encodeURIComponent(isbn)}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  deleteBook(isbn: string): Promise<void> {
    return apiRequest(`/books/${encodeURIComponent(isbn)}`, { method: 'DELETE' });
  },
  createCopy(isbn: string, shelfLocation: string): Promise<BookCopyRecord> {
    return apiRequest(`/books/${encodeURIComponent(isbn)}/copies`, { method: 'POST', body: JSON.stringify({ shelfLocation }) });
  },
  updateCopy(copyId: string, shelfLocation: string): Promise<BookCopyRecord> {
    return apiRequest(`/copies/${encodeURIComponent(copyId)}`, { method: 'PATCH', body: JSON.stringify({ shelfLocation }) });
  },
  deleteCopy(copyId: string): Promise<void> {
    return apiRequest(`/copies/${encodeURIComponent(copyId)}`, { method: 'DELETE' });
  },
  inventorySummary(): Promise<InventorySummary> {
    return apiRequest('/librarian/inventory/summary');
  },
};

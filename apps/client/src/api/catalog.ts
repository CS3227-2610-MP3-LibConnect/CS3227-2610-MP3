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
  page: { limit: number; nextCursor: string | null };
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
};

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

function queryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export const catalogApi = {
  listBooks<T>(filters: BookFilters = {}): Promise<Page<T>> {
    const query = queryString(filters);
    return getJson(`/books${query ? `?${query}` : ''}`);
  },
  listCopies<T>(filters: CopyFilters = {}): Promise<Page<T>> {
    const query = queryString(filters);
    return getJson(`/copies${query ? `?${query}` : ''}`);
  },
  copiesForBook<T>(isbn: string, status?: CopyStatus): Promise<{ isbn: string; items: T[] }> {
    const query = status ? `?${queryString({ status })}` : '';
    return getJson(`/books/${encodeURIComponent(isbn)}/copies${query}`);
  },
};

import { apiRequest } from './base.js';
function queryString(filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '')
            params.set(key, String(value));
    }
    return params.toString();
}
export const catalogApi = {
    listBooks(filters = {}) {
        const query = queryString(filters);
        return apiRequest(`/books${query ? `?${query}` : ''}`);
    },
    listCopies(filters = {}) {
        const query = queryString(filters);
        return apiRequest(`/copies${query ? `?${query}` : ''}`);
    },
    copiesForBook(isbn, status) {
        const query = status ? `?${queryString({ status })}` : '';
        return apiRequest(`/books/${encodeURIComponent(isbn)}/copies${query}`);
    },
};
//# sourceMappingURL=catalog.js.map
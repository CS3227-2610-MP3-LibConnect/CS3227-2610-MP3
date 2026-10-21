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
    getBook(isbn) {
        return apiRequest(`/books/${encodeURIComponent(isbn)}`);
    },
    createBook(input) {
        return apiRequest('/books', { method: 'POST', body: JSON.stringify(input) });
    },
    updateBook(isbn, input) {
        return apiRequest(`/books/${encodeURIComponent(isbn)}`, { method: 'PATCH', body: JSON.stringify(input) });
    },
    deleteBook(isbn) {
        return apiRequest(`/books/${encodeURIComponent(isbn)}`, { method: 'DELETE' });
    },
    createCopy(isbn, shelfLocation) {
        return apiRequest(`/books/${encodeURIComponent(isbn)}/copies`, { method: 'POST', body: JSON.stringify({ shelfLocation }) });
    },
    updateCopy(copyId, shelfLocation) {
        return apiRequest(`/copies/${encodeURIComponent(copyId)}`, { method: 'PATCH', body: JSON.stringify({ shelfLocation }) });
    },
    deleteCopy(copyId) {
        return apiRequest(`/copies/${encodeURIComponent(copyId)}`, { method: 'DELETE' });
    },
    inventorySummary() {
        return apiRequest('/librarian/inventory/summary');
    },
};
//# sourceMappingURL=catalog.js.map
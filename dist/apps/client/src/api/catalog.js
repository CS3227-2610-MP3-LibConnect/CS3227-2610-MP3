function queryString(filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '')
            params.set(key, String(value));
    }
    return params.toString();
}
async function getJson(path) {
    const response = await fetch(`/api/v1${path}`, { credentials: 'include' });
    if (!response.ok)
        throw new Error(`Catalog request failed (${response.status}).`);
    return response.json();
}
export const catalogApi = {
    listBooks(filters = {}) {
        const query = queryString(filters);
        return getJson(`/books${query ? `?${query}` : ''}`);
    },
    listCopies(filters = {}) {
        const query = queryString(filters);
        return getJson(`/copies${query ? `?${query}` : ''}`);
    },
    copiesForBook(isbn, status) {
        const query = status ? `?${queryString({ status })}` : '';
        return getJson(`/books/${encodeURIComponent(isbn)}/copies${query}`);
    },
};
//# sourceMappingURL=catalog.js.map
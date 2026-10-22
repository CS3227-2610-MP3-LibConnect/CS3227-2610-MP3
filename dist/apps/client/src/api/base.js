import { ApiClientError } from './errors.js';
export { ApiClientError } from './errors.js';
const apiOrigin = import.meta.env?.VITE_API_ORIGIN ?? (typeof window === 'undefined' ? 'http://localhost:3000' : '');
if (!apiOrigin) {
    throw new Error('VITE_API_ORIGIN must be configured for the client.');
}
export function apiUrl(path) {
    return new URL(`/api/v1${path}`, apiOrigin).toString();
}
export async function apiRequest(path, init = {}) {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
    const response = await fetch(apiUrl(path), {
        ...init,
        headers,
        credentials: 'include',
    });
    if (!response.ok) {
        let payload;
        try {
            payload = await response.json();
        }
        catch {
            payload = undefined;
        }
        if (response.status === 401 && path !== '/auth/login' && path !== '/auth/session') {
            window.dispatchEvent(new Event('libconnect:unauthorized'));
        }
        throw new ApiClientError(response.status, payload);
    }
    if (response.status === 204)
        return undefined;
    return await response.json();
}
//# sourceMappingURL=base.js.map
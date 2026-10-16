export { ApiClientError } from './errors.js';
export declare function apiUrl(path: string): string;
export declare function apiRequest<T>(path: string, init?: RequestInit): Promise<T>;

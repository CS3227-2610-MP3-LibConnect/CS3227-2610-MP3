import { type BookRecord } from '../api/catalog.js';
type BookFormValues = Omit<BookRecord, 'createdAt' | 'updatedAt'>;
export declare function validateBookForm(values: BookFormValues, editing: boolean): Record<string, string>;
export declare function LibrarianCatalogInventoryPage(): import("react").JSX.Element;
export {};

import { type BookFilters } from '../api/catalog.js';
export interface MemberSearchValues {
    title?: string;
    author?: string;
    publisher?: string;
    category?: string;
    isbn?: string;
    publicationYear?: string;
    publicationYearFrom?: string;
    publicationYearTo?: string;
}
export declare function buildMemberBookFilters(values: MemberSearchValues, options?: {
    advancedSearchExpanded?: boolean;
}): BookFilters;
export declare function MemberDashboard(): import("react").JSX.Element;

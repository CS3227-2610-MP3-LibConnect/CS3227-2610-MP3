import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../api/catalog.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { useAuth } from '../auth/AuthContext.js';
const emptySearchValues = {
    title: '', author: '', publisher: '', category: '', isbn: '',
    publicationYear: '', publicationYearFrom: '', publicationYearTo: '',
};
function parseYear(value, label) {
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    if (!/^\d+$/.test(trimmed))
        throw new RangeError(`Enter a valid year for ${label}.`);
    const year = Number(trimmed);
    if (!Number.isSafeInteger(year) || year > 9999)
        throw new RangeError(`Enter a valid year for ${label}.`);
    return year;
}
export function buildMemberBookFilters(values, options = {}) {
    const filters = {};
    const fields = options.advancedSearchExpanded === false
        ? ['title']
        : ['title', 'author', 'publisher', 'category', 'isbn'];
    for (const field of fields) {
        const value = values[field]?.trim();
        if (value)
            filters[field] = value;
    }
    if (options.advancedSearchExpanded === false)
        return filters;
    const exactYear = parseYear(values.publicationYear ?? '', 'publication year');
    const yearFrom = parseYear(values.publicationYearFrom ?? '', 'start year');
    const yearTo = parseYear(values.publicationYearTo ?? '', 'end year');
    const hasRangeBound = yearFrom !== undefined || yearTo !== undefined;
    if (exactYear !== undefined && hasRangeBound) {
        throw new RangeError('Choose either exact year or a range.');
    }
    if (hasRangeBound && (yearFrom === undefined || yearTo === undefined)) {
        throw new RangeError('A year range requires both a start year and an end year.');
    }
    if (yearFrom !== undefined && yearTo !== undefined) {
        if (yearFrom > yearTo)
            throw new RangeError('The start year cannot exceed the end year.');
        filters.publicationYearFrom = yearFrom;
        filters.publicationYearTo = yearTo;
    }
    else if (exactYear !== undefined) {
        filters.publicationYear = exactYear;
    }
    return filters;
}
export function MemberDashboard() {
    const { user, logout } = useAuth();
    const advancedSearchRef = useRef(null);
    const [values, setValues] = useState(emptySearchValues);
    const [submittedFilters, setSubmittedFilters] = useState({});
    const [page, setPage] = useState(null);
    const [initialLoading, setInitialLoading] = useState(true);
    const [moreLoading, setMoreLoading] = useState(false);
    const [moreError, setMoreError] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [rangeError, setRangeError] = useState('');
    const requestSequence = useRef(0);
    const loadFirstPage = async (filters) => {
        const sequence = ++requestSequence.current;
        setPage(null);
        setSearchError('');
        setInitialLoading(true);
        setMoreLoading(false);
        setMoreError(false);
        try {
            const result = await catalogApi.listBooks(filters);
            if (requestSequence.current === sequence)
                setPage(result);
        }
        catch {
            if (requestSequence.current === sequence)
                setSearchError('We could not search the catalog. Please try again.');
        }
        finally {
            if (requestSequence.current === sequence)
                setInitialLoading(false);
        }
    };
    const loadNextPage = async () => {
        if (!page?.page.nextCursor || moreLoading)
            return;
        const sequence = requestSequence.current;
        setMoreLoading(true);
        setMoreError(false);
        try {
            const result = await catalogApi.listBooks({
                ...submittedFilters,
                cursor: page.page.nextCursor,
                limit: page.page.limit,
            });
            if (requestSequence.current !== sequence)
                return;
            setPage((current) => {
                if (!current)
                    return result;
                const seenIsbns = new Set(current.items.map((book) => book.isbn));
                const additions = result.items.filter((book) => {
                    if (seenIsbns.has(book.isbn))
                        return false;
                    seenIsbns.add(book.isbn);
                    return true;
                });
                return {
                    items: [...current.items, ...additions],
                    page: result.page,
                };
            });
        }
        catch {
            if (requestSequence.current === sequence)
                setMoreError(true);
        }
        finally {
            if (requestSequence.current === sequence)
                setMoreLoading(false);
        }
    };
    useEffect(() => {
        if (user?.accountType === 'MEMBER')
            void loadFirstPage({});
    }, [user?.accountType]);
    if (!user || user.accountType !== 'MEMBER')
        return null;
    const books = page?.items ?? [];
    const updateValue = (field, value) => {
        setValues((current) => ({ ...current, [field]: value }));
        if (field === 'publicationYear')
            setRangeError('');
        if (field === 'publicationYearFrom' || field === 'publicationYearTo')
            setRangeError('');
    };
    const submitSearch = (event) => {
        event.preventDefault();
        try {
            const filters = buildMemberBookFilters(values, {
                advancedSearchExpanded: advancedSearchRef.current?.open ?? false,
            });
            setRangeError('');
            setSubmittedFilters(filters);
            void loadFirstPage(filters);
        }
        catch (error) {
            setRangeError(error instanceof Error ? error.message : 'Check the publication year filters.');
        }
    };
    const clearSearch = () => {
        setValues(emptySearchValues);
        setRangeError('');
        setSubmittedFilters({});
        void loadFirstPage({});
    };
    const hasRange = Boolean(values.publicationYearFrom || values.publicationYearTo);
    const hasExactYear = Boolean(values.publicationYear);
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsxs("section", { className: "member-dashboard-content", "aria-labelledby": "member-greeting", children: [_jsx("p", { className: "eyebrow", children: "YOUR LIBRARY, CONNECTED" }), _jsxs("h1", { id: "member-greeting", children: ["Welcome back, ", user.name] }), _jsxs("form", { className: "member-search-form", "aria-label": "Search the catalog", onSubmit: submitSearch, children: [_jsxs("label", { className: "field member-title-search", children: [_jsx("span", { children: "Title contains" }), _jsx("input", { name: "title", type: "search", value: values.title, onChange: (event) => updateValue('title', event.target.value), placeholder: "Search book titles" })] }), _jsxs("details", { className: "member-advanced-search", ref: advancedSearchRef, children: [_jsx("summary", { children: "Advanced search" }), _jsxs("div", { className: "member-filter-grid", children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Author contains" }), _jsx("input", { name: "author", value: values.author, onChange: (event) => updateValue('author', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Publisher contains" }), _jsx("input", { name: "publisher", value: values.publisher, onChange: (event) => updateValue('publisher', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Category contains" }), _jsx("input", { name: "category", value: values.category, onChange: (event) => updateValue('category', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Exact ISBN" }), _jsx("input", { name: "isbn", value: values.isbn, onChange: (event) => updateValue('isbn', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Exact publication year" }), _jsx("input", { name: "publicationYear", type: "number", min: "0", max: "9999", step: "1", inputMode: "numeric", value: values.publicationYear, disabled: hasRange, onChange: (event) => updateValue('publicationYear', event.target.value) })] }), _jsxs("fieldset", { className: "member-year-range", disabled: hasExactYear, "aria-describedby": rangeError ? 'member-year-error' : undefined, children: [_jsx("legend", { children: "Publication year range" }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "From year" }), _jsx("input", { name: "publicationYearFrom", type: "number", min: "0", max: "9999", step: "1", inputMode: "numeric", value: values.publicationYearFrom, onChange: (event) => updateValue('publicationYearFrom', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "To year" }), _jsx("input", { name: "publicationYearTo", type: "number", min: "0", max: "9999", step: "1", inputMode: "numeric", value: values.publicationYearTo, onChange: (event) => updateValue('publicationYearTo', event.target.value) })] })] })] })] }), rangeError && _jsx("p", { id: "member-year-error", className: "form-error", role: "alert", children: rangeError }), searchError && _jsx("p", { className: "form-error", role: "alert", children: searchError }), _jsxs("div", { className: "member-search-actions", children: [_jsx("button", { className: "primary-button", type: "submit", children: "Search" }), _jsx("button", { className: "text-button", type: "button", onClick: clearSearch, children: "Clear filters" })] })] }), _jsxs("section", { className: "member-catalog-results", "aria-label": "Catalog results", "aria-busy": initialLoading || moreLoading, children: [initialLoading && _jsx("p", { role: "status", children: "Loading catalog\u2026" }), !initialLoading && searchError && (_jsxs("div", { className: "member-result-error", role: "alert", children: [_jsx("p", { children: searchError }), _jsx("button", { className: "text-button", type: "button", onClick: () => void loadFirstPage(submittedFilters), children: "Try again" })] })), !initialLoading && !searchError && page && books.length === 0 && (_jsx("p", { className: "member-result-message", children: "No books match these filters." })), books.length > 0 && (_jsx("div", { className: "member-book-grid", children: books.map((book) => (_jsxs(Link, { className: "member-book-card", to: `/member/books/${encodeURIComponent(book.isbn)}`, children: [_jsx("div", { className: "member-book-cover", role: "img", "aria-label": "Book cover placeholder", children: "Cover image unavailable" }), _jsxs("div", { className: "member-book-card-content", children: [_jsx("h2", { children: book.title }), _jsx("p", { className: "member-book-category", children: book.category }), _jsx("p", { className: "member-book-synopsis", children: book.synopsis })] })] }, book.isbn))) })), !initialLoading && !searchError && page?.page.nextCursor && (_jsxs("div", { className: "member-pagination", children: [moreError && _jsx("p", { className: "form-error", role: "alert", children: "Could not load more books." }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void loadNextPage(), disabled: moreLoading, children: moreLoading ? 'Loading books…' : moreError ? 'Try again' : 'Load more books' })] })), !initialLoading && !searchError && page && books.length > 0 && !page.page.nextCursor && (_jsx("p", { className: "member-result-message", children: "End of results. You\u2019ve seen all matching books." }))] }), _jsx("span", { className: "sr-only", "aria-live": "polite", children: page ? `${page.items.length} catalog results loaded.` : '' }), _jsx("span", { className: "sr-only", "data-filter-count": Object.keys(submittedFilters).length })] })] }));
}
//# sourceMappingURL=MemberDashboard.js.map
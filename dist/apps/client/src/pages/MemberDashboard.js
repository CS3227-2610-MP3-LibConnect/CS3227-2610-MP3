import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../api/catalog.js';
import { notificationsApi } from '../api/notifications.js';
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
    const [notificationPreview, setNotificationPreview] = useState(null);
    const [notificationLoading, setNotificationLoading] = useState(true);
    const [notificationError, setNotificationError] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState([]);
    const [historyCursor, setHistoryCursor] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(false);
    const [detailNotification, setDetailNotification] = useState(null);
    const [detailNotificationId, setDetailNotificationId] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(false);
    const [readError, setReadError] = useState(false);
    const historyRequestInFlight = useRef(false);
    const readRequestsRef = useRef(new Set());
    const detailRequestSequence = useRef(0);
    const historyTriggerRef = useRef(null);
    const historyDialogRef = useRef(null);
    const detailTriggerRef = useRef(null);
    const detailDialogRef = useRef(null);
    const focusRestoreRef = useRef(null);
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
    const loadNotificationPreview = async () => {
        setNotificationLoading(true);
        setNotificationError(false);
        try {
            setNotificationPreview(await notificationsApi.getPreview());
        }
        catch {
            setNotificationError(true);
        }
        finally {
            setNotificationLoading(false);
        }
    };
    const loadHistoryPage = async (cursor) => {
        if (historyRequestInFlight.current || (cursor === undefined && historyItems.length > 0))
            return;
        historyRequestInFlight.current = true;
        setHistoryLoading(true);
        setHistoryError(false);
        try {
            const result = await notificationsApi.list({ limit: 20, ...(cursor ? { cursor } : {}) });
            setHistoryItems((current) => {
                const known = new Set(current.map((item) => item.notificationId));
                return cursor ? [...current, ...result.items.filter((item) => !known.has(item.notificationId))] : result.items;
            });
            setHistoryCursor(result.page.nextCursor);
        }
        catch {
            setHistoryError(true);
        }
        finally {
            historyRequestInFlight.current = false;
            setHistoryLoading(false);
        }
    };
    const openHistory = () => {
        historyTriggerRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
        setHistoryOpen(true);
        if (!historyItems.length && !historyLoading)
            void loadHistoryPage();
    };
    const syncNotification = (notification) => {
        setNotificationPreview((current) => current && ({
            ...current,
            items: current.items.map((item) => item.notificationId === notification.notificationId ? notification : item),
        }));
        setHistoryItems((current) => current.map((item) => item.notificationId === notification.notificationId ? notification : item));
    };
    const openNotificationDetail = async (notificationId, trigger) => {
        if (trigger)
            detailTriggerRef.current = trigger;
        const sequence = ++detailRequestSequence.current;
        setDetailNotificationId(notificationId);
        setDetailNotification(null);
        setDetailError(false);
        setReadError(false);
        setDetailLoading(true);
        try {
            const { notification } = await notificationsApi.get(notificationId);
            if (detailRequestSequence.current !== sequence)
                return;
            setDetailNotification(notification);
            if (!notification.read && !readRequestsRef.current.has(notificationId)) {
                readRequestsRef.current.add(notificationId);
                try {
                    await notificationsApi.markRead(notificationId);
                    const readNotification = { ...notification, read: true };
                    if (detailRequestSequence.current === sequence)
                        setDetailNotification(readNotification);
                    syncNotification(readNotification);
                }
                catch {
                    if (detailRequestSequence.current === sequence)
                        setReadError(true);
                }
                finally {
                    readRequestsRef.current.delete(notificationId);
                }
            }
        }
        catch {
            if (detailRequestSequence.current === sequence)
                setDetailError(true);
        }
        finally {
            if (detailRequestSequence.current === sequence)
                setDetailLoading(false);
        }
    };
    const retryMarkRead = async () => {
        if (!detailNotification || detailNotification.read || readRequestsRef.current.has(detailNotification.notificationId))
            return;
        const id = detailNotification.notificationId;
        const sequence = detailRequestSequence.current;
        readRequestsRef.current.add(id);
        setReadError(false);
        try {
            await notificationsApi.markRead(id);
            const readNotification = { ...detailNotification, read: true };
            if (detailRequestSequence.current === sequence)
                setDetailNotification(readNotification);
            syncNotification(readNotification);
        }
        catch {
            if (detailRequestSequence.current === sequence)
                setReadError(true);
        }
        finally {
            readRequestsRef.current.delete(id);
        }
    };
    const handleDialogKeyDown = (event, dialog) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            if (detailNotification || detailLoading || detailError)
                closeDetailDialog();
            else if (dialog === 'history')
                closeHistoryDialog();
            return;
        }
        if (event.key !== 'Tab')
            return;
        if (dialog === 'history' && (detailNotification || detailLoading || detailError)) {
            event.preventDefault();
            detailDialogRef.current?.focus();
            return;
        }
        const focusable = Array.from(event.currentTarget.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((element) => element.getAttribute('aria-hidden') !== 'true');
        if (!focusable.length) {
            event.preventDefault();
            event.currentTarget.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    };
    const closeHistoryDialog = () => {
        focusRestoreRef.current = historyTriggerRef.current;
        setHistoryOpen(false);
    };
    const closeDetailDialog = () => {
        detailRequestSequence.current += 1;
        focusRestoreRef.current = detailTriggerRef.current;
        setDetailLoading(false);
        setDetailNotification(null);
        setDetailNotificationId(null);
        setDetailError(false);
        setReadError(false);
    };
    useEffect(() => {
        if (historyOpen)
            historyDialogRef.current?.focus();
    }, [historyOpen]);
    useEffect(() => {
        if (detailLoading || detailError || detailNotification)
            detailDialogRef.current?.focus();
    }, [detailLoading, detailError, detailNotification]);
    useEffect(() => {
        const target = focusRestoreRef.current;
        if (!target || detailLoading || detailError || detailNotification)
            return;
        if (detailTriggerRef.current === target || !historyOpen) {
            target.focus();
            focusRestoreRef.current = null;
        }
    }, [detailLoading, detailError, detailNotification, historyOpen]);
    useEffect(() => {
        if (user?.accountType === 'MEMBER')
            void loadNotificationPreview();
    }, [user?.accountType]);
    if (!user || user.accountType !== 'MEMBER')
        return null;
    const books = page?.items ?? [];
    const notification = detailNotification;
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
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsxs("section", { className: "member-dashboard-content", "aria-labelledby": "member-greeting", children: [_jsx("p", { className: "eyebrow", children: "YOUR LIBRARY, CONNECTED" }), _jsxs("h1", { id: "member-greeting", children: ["Welcome back, ", user.name] }), _jsxs("section", { className: "member-notifications", "aria-labelledby": "member-notifications-heading", "aria-busy": notificationLoading, children: [_jsxs("div", { className: "member-notifications-heading", children: [_jsx("h2", { id: "member-notifications-heading", children: "Notifications" }), _jsx("button", { className: "text-button", type: "button", ref: historyTriggerRef, onClick: openHistory, children: "View All Notifications" })] }), notificationLoading && _jsx("p", { role: "status", children: "Loading notifications\u2026" }), !notificationLoading && notificationError && (_jsxs("div", { className: "member-notification-error", role: "alert", children: [_jsx("p", { children: "We could not load your notifications. Please try again." }), _jsx("button", { className: "text-button", type: "button", onClick: () => void loadNotificationPreview(), children: "Try again" })] })), !notificationLoading && !notificationError && notificationPreview?.items.length === 0 && (_jsx("p", { className: "member-notification-empty", children: "No notifications yet." })), !notificationLoading && !notificationError && notificationPreview && notificationPreview.items.length > 0 && (_jsx("div", { className: "member-notification-list", children: notificationPreview.items.map((notification) => (_jsxs("button", { type: "button", className: `member-notification member-notification-button ${notification.read ? 'member-notification-read' : 'member-notification-unread'}`, onClick: (event) => void openNotificationDetail(notification.notificationId, event.currentTarget), "aria-label": `${notification.notificationType}, ${notification.read ? 'read' : 'unread'}: ${notification.message}`, children: [_jsxs("div", { className: "member-notification-meta", children: [_jsx("span", { children: notification.notificationType }), _jsx("span", { children: notification.read ? 'Read' : 'Unread' })] }), _jsx("p", { className: "member-notification-message", children: notification.message })] }, notification.notificationId))) }))] }), historyOpen && (_jsx("div", { className: "member-dialog-backdrop", onMouseDown: (event) => { if (event.target === event.currentTarget)
                            closeHistoryDialog(); }, children: _jsxs("section", { className: "member-notification-dialog", ref: historyDialogRef, role: "dialog", "aria-modal": "true", "aria-labelledby": "notification-history-title", tabIndex: -1, onKeyDown: (event) => handleDialogKeyDown(event, 'history'), children: [_jsxs("div", { className: "member-dialog-heading", children: [_jsx("h2", { id: "notification-history-title", children: "All notifications" }), _jsx("button", { className: "text-button", type: "button", onClick: () => closeHistoryDialog(), "aria-label": "Close notification history", children: "Close" })] }), _jsxs("div", { className: "member-notification-history-scroll", onScroll: (event) => { const el = event.currentTarget; if (historyCursor && !historyLoading && el.scrollHeight - el.scrollTop - el.clientHeight < 80)
                                        void loadHistoryPage(historyCursor); }, children: [historyItems.map((notification) => (_jsxs("button", { type: "button", className: `member-notification member-notification-button ${notification.read ? 'member-notification-read' : 'member-notification-unread'}`, onClick: (event) => void openNotificationDetail(notification.notificationId, event.currentTarget), children: [_jsxs("span", { className: "member-notification-meta", children: [_jsx("span", { children: notification.notificationType }), _jsx("span", { children: notification.read ? 'Read' : 'Unread' })] }), _jsx("span", { className: "member-notification-message", children: notification.message })] }, notification.notificationId))), historyLoading && _jsx("p", { role: "status", children: "Loading notification history\u2026" }), historyError && _jsxs("div", { role: "alert", children: [_jsx("p", { children: "We could not load notification history." }), _jsx("button", { className: "text-button", type: "button", onClick: () => void loadHistoryPage(historyCursor ?? undefined), children: "Try again" })] }), !historyLoading && !historyError && historyItems.length === 0 && _jsx("p", { children: "No notifications yet." })] })] }) })), (detailLoading || detailError || detailNotification) && (_jsx("div", { className: "member-dialog-backdrop", onMouseDown: (event) => { if (event.target === event.currentTarget)
                            closeDetailDialog(); }, children: _jsxs("section", { className: "member-notification-dialog member-notification-detail-dialog", ref: detailDialogRef, role: "dialog", "aria-modal": "true", "aria-labelledby": "notification-detail-title", tabIndex: -1, onKeyDown: (event) => handleDialogKeyDown(event, 'detail'), children: [_jsxs("div", { className: "member-dialog-heading", children: [_jsx("h2", { id: "notification-detail-title", children: "Notification details" }), _jsx("button", { className: "text-button", type: "button", onClick: () => closeDetailDialog(), children: "Close" })] }), detailLoading && _jsx("p", { role: "status", children: "Loading notification\u2026" }), detailError && _jsxs("div", { role: "alert", children: [_jsx("p", { children: "We could not load this notification." }), _jsx("button", { className: "text-button", type: "button", onClick: () => { if (detailNotificationId)
                                                void openNotificationDetail(detailNotificationId); }, children: "Try again" })] }), notification && _jsxs("div", { className: "member-notification-detail", children: [_jsx("p", { children: notification.message }), _jsxs("dl", { children: [_jsx("dt", { children: "Type" }), _jsx("dd", { children: notification.notificationType }), _jsx("dt", { children: "Received" }), _jsx("dd", { children: new Date(notification.createdAt).toLocaleString() }), _jsx("dt", { children: "Reference type" }), _jsx("dd", { children: notification.referenceType ?? 'None' }), _jsx("dt", { children: "Reference ID" }), _jsx("dd", { children: notification.referenceId ?? 'None' })] }), readError && _jsxs("div", { role: "alert", children: [_jsx("p", { children: "We could not mark this notification as read. It remains unread." }), _jsx("button", { className: "text-button", type: "button", onClick: () => void retryMarkRead(), children: "Retry mark as read" })] })] })] }) })), _jsxs("form", { className: "member-search-form", "aria-label": "Search the catalog", onSubmit: submitSearch, children: [_jsxs("label", { className: "field member-title-search", children: [_jsx("span", { children: "Title contains" }), _jsx("input", { name: "title", type: "search", value: values.title, onChange: (event) => updateValue('title', event.target.value), placeholder: "Search book titles" })] }), _jsxs("details", { className: "member-advanced-search", ref: advancedSearchRef, children: [_jsx("summary", { children: "Advanced search" }), _jsxs("div", { className: "member-filter-grid", children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Author contains" }), _jsx("input", { name: "author", value: values.author, onChange: (event) => updateValue('author', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Publisher contains" }), _jsx("input", { name: "publisher", value: values.publisher, onChange: (event) => updateValue('publisher', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Category contains" }), _jsx("input", { name: "category", value: values.category, onChange: (event) => updateValue('category', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Exact ISBN" }), _jsx("input", { name: "isbn", value: values.isbn, onChange: (event) => updateValue('isbn', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Exact publication year" }), _jsx("input", { name: "publicationYear", type: "number", min: "0", max: "9999", step: "1", inputMode: "numeric", value: values.publicationYear, disabled: hasRange, onChange: (event) => updateValue('publicationYear', event.target.value) })] }), _jsxs("fieldset", { className: "member-year-range", disabled: hasExactYear, "aria-describedby": rangeError ? 'member-year-error' : undefined, children: [_jsx("legend", { children: "Publication year range" }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "From year" }), _jsx("input", { name: "publicationYearFrom", type: "number", min: "0", max: "9999", step: "1", inputMode: "numeric", value: values.publicationYearFrom, onChange: (event) => updateValue('publicationYearFrom', event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "To year" }), _jsx("input", { name: "publicationYearTo", type: "number", min: "0", max: "9999", step: "1", inputMode: "numeric", value: values.publicationYearTo, onChange: (event) => updateValue('publicationYearTo', event.target.value) })] })] })] })] }), rangeError && _jsx("p", { id: "member-year-error", className: "form-error", role: "alert", children: rangeError }), searchError && _jsx("p", { className: "form-error", role: "alert", children: searchError }), _jsxs("div", { className: "member-search-actions", children: [_jsx("button", { className: "primary-button", type: "submit", children: "Search" }), _jsx("button", { className: "text-button", type: "button", onClick: clearSearch, children: "Clear filters" })] })] }), _jsxs("section", { className: "member-catalog-results", "aria-label": "Catalog results", "aria-busy": initialLoading || moreLoading, children: [initialLoading && _jsx("p", { role: "status", children: "Loading catalog\u2026" }), !initialLoading && searchError && (_jsxs("div", { className: "member-result-error", role: "alert", children: [_jsx("p", { children: searchError }), _jsx("button", { className: "text-button", type: "button", onClick: () => void loadFirstPage(submittedFilters), children: "Try again" })] })), !initialLoading && !searchError && page && books.length === 0 && (_jsx("p", { className: "member-result-message", children: "No books match these filters." })), books.length > 0 && (_jsx("div", { className: "member-book-grid", children: books.map((book) => (_jsx(Link, { className: "member-book-card", to: `/member/books/${encodeURIComponent(book.isbn)}`, children: _jsxs("div", { className: "member-book-card-content", children: [_jsx("h2", { children: book.title }), _jsx("p", { className: "member-book-category", children: book.category }), _jsx("p", { className: "member-book-synopsis", children: book.synopsis })] }) }, book.isbn))) })), !initialLoading && !searchError && page?.page.nextCursor && (_jsxs("div", { className: "member-pagination", children: [moreError && _jsx("p", { className: "form-error", role: "alert", children: "Could not load more books." }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void loadNextPage(), disabled: moreLoading, children: moreLoading ? 'Loading books…' : moreError ? 'Try again' : 'Load more books' })] })), !initialLoading && !searchError && page && books.length > 0 && !page.page.nextCursor && (_jsx("p", { className: "member-result-message", children: "End of results. You\u2019ve seen all matching books." }))] }), _jsx("span", { className: "sr-only", "aria-live": "polite", children: page ? `${page.items.length} catalog results loaded.` : '' }), _jsx("span", { className: "sr-only", "data-filter-count": Object.keys(submittedFilters).length })] })] }));
}
//# sourceMappingURL=MemberDashboard.js.map
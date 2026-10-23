import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/errors.js';
import { fineApi } from '../api/fines.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';
export function formatFineAmount(fine) {
    if (!Number.isSafeInteger(fine.amountMinorUnits) || fine.amountMinorUnits < 0)
        return 'Amount unavailable';
    const cents = BigInt(fine.amountMinorUnits);
    const whole = (cents / 100n).toString();
    const fraction = (cents % 100n).toString().padStart(2, '0');
    const grouped = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 }).format(BigInt(whole));
    return `${fine.currency} ${grouped}.${fraction}`;
}
function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Date unavailable'
        : new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium' }).format(date);
}
function fineStatusLabel(status) {
    return status.charAt(0) + status.slice(1).toLowerCase();
}
export function MemberFines() {
    const { user, logout } = useAuth();
    const [view, setView] = useState('outstanding');
    const [outstanding, setOutstanding] = useState([]);
    const [history, setHistory] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [selected, setSelected] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const headingRef = useRef(null);
    const dialogRef = useRef(null);
    const triggerRef = useRef(null);
    const sentinelRef = useRef(null);
    const pagePendingRef = useRef(false);
    const loadView = useCallback(async (target, reset = true) => {
        if (target === 'history' && !reset && (!nextCursor || pagePendingRef.current))
            return;
        const cursor = target === 'history' && !reset ? (nextCursor ?? undefined) : undefined;
        if (target === 'history' && !reset)
            pagePendingRef.current = true;
        if (reset) {
            setLoading(true);
            setError(null);
        }
        else
            setLoadingMore(true);
        try {
            const result = await fineApi.listFines(target, cursor);
            if (target === 'outstanding')
                setOutstanding(result.items);
            else {
                setHistory((current) => reset
                    ? result.items
                    : [
                        ...current,
                        ...result.items.filter((item) => !current.some((existing) => existing.fineId === item.fineId)),
                    ]);
                setNextCursor(result.page.nextCursor);
            }
            setError(null);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not load your fines. Please try again.');
        }
        finally {
            pagePendingRef.current = false;
            if (reset)
                setLoading(false);
            else
                setLoadingMore(false);
        }
    }, [nextCursor]);
    useEffect(() => {
        void loadView(view);
    }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (selected)
            dialogRef.current?.querySelector('button:not(:disabled)')?.focus();
        else
            triggerRef.current?.focus();
    }, [selected]);
    useEffect(() => {
        if (!sentinelRef.current || view !== 'history' || !nextCursor || loadingMore || loading)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting))
                void loadView('history', false);
        }, { rootMargin: '160px' });
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [view, nextCursor, loadingMore, loading, loadView]);
    const cancelPayment = () => {
        if (submitting)
            return;
        setSelected(null);
        triggerRef.current?.focus();
    };
    const confirmPayment = async () => {
        if (!selected || submittingRef.current)
            return;
        const fine = selected;
        submittingRef.current = true;
        setSubmitting(true);
        setError(null);
        setFeedback(null);
        try {
            await fineApi.payFine(fine.fineId);
            setFeedback(`Payment confirmed for ${fine.bookTitle}.`);
            setOutstanding((current) => current.filter((item) => item.fineId !== fine.fineId));
            triggerRef.current = headingRef.current;
            setSelected(null);
            await loadView(view);
        }
        catch (cause) {
            if (cause instanceof ApiClientError && cause.status === 409) {
                triggerRef.current = headingRef.current;
                await loadView(view);
                setError('This fine is no longer outstanding. Its status has been refreshed.');
                setSelected(null);
            }
            else {
                setError(cause instanceof Error ? cause.message : 'Could not pay this fine. Please try again.');
            }
        }
        finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };
    if (!user || user.accountType !== 'MEMBER')
        return null;
    const fines = view === 'outstanding' ? outstanding : history;
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsx("section", { className: "member-profile-content", "aria-labelledby": "member-fines-heading", children: _jsx(MemberProfileHub, { children: _jsxs("div", { className: "member-fines-page", children: [_jsx("p", { className: "eyebrow", children: "MEMBER ACCOUNT" }), _jsx("h1", { ref: headingRef, id: "member-fines-heading", tabIndex: -1, children: "My Fines" }), _jsxs("div", { className: "loan-view-toggle", role: "group", "aria-label": "Fine view", children: [_jsx("button", { type: "button", "aria-pressed": view === 'outstanding', onClick: () => {
                                            setError(null);
                                            setView('outstanding');
                                        }, children: "Outstanding" }), _jsx("button", { type: "button", "aria-pressed": view === 'history', onClick: () => {
                                            setError(null);
                                            setView('history');
                                        }, children: "History" })] }), error && (_jsxs("div", { role: "alert", className: "form-error", children: [_jsx("p", { children: error }), _jsx("button", { type: "button", onClick: () => void loadView(view), children: "Retry" })] })), loading ? (_jsx("p", { role: "status", className: "muted", children: "Loading fines\u2026" })) : fines.length === 0 ? (_jsx("p", { role: "status", className: "muted", children: view === 'outstanding'
                                    ? 'You have no outstanding fines.'
                                    : 'You have no fine history.' })) : (_jsx("div", { className: "member-fine-list", "aria-label": view === 'outstanding' ? 'Outstanding fines' : 'Fine history', children: fines.map((fine) => (_jsxs("article", { className: "member-fine-card", children: [_jsxs("div", { className: "member-fine-card-heading", children: [_jsx("h2", { children: fine.bookTitle }), _jsx("strong", { children: formatFineAmount(fine) })] }), _jsxs("p", { children: [_jsx("span", { children: "Reason:" }), " ", fine.reason] }), _jsxs("p", { children: [_jsx("span", { children: "Issued:" }), ' ', _jsx("time", { dateTime: fine.issuedDateTime, children: formatDate(fine.issuedDateTime) })] }), _jsxs("p", { children: [_jsx("span", { children: "Status:" }), " ", _jsx("strong", { children: fineStatusLabel(fine.status) })] }), fine.status === 'OUTSTANDING' && (_jsx("button", { type: "button", disabled: submitting, onClick: (event) => {
                                                triggerRef.current = event.currentTarget;
                                                setError(null);
                                                setFeedback(null);
                                                setSelected(fine);
                                            }, children: "Pay Fine" }))] }, fine.fineId))) })), view === 'history' && nextCursor && !loading && (_jsx("div", { ref: sentinelRef, className: "member-fine-load-more", children: _jsx("button", { type: "button", disabled: loadingMore, onClick: () => void loadView('history', false), children: loadingMore ? 'Loading more…' : 'Load more' }) })), loadingMore && (_jsx("p", { role: "status", className: "muted", children: "Loading more fines\u2026" })), feedback && (_jsx("p", { role: "status", "aria-live": "polite", children: feedback })), selected && (_jsx("div", { className: "member-fine-dialog-backdrop", children: _jsxs("div", { ref: dialogRef, className: "member-fine-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "fine-payment-heading", onKeyDown: (event) => {
                                        if (event.key === 'Escape') {
                                            event.preventDefault();
                                            cancelPayment();
                                        }
                                        if (event.key === 'Tab') {
                                            const buttons = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'));
                                            const first = buttons[0], last = buttons[buttons.length - 1];
                                            if (event.shiftKey && document.activeElement === first) {
                                                event.preventDefault();
                                                last?.focus();
                                            }
                                            else if (!event.shiftKey && document.activeElement === last) {
                                                event.preventDefault();
                                                first?.focus();
                                            }
                                        }
                                    }, children: [_jsx("h2", { id: "fine-payment-heading", children: "Confirm fine payment" }), _jsx("p", { children: _jsx("strong", { children: selected.bookTitle }) }), _jsxs("p", { children: ["Reason: ", selected.reason] }), _jsxs("p", { children: ["Amount: ", formatFineAmount(selected)] }), _jsx("button", { type: "button", disabled: submitting, onClick: () => void confirmPayment(), children: submitting ? 'Processing…' : 'Confirm Payment' }), _jsx("button", { type: "button", disabled: submitting, onClick: cancelPayment, children: "Cancel" }), submitting && (_jsx("p", { role: "status", "aria-live": "polite", children: "Processing payment\u2026" }))] }) }))] }) }) })] }));
}
//# sourceMappingURL=MemberFines.js.map
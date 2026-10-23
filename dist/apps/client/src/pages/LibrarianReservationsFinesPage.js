import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { reservationsFinesApi, } from '../api/circulation.js';
import { useAuth } from '../auth/AuthContext.js';
function displayError(caught, fallback) {
    return caught instanceof ApiClientError ? caught.message : fallback;
}
export function LibrarianReservationsFinesPage() {
    const { logout } = useAuth();
    const [isbn, setIsbn] = useState('');
    const [reservationStatus, setReservationStatus] = useState('');
    const [fineStatus, setFineStatus] = useState('');
    const [memberId, setMemberId] = useState('');
    const [reservations, setReservations] = useState([]);
    const [fines, setFines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [messageMemberId, setMessageMemberId] = useState('');
    const [message, setMessage] = useState('');
    const [messageIdempotencyKey, setMessageIdempotencyKey] = useState(null);
    const requestSequence = useRef(0);
    const loadData = useCallback(async () => {
        const requestId = ++requestSequence.current;
        setLoading(true);
        setError(null);
        try {
            const [reservationPage, finePage] = await Promise.all([
                reservationsFinesApi.reservations({
                    isbn: isbn.trim() || undefined,
                    status: reservationStatus || undefined,
                }),
                reservationsFinesApi.fines({
                    status: fineStatus || undefined,
                    memberId: memberId.trim() || undefined,
                }),
            ]);
            if (requestId !== requestSequence.current)
                return;
            setReservations(reservationPage.items);
            setFines(finePage.items);
        }
        catch (caught) {
            if (requestId === requestSequence.current)
                setError(displayError(caught, 'Reservations and fines could not be loaded.'));
        }
        finally {
            if (requestId === requestSequence.current)
                setLoading(false);
        }
    }, [fineStatus, isbn, memberId, reservationStatus]);
    // Filters apply on submit or refresh, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        void loadData();
    }, []);
    async function waive(fine) {
        if (!window.confirm(`Waive the ${fine.currency} ${(fine.amountMinorUnits / 100).toFixed(2)} fine for ${fine.bookTitle}?`))
            return;
        setPending(true);
        setError(null);
        setSuccess(null);
        try {
            await reservationsFinesApi.waiveFine(fine.fineId);
            setSuccess('Fine waived and the member was notified.');
            await loadData();
        }
        catch (caught) {
            setError(displayError(caught, 'The fine could not be waived. Refresh and try again.'));
        }
        finally {
            setPending(false);
        }
    }
    async function sendMessage(event) {
        event.preventDefault();
        if (!messageMemberId.trim() || !message.trim()) {
            setError('Member ID and message are required.');
            return;
        }
        if (!window.confirm(`Send this message to member ${messageMemberId.trim()}?`))
            return;
        setPending(true);
        setError(null);
        setSuccess(null);
        const idempotencyKey = messageIdempotencyKey ?? `message-${crypto.randomUUID()}`;
        setMessageIdempotencyKey(idempotencyKey);
        try {
            await reservationsFinesApi.sendMessage(messageMemberId.trim(), message.trim(), idempotencyKey);
            setMessageMemberId('');
            setMessage('');
            setMessageIdempotencyKey(null);
            setSuccess('Message sent.');
            await loadData();
        }
        catch (caught) {
            setError(displayError(caught, 'The message could not be sent. Refresh and try again.'));
        }
        finally {
            setPending(false);
        }
    }
    return (_jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs(Link, { className: "brand-lockup", to: "/librarian/dashboard", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "dashboard-actions", "aria-label": "Reservation and fine navigation", children: [_jsx(Link, { className: "text-button", to: "/librarian/dashboard", children: "Dashboard" }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] })] }), _jsxs("section", { className: "catalog-panel", "aria-labelledby": "reservations-fines-title", children: [_jsx("p", { className: "eyebrow", children: "LIBRARIAN TOOLS" }), _jsx("h1", { id: "reservations-fines-title", children: "Reservations & fines" }), _jsx("p", { className: "muted", children: "Review bounded operational queues. Member IDs are shown for lookup; names, emails, and user IDs stay private." }), success && (_jsx("p", { className: "form-success", role: "status", children: success })), error && (_jsx("p", { className: "form-error", role: "alert", children: error })), _jsxs("form", { className: "catalog-search", onSubmit: (event) => {
                            event.preventDefault();
                            void loadData();
                        }, "aria-label": "Filter reservations and fines", children: [_jsxs("label", { className: "field", children: ["ISBN", _jsx("input", { value: isbn, onChange: (event) => setIsbn(event.target.value), maxLength: 32 })] }), _jsxs("label", { className: "field", children: ["Reservation status", _jsxs("select", { value: reservationStatus, onChange: (event) => setReservationStatus(event.target.value), children: [_jsx("option", { value: "", children: "All" }), _jsx("option", { value: "PENDING", children: "Pending" }), _jsx("option", { value: "FULFILLED", children: "Fulfilled" }), _jsx("option", { value: "CANCELLED", children: "Cancelled" }), _jsx("option", { value: "EXPIRED", children: "Expired" })] })] }), _jsxs("label", { className: "field", children: ["Fine status", _jsxs("select", { value: fineStatus, onChange: (event) => setFineStatus(event.target.value), children: [_jsx("option", { value: "", children: "All" }), _jsx("option", { value: "OUTSTANDING", children: "Outstanding" }), _jsx("option", { value: "PAID", children: "Paid" }), _jsx("option", { value: "WAIVED", children: "Waived" })] })] }), _jsxs("label", { className: "field", children: ["Member ID", _jsx("input", { value: memberId, onChange: (event) => setMemberId(event.target.value), maxLength: 128 })] }), _jsx("button", { className: "primary-button compact-button", type: "submit", disabled: loading || pending, children: "Apply filters" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void loadData(), disabled: loading || pending, children: "Refresh" })] }), loading ? (_jsx("p", { className: "muted", "aria-live": "polite", children: "Loading reservations and fines\u2026" })) : (_jsxs("div", { className: "catalog-layout", children: [_jsxs("section", { "aria-labelledby": "reservation-queue-title", children: [_jsx("h2", { id: "reservation-queue-title", children: "Reservation queue" }), reservations.length === 0 ? (_jsx("p", { className: "empty-state", children: "No reservations match these filters." })) : (_jsx("div", { className: "account-table-wrap", children: _jsxs("table", { className: "account-table", children: [_jsx("caption", { className: "sr-only", children: "Librarian reservation queue" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Reservation" }), _jsx("th", { scope: "col", children: "Member" }), _jsx("th", { scope: "col", children: "ISBN" }), _jsx("th", { scope: "col", children: "Status" }), _jsx("th", { scope: "col", children: "Pickup expiry" })] }) }), _jsx("tbody", { children: reservations.map((reservation) => (_jsxs("tr", { children: [_jsx("th", { scope: "row", children: reservation.reservationId }), _jsx("td", { children: reservation.memberId }), _jsx("td", { children: reservation.isbn }), _jsx("td", { children: _jsx("span", { className: `status-pill status-${reservation.status.toLowerCase()}`, children: reservation.status.replace('_', ' ') }) }), _jsx("td", { children: reservation.expiryDate
                                                                    ? new Date(reservation.expiryDate).toLocaleDateString()
                                                                    : '—' })] }, reservation.reservationId))) })] }) }))] }), _jsxs("section", { "aria-labelledby": "fine-queue-title", children: [_jsx("h2", { id: "fine-queue-title", children: "Fine queue" }), fines.length === 0 ? (_jsx("p", { className: "empty-state", children: "No fines match these filters." })) : (_jsx("div", { className: "account-table-wrap", children: _jsxs("table", { className: "account-table", children: [_jsx("caption", { className: "sr-only", children: "Librarian fine queue" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Book" }), _jsx("th", { scope: "col", children: "Member" }), _jsx("th", { scope: "col", children: "Amount" }), _jsx("th", { scope: "col", children: "Status" }), _jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Action" }) })] }) }), _jsx("tbody", { children: fines.map((fine) => (_jsxs("tr", { children: [_jsxs("th", { scope: "row", children: [fine.bookTitle, _jsx("small", { children: fine.fineId })] }), _jsx("td", { children: fine.memberId }), _jsxs("td", { children: [fine.currency, " ", (fine.amountMinorUnits / 100).toFixed(2)] }), _jsx("td", { children: _jsx("span", { className: `status-pill status-${fine.status.toLowerCase()}`, children: fine.status }) }), _jsx("td", { children: fine.status === 'OUTSTANDING' && (_jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void waive(fine), disabled: pending, children: "Waive" })) })] }, fine.fineId))) })] }) }))] })] })), _jsxs("form", { className: "catalog-form-shell catalog-form", onSubmit: (event) => void sendMessage(event), "aria-labelledby": "message-title", children: [_jsx("h2", { id: "message-title", children: "Send a member message" }), _jsx("p", { className: "muted", children: "Messages are plain text and delivered only to active members. Do not include private credentials or sensitive details." }), _jsxs("label", { className: "field", children: ["Member ID", _jsx("input", { value: messageMemberId, onChange: (event) => {
                                            setMessageMemberId(event.target.value);
                                            setMessageIdempotencyKey(null);
                                        }, maxLength: 128, required: true })] }), _jsxs("label", { className: "field", children: ["Message", _jsx("textarea", { value: message, onChange: (event) => {
                                            setMessage(event.target.value);
                                            setMessageIdempotencyKey(null);
                                        }, maxLength: 2000, required: true })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: pending, children: pending ? 'Sending…' : 'Send message' })] })] })] }));
}
//# sourceMappingURL=LibrarianReservationsFinesPage.js.map
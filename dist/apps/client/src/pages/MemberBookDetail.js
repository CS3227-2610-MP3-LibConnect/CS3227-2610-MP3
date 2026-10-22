import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { catalogApi } from '../api/catalog.js';
import { reservationApi } from '../api/reservations.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { useAuth } from '../auth/AuthContext.js';
export function MemberBookDetail() {
    const { user, logout } = useAuth();
    const { isbn = '' } = useParams();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState(false);
    const [reservation, setReservation] = useState(null);
    const [reservationLoaded, setReservationLoaded] = useState(false);
    const [reservationError, setReservationError] = useState('');
    const [reservationMessage, setReservationMessage] = useState('');
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [reservationBusy, setReservationBusy] = useState(false);
    const requestSequence = useRef(0);
    const reservationRequestSequence = useRef(0);
    const inFlight = useRef(false);
    const reservationHeading = useRef(null);
    const reservationActionButton = useRef(null);
    const confirmationDialog = useRef(null);
    const confirmButton = useRef(null);
    const dismissButton = useRef(null);
    const loadBook = useCallback(async (preserve = false) => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        if (!preserve) {
            setResult(null);
            setNotFound(false);
            setError(false);
        }
        try {
            const response = await catalogApi.getBook(isbn);
            if (requestSequence.current === sequence)
                setResult(response);
        }
        catch (cause) {
            if (requestSequence.current === sequence) {
                if (cause instanceof ApiClientError && cause.status === 404)
                    setNotFound(true);
                else
                    setError(true);
            }
        }
        finally {
            if (requestSequence.current === sequence)
                setLoading(false);
        }
    }, [isbn]);
    useEffect(() => {
        void loadBook();
        return () => { requestSequence.current += 1; };
    }, [loadBook]);
    const loadReservation = useCallback(async () => {
        const sequence = ++reservationRequestSequence.current;
        setReservationLoaded(false);
        setReservationError('');
        try {
            const current = await reservationApi.getByIsbn(isbn);
            if (reservationRequestSequence.current === sequence) {
                setReservation(current?.status === 'PENDING' ? current : null);
                setReservationLoaded(true);
            }
        }
        catch {
            if (reservationRequestSequence.current === sequence) {
                setReservationError('Could not check your reservation. Try again to load your current status.');
                setReservationLoaded(false);
            }
        }
    }, [isbn]);
    useEffect(() => {
        void loadReservation();
        return () => { reservationRequestSequence.current += 1; };
    }, [loadReservation]);
    useEffect(() => {
        if (!confirmCancel)
            return;
        confirmButton.current?.focus();
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setConfirmCancel(false);
                requestAnimationFrame(() => reservationActionButton.current?.focus());
            }
            else if (event.key === 'Tab') {
                const first = confirmButton.current;
                const last = dismissButton.current;
                const focusIsInside = confirmationDialog.current?.contains(document.activeElement) ?? false;
                if (!focusIsInside) {
                    event.preventDefault();
                    (event.shiftKey ? last : first)?.focus();
                }
                else if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                }
                else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [confirmCancel]);
    const refreshReservationState = async () => {
        await Promise.all([loadBook(true), loadReservation()]);
    };
    const performReservationAction = async () => {
        if (inFlight.current || !reservationLoaded)
            return;
        inFlight.current = true;
        setReservationBusy(true);
        setReservationError('');
        setReservationMessage('');
        setConfirmCancel(false);
        try {
            if (reservation?.status === 'PENDING') {
                await reservationApi.cancel(reservation.reservationId);
                setReservationMessage('Your reservation was cancelled.');
            }
            else {
                await reservationApi.create(isbn);
                setReservationMessage('Your reservation was created.');
            }
            await refreshReservationState();
        }
        catch (cause) {
            const conflict = cause instanceof ApiClientError && (cause.status === 409 || cause.status === 412 || cause.code === 'AVAILABLE_COPY' || cause.code === 'RESERVATION_CONFLICT');
            setReservationError(conflict
                ? reservation?.status === 'PENDING'
                    ? 'This reservation can no longer be cancelled. Your current status has been refreshed.'
                    : 'A copy may now be available or a pending reservation already exists. Your current status has been refreshed.'
                : cause instanceof Error ? cause.message : 'The reservation request failed. Please try again.');
            if (conflict)
                await refreshReservationState();
        }
        finally {
            inFlight.current = false;
            setReservationBusy(false);
            requestAnimationFrame(() => reservationHeading.current?.focus());
        }
    };
    if (!user || user.accountType !== 'MEMBER')
        return null;
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsxs("section", { className: "member-detail-content", "aria-labelledby": "book-detail-heading", "aria-busy": loading, children: [_jsx(Link, { className: "member-detail-back", to: "/member/dashboard", children: "Back to catalog" }), loading && _jsx("p", { role: "status", children: "Loading book details\u2026" }), !loading && notFound && (_jsxs("div", { className: "member-detail-message", children: [_jsx("h1", { id: "book-detail-heading", children: "Book not found" }), _jsxs("p", { children: ["We could not find a book with ISBN ", isbn, "."] })] })), !loading && error && (_jsxs("div", { className: "member-detail-message", role: "alert", children: [_jsx("h1", { id: "book-detail-heading", children: "Could not load book details" }), _jsx("p", { children: "Please check your connection and try again." }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void loadBook(), children: "Try again" })] })), result && (_jsxs("article", { className: "member-book-detail", children: [_jsx("p", { className: "eyebrow", children: "BOOK DETAILS" }), _jsx("h1", { id: "book-detail-heading", children: result.book.title }), _jsxs("dl", { className: "member-book-metadata", children: [_jsxs("div", { children: [_jsx("dt", { children: "ISBN" }), _jsx("dd", { children: result.book.isbn })] }), _jsxs("div", { children: [_jsx("dt", { children: "Author" }), _jsx("dd", { children: Array.isArray(result.book.author) ? result.book.author.join(', ') : result.book.author })] }), _jsxs("div", { children: [_jsx("dt", { children: "Publication year" }), _jsx("dd", { children: result.book.publicationYear })] }), _jsxs("div", { children: [_jsx("dt", { children: "Publisher" }), _jsx("dd", { children: result.book.publisher })] }), _jsxs("div", { children: [_jsx("dt", { children: "Category" }), _jsx("dd", { children: result.book.category })] })] }), _jsxs("section", { "aria-labelledby": "book-synopsis-heading", children: [_jsx("h2", { id: "book-synopsis-heading", children: "Synopsis" }), _jsx("p", { children: result.book.synopsis || 'No synopsis is available.' })] }), _jsxs("section", { "aria-labelledby": "copy-availability-heading", children: [_jsx("h2", { id: "copy-availability-heading", children: "Copy availability" }), _jsxs("p", { children: [result.availability.availableCount, " of ", result.availability.totalCopies, " copies available"] }), result.copies.length === 0 ? _jsx("p", { children: "No physical copies are listed for this title." }) : (_jsx("ul", { className: "member-copy-list", children: result.copies.map((copy) => (_jsxs("li", { children: [_jsxs("span", { children: [_jsx("strong", { children: "Shelf location:" }), " ", copy.shelfLocation ?? 'Not on shelf'] }), _jsxs("span", { children: [_jsx("strong", { children: "Status:" }), " ", copy.status.replaceAll('_', ' ')] })] }, copy.copyId))) }))] }), _jsxs("section", { "aria-labelledby": "reservation-heading", children: [_jsx("h2", { ref: reservationHeading, id: "reservation-heading", tabIndex: -1, children: "Reservation" }), reservationError && _jsx("p", { role: "alert", children: reservationError }), reservationMessage && _jsx("p", { role: "status", "aria-live": "polite", children: reservationMessage }), !reservationLoaded ? (_jsxs("div", { children: [_jsx("p", { role: "status", children: reservationError ? 'Reservation status is unavailable.' : 'Loading reservation status…' }), reservationError && _jsx("button", { type: "button", onClick: () => void loadReservation(), children: "Try again" })] })) : (_jsx("button", { className: `primary-button${reservation?.status === 'PENDING' ? ' danger-button' : ''}`, type: "button", disabled: reservationBusy || (!reservation && !(result.availability.availableCount <= 0)), ref: reservationActionButton, onClick: () => reservation?.status === 'PENDING' ? setConfirmCancel(true) : void performReservationAction(), children: reservation?.status === 'PENDING' ? 'Cancel Reservation' : 'Make Reservation' })), confirmCancel && reservation?.status === 'PENDING' && (_jsx("div", { className: "member-dialog-backdrop", children: _jsxs("div", { ref: confirmationDialog, role: "alertdialog", "aria-modal": "true", "aria-labelledby": "cancel-reservation-title", "aria-describedby": "cancel-reservation-description", className: "member-confirm-dialog", children: [_jsx("h3", { id: "cancel-reservation-title", children: "Cancel reservation?" }), _jsxs("p", { id: "cancel-reservation-description", children: ["Cancel your reservation for ", result.book.title, "?"] }), _jsx("button", { className: "danger-button", ref: confirmButton, type: "button", disabled: reservationBusy, onClick: () => void performReservationAction(), children: "Confirm cancellation" }), _jsx("button", { ref: dismissButton, type: "button", onClick: () => { setConfirmCancel(false); requestAnimationFrame(() => reservationActionButton.current?.focus()); }, children: "Keep Reservation" })] }) }))] })] }))] })] }));
}
//# sourceMappingURL=MemberBookDetail.js.map
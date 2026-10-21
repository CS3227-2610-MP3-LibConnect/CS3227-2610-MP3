import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/errors.js';
import { reservationApi } from '../api/reservations.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberReservationCard } from '../components/MemberReservationCard.js';
const initialState = () => ({ items: [], nextCursor: null, loading: false, error: null, loaded: false });
const allowedStatuses = {
    pending: ['PENDING'],
    history: ['FULFILLED', 'CANCELLED', 'EXPIRED'],
};
export function MemberReservations() {
    const { user, logout } = useAuth();
    const [view, setView] = useState('pending');
    const [pendingPage, setPendingPage] = useState(() => initialState());
    const [historyPage, setHistoryPage] = useState(() => initialState());
    const [confirmation, setConfirmation] = useState(null);
    const [cancellationInFlight, setCancellationInFlight] = useState(() => new Set());
    const [cancellationError, setCancellationError] = useState(null);
    const [announcement, setAnnouncement] = useState('');
    const cancellationGuard = useRef(new Set());
    const confirmationDialog = useRef(null);
    const currentPage = view === 'pending' ? pendingPage : historyPage;
    const loadPage = async (view, append = false) => {
        const setter = view === 'pending' ? setPendingPage : setHistoryPage;
        const snapshot = view === 'pending' ? pendingPage : historyPage;
        setter((current) => ({ ...current, loading: true, error: null }));
        try {
            const result = await reservationApi.list(view, append && snapshot.nextCursor ? { cursor: snapshot.nextCursor } : {});
            setter((current) => {
                const combined = append ? [...current.items, ...result.items] : result.items;
                const unique = new Map(combined.map((item) => [item.reservationId, item]));
                const items = [...unique.values()].filter((item) => allowedStatuses[view].includes(item.status))
                    .sort((a, b) => b.reservationDateTime.localeCompare(a.reservationDateTime) || b.reservationId.localeCompare(a.reservationId));
                return { items, nextCursor: result.page.nextCursor, loading: false, error: null, loaded: true };
            });
        }
        catch (cause) {
            setter((current) => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : 'Could not load reservations.' }));
        }
    };
    useEffect(() => { void loadPage('pending'); }, []);
    useEffect(() => {
        const dialog = confirmationDialog.current;
        if (confirmation && dialog && !dialog.open)
            dialog.showModal();
        if (!confirmation && dialog?.open)
            dialog.close();
    }, [confirmation]);
    const chooseView = (next) => {
        setView(next);
        const page = next === 'pending' ? pendingPage : historyPage;
        if (!page.loaded && !page.loading)
            void loadPage(next);
    };
    const confirmCancellation = async () => {
        const reservation = confirmation;
        if (!reservation || reservation.status !== 'PENDING' || cancellationGuard.current.has(reservation.reservationId))
            return;
        cancellationGuard.current.add(reservation.reservationId);
        setCancellationInFlight((current) => new Set(current).add(reservation.reservationId));
        setCancellationError(null);
        setAnnouncement('');
        try {
            try {
                await reservationApi.cancel(reservation.reservationId);
            }
            catch (cause) {
                setPendingPage((current) => ({ ...current, loading: false }));
                if (cause instanceof ApiClientError && cause.status === 409) {
                    setConfirmation(null);
                    setCancellationError(null);
                    setPendingPage(initialState());
                    setHistoryPage(initialState());
                    await Promise.all([loadPage('pending'), loadPage('history')]);
                    setAnnouncement('This reservation is no longer pending and can no longer be cancelled. Your reservations have been refreshed.');
                }
                else {
                    setCancellationError({ reservation, message: cause instanceof Error ? cause.message : 'Could not cancel this reservation. Try again.' });
                }
                return;
            }
            setConfirmation(null);
            setPendingPage(initialState());
            setHistoryPage(initialState());
            setAnnouncement('Reservation cancelled successfully.');
            await Promise.all([loadPage('pending'), loadPage('history')]);
        }
        finally {
            cancellationGuard.current.delete(reservation.reservationId);
            setCancellationInFlight((current) => {
                const next = new Set(current);
                next.delete(reservation.reservationId);
                return next;
            });
        }
    };
    const dismissConfirmation = () => setConfirmation(null);
    if (!user || user.accountType !== 'MEMBER')
        return null;
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsx("section", { className: "member-profile-content", "aria-labelledby": "member-reservations-heading", children: _jsx(MemberProfileHub, { children: _jsxs("div", { className: "member-loans-page", children: [_jsx("p", { className: "eyebrow", children: "MEMBER ACCOUNT" }), _jsx("h1", { id: "member-reservations-heading", children: "My Reservations" }), _jsxs("div", { className: "loan-view-toggle", role: "group", "aria-label": "Reservation view", children: [_jsx("button", { type: "button", "aria-pressed": view === 'pending', onClick: () => chooseView('pending'), children: "Pending" }), _jsx("button", { type: "button", "aria-pressed": view === 'history', onClick: () => chooseView('history'), children: "History" })] }), currentPage.loading && _jsx("p", { className: "muted", role: "status", children: "Loading your reservations\u2026" }), currentPage.error && _jsxs(_Fragment, { children: [_jsx("p", { className: "form-error", role: "alert", children: currentPage.error }), _jsx("button", { type: "button", onClick: () => void loadPage(view), children: "Try again" })] }), !currentPage.loading && !currentPage.error && currentPage.items.length === 0 && (_jsx("p", { className: "muted", role: "status", children: view === 'pending' ? 'No pending reservations.' : 'No reservation history.' })), currentPage.items.length > 0 && _jsx("div", { className: "member-loan-list", "aria-label": `${view} reservations`, children: currentPage.items.map((reservation) => _jsx(MemberReservationCard, { reservation: reservation, cancelling: cancellationInFlight.has(reservation.reservationId), onCancel: () => { setCancellationError(null); setConfirmation(reservation); } }, reservation.reservationId)) }), cancellationError && _jsxs("p", { role: "alert", children: ["Could not cancel ", cancellationError.reservation.bookTitle, ": ", cancellationError.message, " ", _jsx("button", { type: "button", onClick: () => setConfirmation(cancellationError.reservation), children: "Retry" })] }), announcement && _jsx("p", { role: "status", "aria-live": "polite", children: announcement }), confirmation && _jsxs("dialog", { ref: confirmationDialog, className: "member-confirm-dialog", "aria-modal": "true", "aria-labelledby": "cancel-reservation-title", "aria-describedby": "cancel-reservation-description", onCancel: (event) => { event.preventDefault(); if (!cancellationInFlight.has(confirmation.reservationId))
                                    dismissConfirmation(); }, children: [_jsxs("h2", { id: "cancel-reservation-title", children: ["Cancel reservation for ", confirmation.bookTitle, "?"] }), _jsxs("p", { id: "cancel-reservation-description", children: ["This will cancel your reservation for ", confirmation.bookTitle, "."] }), _jsx("button", { type: "button", disabled: cancellationInFlight.has(confirmation.reservationId), onClick: dismissConfirmation, children: "Keep reservation" }), _jsx("button", { className: "danger-button", type: "button", disabled: cancellationInFlight.has(confirmation.reservationId), onClick: () => void confirmCancellation(), children: "Confirm cancellation" })] }), currentPage.nextCursor && !currentPage.loading && _jsx("button", { type: "button", onClick: () => void loadPage(view, true), children: "Load more" })] }) }) })] }));
}
//# sourceMappingURL=MemberReservations.js.map
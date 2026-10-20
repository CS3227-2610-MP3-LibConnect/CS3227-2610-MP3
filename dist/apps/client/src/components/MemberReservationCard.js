import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const dateLabel = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};
export function MemberReservationCard({ reservation, onCancel, cancelling = false }) {
    const readyForPickup = reservation.status === 'PENDING' && Boolean(reservation.copyId && reservation.expiryDate);
    return (_jsxs("article", { className: "member-loan-card", children: [_jsx("h2", { children: reservation.bookTitle }), _jsxs("p", { children: ["Status: ", _jsx("strong", { children: reservation.status })] }), _jsxs("p", { children: ["Reserved: ", _jsx("time", { dateTime: reservation.reservationDateTime, children: dateLabel(reservation.reservationDateTime) })] }), reservation.status === 'PENDING' && (readyForPickup ? (_jsxs("p", { role: "status", children: ["Ready for pickup \u00B7 Pickup by ", _jsx("time", { dateTime: reservation.expiryDate ?? undefined, children: dateLabel(reservation.expiryDate) })] })) : _jsx("p", { role: "status", children: "Waiting for a copy" })), reservation.status === 'PENDING' && _jsx("button", { type: "button", disabled: cancelling, onClick: onCancel, children: cancelling ? 'Cancelling…' : 'Cancel Reservation' })] }));
}
//# sourceMappingURL=MemberReservationCard.js.map
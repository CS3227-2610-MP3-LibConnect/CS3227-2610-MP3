import type { MemberReservationListItem } from '../api/reservations.js';
export declare function MemberReservationCard({ reservation, onCancel, cancelling }: {
    reservation: MemberReservationListItem;
    onCancel?: () => void;
    cancelling?: boolean;
}): import("react").JSX.Element;

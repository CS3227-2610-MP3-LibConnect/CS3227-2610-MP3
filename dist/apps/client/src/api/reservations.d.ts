export interface MemberReservation {
    reservationId: string;
    memberId?: string;
    isbn: string;
    status: 'PENDING' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
    reservationDateTime?: string;
    copyId?: string | null;
    expiryDate?: string | null;
}
/** Reservation fields serialized for the My Reservations list. */
export interface MemberReservationListItem extends MemberReservation {
    bookTitle: string;
    reservationDateTime: string;
}
export type ReservationView = 'pending' | 'history';
export interface ReservationListOptions {
    limit?: number;
    cursor?: string;
}
export interface ReservationPage {
    items: MemberReservationListItem[];
    page: {
        limit: number;
        nextCursor: string | null;
    };
}
export declare const reservationApi: {
    list(view: ReservationView, options?: ReservationListOptions): Promise<ReservationPage>;
    getByIsbn(isbn: string): Promise<MemberReservation | null>;
    create(isbn: string): Promise<MemberReservation>;
    cancel(reservationId: string): Promise<void>;
};

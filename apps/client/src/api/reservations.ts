import { apiRequest } from './base.js';

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
  page: { limit: number; nextCursor: string | null };
}

function queryString(view: ReservationView, options: ReservationListOptions): string {
  const params = new URLSearchParams({ view });
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.cursor !== undefined) params.set('cursor', options.cursor);
  return params.toString();
}

export const reservationApi = {
  list(view: ReservationView, options: ReservationListOptions = {}): Promise<ReservationPage> {
    return apiRequest(`/member/reservations?${queryString(view, options)}`);
  },
  getByIsbn(isbn: string): Promise<MemberReservation | null> {
    return apiRequest(`/member/reservations/by-isbn/${encodeURIComponent(isbn)}`);
  },
  create(isbn: string): Promise<MemberReservation> {
    return apiRequest('/member/reservations', {
      method: 'POST',
      body: JSON.stringify({ isbn }),
    });
  },
  cancel(reservationId: string): Promise<void> {
    return apiRequest(`/member/reservations/${encodeURIComponent(reservationId)}`, {
      method: 'DELETE',
    });
  },
};

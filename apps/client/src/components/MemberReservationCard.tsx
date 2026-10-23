import type { MemberReservationListItem } from '../api/reservations.js';

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

export function MemberReservationCard({
  reservation,
  onCancel,
  cancelling = false,
}: {
  reservation: MemberReservationListItem;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const readyForPickup =
    reservation.status === 'PENDING' && Boolean(reservation.copyId && reservation.expiryDate);
  return (
    <article className="member-loan-card">
      <h2>{reservation.bookTitle}</h2>
      <p>
        Status: <strong>{reservation.status}</strong>
      </p>
      <p>
        Reserved:{' '}
        <time dateTime={reservation.reservationDateTime}>
          {dateLabel(reservation.reservationDateTime)}
        </time>
      </p>
      {reservation.status === 'PENDING' &&
        (readyForPickup ? (
          <p role="status">
            Ready for pickup · Pickup by{' '}
            <time dateTime={reservation.expiryDate ?? undefined}>
              {dateLabel(reservation.expiryDate!)}
            </time>
          </p>
        ) : (
          <p role="status">Waiting for a copy</p>
        ))}
      {reservation.status === 'PENDING' && (
        <button className="danger-button" type="button" disabled={cancelling} onClick={onCancel}>
          {cancelling ? 'Cancelling…' : 'Cancel Reservation'}
        </button>
      )}
    </article>
  );
}

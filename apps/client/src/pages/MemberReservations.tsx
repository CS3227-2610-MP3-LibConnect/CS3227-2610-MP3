import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/errors.js';
import {
  reservationApi,
  type MemberReservationListItem,
  type ReservationView,
} from '../api/reservations.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberReservationCard } from '../components/MemberReservationCard.js';

interface ViewState {
  items: MemberReservationListItem[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  loaded: boolean;
}
const initialState = (): ViewState => ({
  items: [],
  nextCursor: null,
  loading: false,
  error: null,
  loaded: false,
});
const allowedStatuses: Record<ReservationView, MemberReservationListItem['status'][]> = {
  pending: ['PENDING'],
  history: ['FULFILLED', 'CANCELLED', 'EXPIRED'],
};

export function MemberReservations() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<ReservationView>('pending');
  const [pendingPage, setPendingPage] = useState<ViewState>(() => initialState());
  const [historyPage, setHistoryPage] = useState<ViewState>(() => initialState());
  const [confirmation, setConfirmation] = useState<MemberReservationListItem | null>(null);
  const [cancellationInFlight, setCancellationInFlight] = useState<Set<string>>(() => new Set());
  const [cancellationError, setCancellationError] = useState<{
    reservation: MemberReservationListItem;
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const cancellationGuard = useRef(new Set<string>());
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const currentPage = view === 'pending' ? pendingPage : historyPage;
  const loadPage = async (view: ReservationView, append = false) => {
    const setter = view === 'pending' ? setPendingPage : setHistoryPage;
    const snapshot = view === 'pending' ? pendingPage : historyPage;
    setter((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await reservationApi.list(
        view,
        append && snapshot.nextCursor ? { cursor: snapshot.nextCursor } : {},
      );
      setter((current) => {
        const combined = append ? [...current.items, ...result.items] : result.items;
        const unique = new Map(combined.map((item) => [item.reservationId, item]));
        const items = [...unique.values()]
          .filter((item) => allowedStatuses[view].includes(item.status))
          .sort(
            (a, b) =>
              b.reservationDateTime.localeCompare(a.reservationDateTime) ||
              b.reservationId.localeCompare(a.reservationId),
          );
        return {
          items,
          nextCursor: result.page.nextCursor,
          loading: false,
          error: null,
          loaded: true,
        };
      });
    } catch (cause) {
      setter((current) => ({
        ...current,
        loading: false,
        error: cause instanceof Error ? cause.message : 'Could not load reservations.',
      }));
    }
  };

  useEffect(() => {
    void loadPage('pending');
  }, []);
  useEffect(() => {
    const dialog = confirmationDialog.current;
    if (confirmation && dialog && !dialog.open) dialog.showModal();
    if (!confirmation && dialog?.open) dialog.close();
  }, [confirmation]);
  const chooseView = (next: ReservationView) => {
    setView(next);
    const page = next === 'pending' ? pendingPage : historyPage;
    if (!page.loaded && !page.loading) void loadPage(next);
  };

  const confirmCancellation = async () => {
    const reservation = confirmation;
    if (
      !reservation ||
      reservation.status !== 'PENDING' ||
      cancellationGuard.current.has(reservation.reservationId)
    )
      return;
    cancellationGuard.current.add(reservation.reservationId);
    setCancellationInFlight((current) => new Set(current).add(reservation.reservationId));
    setCancellationError(null);
    setAnnouncement('');
    try {
      try {
        await reservationApi.cancel(reservation.reservationId);
      } catch (cause) {
        setPendingPage((current) => ({ ...current, loading: false }));
        if (cause instanceof ApiClientError && cause.status === 409) {
          setConfirmation(null);
          setCancellationError(null);
          setPendingPage(initialState());
          setHistoryPage(initialState());
          await Promise.all([loadPage('pending'), loadPage('history')]);
          setAnnouncement(
            'This reservation is no longer pending and can no longer be cancelled. Your reservations have been refreshed.',
          );
        } else {
          setCancellationError({
            reservation,
            message:
              cause instanceof Error
                ? cause.message
                : 'Could not cancel this reservation. Try again.',
          });
        }
        return;
      }

      setConfirmation(null);
      setPendingPage(initialState());
      setHistoryPage(initialState());
      setAnnouncement('Reservation cancelled successfully.');
      await Promise.all([loadPage('pending'), loadPage('history')]);
    } finally {
      cancellationGuard.current.delete(reservation.reservationId);
      setCancellationInFlight((current) => {
        const next = new Set(current);
        next.delete(reservation.reservationId);
        return next;
      });
    }
  };
  const dismissConfirmation = () => setConfirmation(null);

  if (!user || user.accountType !== 'MEMBER') return null;
  return (
    <main className="dashboard-page member-dashboard-page">
      <MemberNavigation onLogout={logout} />
      <section className="member-profile-content" aria-labelledby="member-reservations-heading">
        <MemberProfileHub>
          <div className="member-loans-page">
            <p className="eyebrow">MEMBER ACCOUNT</p>
            <h1 id="member-reservations-heading">My Reservations</h1>
            <div className="loan-view-toggle" role="group" aria-label="Reservation view">
              <button
                type="button"
                aria-pressed={view === 'pending'}
                onClick={() => chooseView('pending')}
              >
                Pending
              </button>
              <button
                type="button"
                aria-pressed={view === 'history'}
                onClick={() => chooseView('history')}
              >
                History
              </button>
            </div>
            {currentPage.loading && (
              <p className="muted" role="status">
                Loading your reservations…
              </p>
            )}
            {currentPage.error && (
              <>
                <p className="form-error" role="alert">
                  {currentPage.error}
                </p>
                <button type="button" onClick={() => void loadPage(view)}>
                  Try again
                </button>
              </>
            )}
            {!currentPage.loading && !currentPage.error && currentPage.items.length === 0 && (
              <p className="muted" role="status">
                {view === 'pending' ? 'No pending reservations.' : 'No reservation history.'}
              </p>
            )}
            {currentPage.items.length > 0 && (
              <div className="member-loan-list" aria-label={`${view} reservations`}>
                {currentPage.items.map((reservation) => (
                  <MemberReservationCard
                    key={reservation.reservationId}
                    reservation={reservation}
                    cancelling={cancellationInFlight.has(reservation.reservationId)}
                    onCancel={() => {
                      setCancellationError(null);
                      setConfirmation(reservation);
                    }}
                  />
                ))}
              </div>
            )}
            {cancellationError && (
              <p role="alert">
                Could not cancel {cancellationError.reservation.bookTitle}:{' '}
                {cancellationError.message}{' '}
                <button
                  type="button"
                  onClick={() => setConfirmation(cancellationError.reservation)}
                >
                  Retry
                </button>
              </p>
            )}
            {announcement && (
              <p role="status" aria-live="polite">
                {announcement}
              </p>
            )}
            {confirmation && (
              <dialog
                ref={confirmationDialog}
                className="member-confirm-dialog"
                aria-modal="true"
                aria-labelledby="cancel-reservation-title"
                aria-describedby="cancel-reservation-description"
                onCancel={(event) => {
                  event.preventDefault();
                  if (!cancellationInFlight.has(confirmation.reservationId)) dismissConfirmation();
                }}
              >
                <h2 id="cancel-reservation-title">
                  Cancel reservation for {confirmation.bookTitle}?
                </h2>
                <p id="cancel-reservation-description">
                  This will cancel your reservation for {confirmation.bookTitle}.
                </p>
                <button
                  type="button"
                  disabled={cancellationInFlight.has(confirmation.reservationId)}
                  onClick={dismissConfirmation}
                >
                  Keep reservation
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={cancellationInFlight.has(confirmation.reservationId)}
                  onClick={() => void confirmCancellation()}
                >
                  Confirm cancellation
                </button>
              </dialog>
            )}
            {currentPage.nextCursor && !currentPage.loading && (
              <button type="button" onClick={() => void loadPage(view, true)}>
                Load more
              </button>
            )}
          </div>
        </MemberProfileHub>
      </section>
    </main>
  );
}

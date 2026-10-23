import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { catalogApi, type CopyStatus } from '../api/catalog.js';
import { reservationApi, type MemberReservation } from '../api/reservations.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { useAuth } from '../auth/AuthContext.js';

interface BookDetails {
  isbn: string;
  title: string;
  author: string | string[];
  publicationYear: number;
  publisher: string;
  category: string;
  synopsis: string;
}

interface BookCopy {
  copyId: string;
  shelfLocation: string | null;
  status: CopyStatus;
}

interface BookDetailResponse {
  book: BookDetails;
  copies: BookCopy[];
  availability: {
    totalCopies: number;
    availableCount: number;
    byStatus: Partial<Record<CopyStatus, number>>;
  };
}

export function MemberBookDetail() {
  const { user, logout } = useAuth();
  const { isbn = '' } = useParams<{ isbn: string }>();
  const [result, setResult] = useState<BookDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [reservation, setReservation] = useState<MemberReservation | null>(null);
  const [reservationLoaded, setReservationLoaded] = useState(false);
  const [reservationError, setReservationError] = useState('');
  const [reservationMessage, setReservationMessage] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reservationBusy, setReservationBusy] = useState(false);
  const requestSequence = useRef(0);
  const reservationRequestSequence = useRef(0);
  const inFlight = useRef(false);
  const reservationHeading = useRef<HTMLHeadingElement | null>(null);
  const reservationActionButton = useRef<HTMLButtonElement | null>(null);
  const confirmationDialog = useRef<HTMLDivElement | null>(null);
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  const dismissButton = useRef<HTMLButtonElement | null>(null);

  const loadBook = useCallback(
    async (preserve = false) => {
      const sequence = ++requestSequence.current;
      setLoading(true);
      if (!preserve) {
        setResult(null);
        setNotFound(false);
        setError(false);
      }
      try {
        const response = (await catalogApi.getBook(isbn)) as BookDetailResponse;
        if (requestSequence.current === sequence) setResult(response);
      } catch (cause) {
        if (requestSequence.current === sequence) {
          if (cause instanceof ApiClientError && cause.status === 404) setNotFound(true);
          else setError(true);
        }
      } finally {
        if (requestSequence.current === sequence) setLoading(false);
      }
    },
    [isbn],
  );

  useEffect(() => {
    void loadBook();
    return () => {
      requestSequence.current += 1;
    };
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
    } catch {
      if (reservationRequestSequence.current === sequence) {
        setReservationError(
          'Could not check your reservation. Try again to load your current status.',
        );
        setReservationLoaded(false);
      }
    }
  }, [isbn]);

  useEffect(() => {
    void loadReservation();
    return () => {
      reservationRequestSequence.current += 1;
    };
  }, [loadReservation]);

  useEffect(() => {
    if (!confirmCancel) return;
    confirmButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmCancel(false);
        requestAnimationFrame(() => reservationActionButton.current?.focus());
      } else if (event.key === 'Tab') {
        const first = confirmButton.current;
        const last = dismissButton.current;
        const focusIsInside = confirmationDialog.current?.contains(document.activeElement) ?? false;
        if (!focusIsInside) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
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
    if (inFlight.current || !reservationLoaded) return;
    inFlight.current = true;
    setReservationBusy(true);
    setReservationError('');
    setReservationMessage('');
    setConfirmCancel(false);
    try {
      if (reservation?.status === 'PENDING') {
        await reservationApi.cancel(reservation.reservationId);
        setReservationMessage('Your reservation was cancelled.');
      } else {
        await reservationApi.create(isbn);
        setReservationMessage('Your reservation was created.');
      }
      await refreshReservationState();
    } catch (cause) {
      const conflict =
        cause instanceof ApiClientError &&
        (cause.status === 409 ||
          cause.status === 412 ||
          cause.code === 'AVAILABLE_COPY' ||
          cause.code === 'RESERVATION_CONFLICT');
      setReservationError(
        conflict
          ? reservation?.status === 'PENDING'
            ? 'This reservation can no longer be cancelled. Your current status has been refreshed.'
            : 'A copy may now be available or a pending reservation already exists. Your current status has been refreshed.'
          : cause instanceof Error
            ? cause.message
            : 'The reservation request failed. Please try again.',
      );
      if (conflict) await refreshReservationState();
    } finally {
      inFlight.current = false;
      setReservationBusy(false);
      requestAnimationFrame(() => reservationHeading.current?.focus());
    }
  };

  if (!user || user.accountType !== 'MEMBER') return null;

  return (
    <main className="dashboard-page member-dashboard-page">
      <MemberNavigation onLogout={logout} />
      <section
        className="member-detail-content"
        aria-labelledby="book-detail-heading"
        aria-busy={loading}
      >
        <Link className="member-detail-back" to="/member/dashboard">
          Back to catalog
        </Link>
        {loading && <p role="status">Loading book details…</p>}
        {!loading && notFound && (
          <div className="member-detail-message">
            <h1 id="book-detail-heading">Book not found</h1>
            <p>We could not find a book with ISBN {isbn}.</p>
          </div>
        )}
        {!loading && error && (
          <div className="member-detail-message" role="alert">
            <h1 id="book-detail-heading">Could not load book details</h1>
            <p>Please check your connection and try again.</p>
            <button className="primary-button" type="button" onClick={() => void loadBook()}>
              Try again
            </button>
          </div>
        )}
        {result && (
          <article className="member-book-detail">
            <p className="eyebrow">BOOK DETAILS</p>
            <h1 id="book-detail-heading">{result.book.title}</h1>
            <dl className="member-book-metadata">
              <div>
                <dt>ISBN</dt>
                <dd>{result.book.isbn}</dd>
              </div>
              <div>
                <dt>Author</dt>
                <dd>
                  {Array.isArray(result.book.author)
                    ? result.book.author.join(', ')
                    : result.book.author}
                </dd>
              </div>
              <div>
                <dt>Publication year</dt>
                <dd>{result.book.publicationYear}</dd>
              </div>
              <div>
                <dt>Publisher</dt>
                <dd>{result.book.publisher}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{result.book.category}</dd>
              </div>
            </dl>
            <section aria-labelledby="book-synopsis-heading">
              <h2 id="book-synopsis-heading">Synopsis</h2>
              <p>{result.book.synopsis || 'No synopsis is available.'}</p>
            </section>
            <section aria-labelledby="copy-availability-heading">
              <h2 id="copy-availability-heading">Copy availability</h2>
              <p>
                {result.availability.availableCount} of {result.availability.totalCopies} copies
                available
              </p>
              {result.copies.length === 0 ? (
                <p>No physical copies are listed for this title.</p>
              ) : (
                <ul className="member-copy-list">
                  {result.copies.map((copy) => (
                    <li key={copy.copyId}>
                      <span>
                        <strong>Copy ID:</strong> {copy.copyId}
                      </span>
                      <span>
                        <strong>Shelf location:</strong> {copy.shelfLocation ?? 'Not on shelf'}
                      </span>
                      <span>
                        <strong>Status:</strong> {copy.status.replaceAll('_', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="reservation-heading">
              <h2 ref={reservationHeading} id="reservation-heading" tabIndex={-1}>
                Reservation
              </h2>
              {reservationError && <p role="alert">{reservationError}</p>}
              {reservationMessage && (
                <p role="status" aria-live="polite">
                  {reservationMessage}
                </p>
              )}
              {!reservationLoaded ? (
                <div>
                  <p role="status">
                    {reservationError
                      ? 'Reservation status is unavailable.'
                      : 'Loading reservation status…'}
                  </p>
                  {reservationError && (
                    <button type="button" onClick={() => void loadReservation()}>
                      Try again
                    </button>
                  )}
                </div>
              ) : (
                <button
                  className={`primary-button${reservation?.status === 'PENDING' ? ' danger-button' : ''}`}
                  type="button"
                  disabled={
                    reservationBusy || (!reservation && !(result.availability.availableCount <= 0))
                  }
                  ref={reservationActionButton}
                  onClick={() =>
                    reservation?.status === 'PENDING'
                      ? setConfirmCancel(true)
                      : void performReservationAction()
                  }
                >
                  {reservation?.status === 'PENDING' ? 'Cancel Reservation' : 'Make Reservation'}
                </button>
              )}
              {confirmCancel && reservation?.status === 'PENDING' && (
                <div className="member-dialog-backdrop">
                  <div
                    ref={confirmationDialog}
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="cancel-reservation-title"
                    aria-describedby="cancel-reservation-description"
                    className="member-confirm-dialog"
                  >
                    <h3 id="cancel-reservation-title">Cancel reservation?</h3>
                    <p id="cancel-reservation-description">
                      Cancel your reservation for {result.book.title}?
                    </p>
                    <button
                      className="danger-button"
                      ref={confirmButton}
                      type="button"
                      disabled={reservationBusy}
                      onClick={() => void performReservationAction()}
                    >
                      Confirm cancellation
                    </button>
                    <button
                      ref={dismissButton}
                      type="button"
                      onClick={() => {
                        setConfirmCancel(false);
                        requestAnimationFrame(() => reservationActionButton.current?.focus());
                      }}
                    >
                      Keep Reservation
                    </button>
                  </div>
                </div>
              )}
            </section>
          </article>
        )}
      </section>
    </main>
  );
}

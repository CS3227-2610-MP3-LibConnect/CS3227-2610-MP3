import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import {
  reservationsFinesApi,
  type FineSummary,
  type ReservationSummary,
} from '../api/circulation.js';
import { useAuth } from '../auth/AuthContext.js';

function displayError(caught: unknown, fallback: string): string {
  return caught instanceof ApiClientError ? caught.message : fallback;
}

export function LibrarianReservationsFinesPage() {
  const { logout } = useAuth();
  const [isbn, setIsbn] = useState('');
  const [reservationStatus, setReservationStatus] = useState('');
  const [fineStatus, setFineStatus] = useState('');
  const [memberId, setMemberId] = useState('');
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [fines, setFines] = useState<FineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [messageMemberId, setMessageMemberId] = useState('');
  const [message, setMessage] = useState('');
  const [messageIdempotencyKey, setMessageIdempotencyKey] = useState<string | null>(null);

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
      if (requestId !== requestSequence.current) return;
      setReservations(reservationPage.items);
      setFines(finePage.items);
    } catch (caught) {
      if (requestId === requestSequence.current)
        setError(displayError(caught, 'Reservations and fines could not be loaded.'));
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [fineStatus, isbn, memberId, reservationStatus]);

  // Filters apply on submit or refresh, not on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadData();
  }, []);

  async function waive(fine: FineSummary) {
    if (
      !window.confirm(
        `Waive the ${fine.currency} ${(fine.amountMinorUnits / 100).toFixed(2)} fine for ${fine.bookTitle}?`,
      )
    )
      return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await reservationsFinesApi.waiveFine(fine.fineId);
      setSuccess('Fine waived and the member was notified.');
      await loadData();
    } catch (caught) {
      setError(displayError(caught, 'The fine could not be waived. Refresh and try again.'));
    } finally {
      setPending(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!messageMemberId.trim() || !message.trim()) {
      setError('Member ID and message are required.');
      return;
    }
    if (!window.confirm(`Send this message to member ${messageMemberId.trim()}?`)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    const idempotencyKey = messageIdempotencyKey ?? `message-${crypto.randomUUID()}`;
    setMessageIdempotencyKey(idempotencyKey);
    try {
      await reservationsFinesApi.sendMessage(
        messageMemberId.trim(),
        message.trim(),
        idempotencyKey,
      );
      setMessageMemberId('');
      setMessage('');
      setMessageIdempotencyKey(null);
      setSuccess('Message sent.');
      await loadData();
    } catch (caught) {
      setError(displayError(caught, 'The message could not be sent. Refresh and try again.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="brand-lockup" to="/librarian/dashboard" aria-label="LibConnect home">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>LibConnect</span>
        </Link>
        <nav className="dashboard-actions" aria-label="Reservation and fine navigation">
          <Link className="text-button" to="/librarian/dashboard">
            Dashboard
          </Link>
          <button className="text-button" onClick={() => void logout()}>
            Sign out
          </button>
        </nav>
      </header>
      <section className="catalog-panel" aria-labelledby="reservations-fines-title">
        <p className="eyebrow">LIBRARIAN TOOLS</p>
        <h1 id="reservations-fines-title">Reservations &amp; fines</h1>
        <p className="muted">
          Review bounded operational queues. Member IDs are shown for lookup; names, emails, and
          user IDs stay private.
        </p>
        {success && (
          <p className="form-success" role="status">
            {success}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <form
          className="catalog-search"
          onSubmit={(event) => {
            event.preventDefault();
            void loadData();
          }}
          aria-label="Filter reservations and fines"
        >
          <label className="field">
            ISBN
            <input value={isbn} onChange={(event) => setIsbn(event.target.value)} maxLength={32} />
          </label>
          <label className="field">
            Reservation status
            <select
              value={reservationStatus}
              onChange={(event) => setReservationStatus(event.target.value)}
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="FULFILLED">Fulfilled</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </label>
          <label className="field">
            Fine status
            <select value={fineStatus} onChange={(event) => setFineStatus(event.target.value)}>
              <option value="">All</option>
              <option value="OUTSTANDING">Outstanding</option>
              <option value="PAID">Paid</option>
              <option value="WAIVED">Waived</option>
            </select>
          </label>
          <label className="field">
            Member ID
            <input
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              maxLength={128}
            />
          </label>
          <button
            className="primary-button compact-button"
            type="submit"
            disabled={loading || pending}
          >
            Apply filters
          </button>
          <button
            className="text-button compact-button"
            type="button"
            onClick={() => void loadData()}
            disabled={loading || pending}
          >
            Refresh
          </button>
        </form>
        {loading ? (
          <p className="muted" aria-live="polite">
            Loading reservations and fines…
          </p>
        ) : (
          <div className="catalog-layout">
            <section aria-labelledby="reservation-queue-title">
              <h2 id="reservation-queue-title">Reservation queue</h2>
              {reservations.length === 0 ? (
                <p className="empty-state">No reservations match these filters.</p>
              ) : (
                <div className="account-table-wrap">
                  <table className="account-table">
                    <caption className="sr-only">Librarian reservation queue</caption>
                    <thead>
                      <tr>
                        <th scope="col">Reservation</th>
                        <th scope="col">Member</th>
                        <th scope="col">ISBN</th>
                        <th scope="col">Status</th>
                        <th scope="col">Pickup expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map((reservation) => (
                        <tr key={reservation.reservationId}>
                          <th scope="row">{reservation.reservationId}</th>
                          <td>{reservation.memberId}</td>
                          <td>{reservation.isbn}</td>
                          <td>
                            <span
                              className={`status-pill status-${reservation.status.toLowerCase()}`}
                            >
                              {reservation.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            {reservation.expiryDate
                              ? new Date(reservation.expiryDate).toLocaleDateString()
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section aria-labelledby="fine-queue-title">
              <h2 id="fine-queue-title">Fine queue</h2>
              {fines.length === 0 ? (
                <p className="empty-state">No fines match these filters.</p>
              ) : (
                <div className="account-table-wrap">
                  <table className="account-table">
                    <caption className="sr-only">Librarian fine queue</caption>
                    <thead>
                      <tr>
                        <th scope="col">Book</th>
                        <th scope="col">Member</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="sr-only">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {fines.map((fine) => (
                        <tr key={fine.fineId}>
                          <th scope="row">
                            {fine.bookTitle}
                            <small>{fine.fineId}</small>
                          </th>
                          <td>{fine.memberId}</td>
                          <td>
                            {fine.currency} {(fine.amountMinorUnits / 100).toFixed(2)}
                          </td>
                          <td>
                            <span className={`status-pill status-${fine.status.toLowerCase()}`}>
                              {fine.status}
                            </span>
                          </td>
                          <td>
                            {fine.status === 'OUTSTANDING' && (
                              <button
                                className="text-button compact-button"
                                type="button"
                                onClick={() => void waive(fine)}
                                disabled={pending}
                              >
                                Waive
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
        <form
          className="catalog-form-shell catalog-form"
          onSubmit={(event) => void sendMessage(event)}
          aria-labelledby="message-title"
        >
          <h2 id="message-title">Send a member message</h2>
          <p className="muted">
            Messages are plain text and delivered only to active members. Do not include private
            credentials or sensitive details.
          </p>
          <label className="field">
            Member ID
            <input
              value={messageMemberId}
              onChange={(event) => {
                setMessageMemberId(event.target.value);
                setMessageIdempotencyKey(null);
              }}
              maxLength={128}
              required
            />
          </label>
          <label className="field">
            Message
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setMessageIdempotencyKey(null);
              }}
              maxLength={2000}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? 'Sending…' : 'Send message'}
          </button>
        </form>
      </section>
    </main>
  );
}

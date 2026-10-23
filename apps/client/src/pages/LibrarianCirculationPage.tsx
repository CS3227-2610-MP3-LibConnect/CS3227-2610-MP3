import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import {
  circulationApi,
  type PendingCloseItem,
  type ReturnDisposition,
  type ReturnPreview,
} from '../api/circulation.js';
import { useAuth } from '../auth/AuthContext.js';

function displayError(caught: unknown, fallback: string): string {
  return caught instanceof ApiClientError ? caught.message : fallback;
}

export function LibrarianCirculationPage() {
  const { logout } = useAuth();
  const [memberId, setMemberId] = useState('');
  const [copyId, setCopyId] = useState('');
  const [items, setItems] = useState<PendingCloseItem[]>([]);
  const [selected, setSelected] = useState<{
    item: PendingCloseItem;
    preview: ReturnPreview | null;
  } | null>(null);
  const [disposition, setDisposition] = useState<ReturnDisposition>('AVAILABLE');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await circulationApi.pendingClose()).items);
    } catch (caught) {
      setError(displayError(caught, 'Pending closure reports could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function createLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberId.trim() || !copyId.trim()) {
      setError('Member ID and copy ID are required.');
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await circulationApi.createLoan(memberId.trim(), copyId.trim());
      setMemberId('');
      setCopyId('');
      setSuccess('Loan created.');
      await loadQueue();
    } catch (caught) {
      setError(displayError(caught, 'The loan could not be created.'));
    } finally {
      setPending(false);
    }
  }

  async function selectReport(item: PendingCloseItem) {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const preview =
        item.loan.closureReportType === 'RETURNED'
          ? await circulationApi.returnPreview(item.loan.loanId)
          : null;
      setDisposition(preview?.allowedDispositions[0] ?? 'AVAILABLE');
      setSelected({ item, preview });
    } catch (caught) {
      setError(displayError(caught, 'The report preview could not be loaded.'));
    } finally {
      setPending(false);
    }
  }

  async function review(decision: 'CONFIRM' | 'REJECT') {
    if (!selected) return;
    if (
      decision === 'CONFIRM' &&
      selected.item.loan.closureReportType === 'RETURNED' &&
      !selected.preview?.allowedDispositions.includes(disposition)
    ) {
      setError('Choose an allowed return disposition before confirming.');
      return;
    }
    if (
      !window.confirm(
        `${decision === 'CONFIRM' ? 'Confirm' : 'Reject'} this ${selected.item.loan.closureReportType?.toLowerCase()} report?`,
      )
    )
      return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await circulationApi.review(
        selected.item.loan.loanId,
        decision,
        decision === 'CONFIRM' && selected.item.loan.closureReportType === 'RETURNED'
          ? disposition
          : undefined,
      );
      setSelected(null);
      setSuccess('Closure review saved.');
      await loadQueue();
    } catch (caught) {
      setError(displayError(caught, 'The closure review could not be saved.'));
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
        <nav className="dashboard-actions" aria-label="Circulation navigation">
          <Link className="text-button" to="/librarian/dashboard">
            Dashboard
          </Link>
          <button className="text-button" onClick={() => void logout()}>
            Sign out
          </button>
        </nav>
      </header>
      <section className="manager-panel" aria-labelledby="circulation-title">
        <p className="eyebrow">LIBRARIAN TOOLS</p>
        <h1 id="circulation-title">Loans &amp; closure review</h1>
        <p className="muted">
          Create loans and review member return or loss reports. Server checks the member, copy, and
          current state before every change.
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
          className="reset-password-form"
          onSubmit={(event) => void createLoan(event)}
          aria-labelledby="create-loan-title"
        >
          <h2 id="create-loan-title">Create a loan</h2>
          <label className="field">
            Member ID
            <input
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              maxLength={128}
              required
            />
          </label>
          <label className="field">
            Copy ID
            <input
              value={copyId}
              onChange={(event) => setCopyId(event.target.value)}
              maxLength={128}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Create loan'}
          </button>
        </form>
        <div className="section-heading" style={{ marginTop: '2.5rem' }}>
          <h2>Pending reports</h2>
          <button
            className="text-button compact-button"
            type="button"
            onClick={() => void loadQueue()}
            disabled={loading || pending}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="muted" aria-live="polite">
            Loading pending reports…
          </p>
        ) : items.length === 0 ? (
          <p className="empty-state">No pending return or loss reports.</p>
        ) : (
          <div className="account-table-wrap">
            <table className="account-table">
              <caption className="sr-only">Pending member closure reports</caption>
              <thead>
                <tr>
                  <th scope="col">Book</th>
                  <th scope="col">Member</th>
                  <th scope="col">Report</th>
                  <th scope="col">Copy</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.loan.loanId}>
                    <th scope="row">
                      {item.loan.bookTitle}
                      <small>{item.loan.loanId}</small>
                    </th>
                    <td>{item.loan.memberId}</td>
                    <td>{item.loan.closureReportType}</td>
                    <td>
                      {item.copy.copyId}
                      <small>{item.copy.status.replace('_', ' ')}</small>
                    </td>
                    <td>
                      <button
                        className="text-button compact-button"
                        type="button"
                        onClick={() => void selectReport(item)}
                        disabled={pending}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selected && (
          <section className="catalog-form-shell" aria-labelledby="review-title">
            <h2 id="review-title">
              Review {selected.item.loan.closureReportType?.toLowerCase()} report
            </h2>
            <p className="muted">
              {selected.item.loan.bookTitle} · {selected.item.loan.memberId} ·{' '}
              {selected.item.copy.copyId}
            </p>
            {selected.item.loan.closureReportType === 'RETURNED' && selected.preview && (
              <label className="field">
                Return disposition
                <select
                  value={disposition}
                  onChange={(event) => setDisposition(event.target.value as ReturnDisposition)}
                >
                  {selected.preview.allowedDispositions.map((option) => (
                    <option value={option} key={option}>
                      {option.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected.item.loan.closureReportType === 'LOST' && (
              <p className="muted">
                Confirming marks the copy lost and creates the server-policy fine. The fine amount
                cannot be changed here.
              </p>
            )}
            <div className="catalog-form-actions">
              <button
                className="primary-button compact-button"
                type="button"
                onClick={() => void review('CONFIRM')}
                disabled={pending}
              >
                Confirm report
              </button>
              <button
                className="text-button compact-button"
                type="button"
                onClick={() => void review('REJECT')}
                disabled={pending}
              >
                Reject report
              </button>
              <button
                className="text-button compact-button"
                type="button"
                onClick={() => setSelected(null)}
                disabled={pending}
              >
                Cancel
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

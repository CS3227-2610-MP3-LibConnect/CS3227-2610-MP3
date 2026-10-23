import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import {
  librarianAssistantApi,
  type AssistantDraft,
  type AssistantSummary,
} from '../api/librarian-assistant.js';
import { circulationApi, type PendingCloseItem } from '../api/circulation.js';
import { reservationsFinesApi } from '../api/circulation.js';
import { useAuth } from '../auth/AuthContext.js';

function displayError(caught: unknown, fallback: string): string {
  return caught instanceof ApiClientError ? caught.message : fallback;
}

export function LibrarianAssistantPage() {
  const { logout } = useAuth();
  const [reports, setReports] = useState<PendingCloseItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [summary, setSummary] = useState<AssistantSummary | null>(null);
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [draftText, setDraftText] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await circulationApi.pendingClose();
      setReports(result.items);
      setSelectedIds((current) =>
        current.filter((id) => result.items.some((item) => item.loan.loanId === id)),
      );
    } catch (caught) {
      setError(displayError(caught, 'Pending reports could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  function toggleReport(loanId: string) {
    setSelectedIds((current) =>
      current.includes(loanId)
        ? current.filter((id) => id !== loanId)
        : current.length >= 20
          ? current
          : [...current, loanId],
    );
  }

  async function summarize(event?: FormEvent) {
    event?.preventDefault();
    if (selectedIds.length === 0) {
      setError('Select at least one pending report.');
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    setDraft(null);
    try {
      setSummary(await librarianAssistantApi.summarize(selectedIds));
    } catch (caught) {
      setSummary(null);
      setError(displayError(caught, 'The assistant is unavailable. Refresh and try again.'));
    } finally {
      setPending(false);
    }
  }

  async function createDraft(item: PendingCloseItem) {
    const purpose =
      item.loan.closureReportType === 'RETURNED' ? 'RETURN_FOLLOW_UP' : 'LOSS_FOLLOW_UP';
    setPending(true);
    setError(null);
    setSuccess(null);
    setSummary(null);
    try {
      const result = await librarianAssistantApi.draft(item.loan.loanId, purpose);
      setDraft(result);
      setDraftText(result.message);
    } catch (caught) {
      setDraft(null);
      setError(displayError(caught, 'The draft could not be prepared. Refresh and try again.'));
    } finally {
      setPending(false);
    }
  }

  async function sendDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft || !draftText.trim()) {
      setError('Review and enter a draft before sending.');
      return;
    }
    if (!window.confirm(`Send this reviewed message to member ${draft.memberId}?`)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await reservationsFinesApi.sendMessage(
        draft.memberId,
        draftText.trim(),
        `ai-draft-${crypto.randomUUID()}`,
      );
      setDraft(null);
      setDraftText('');
      setSuccess('The reviewed message was sent through the normal notification workflow.');
      await loadReports();
    } catch (caught) {
      setError(displayError(caught, 'The message was not sent. Refresh and try again.'));
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
        <nav className="dashboard-actions" aria-label="Assistant navigation">
          <Link className="text-button" to="/librarian/dashboard">
            Dashboard
          </Link>
          <button className="text-button" onClick={() => void logout()}>
            Sign out
          </button>
        </nav>
      </header>
      <section className="catalog-panel" aria-labelledby="assistant-title">
        <p className="eyebrow">LIBRARIAN TOOLS</p>
        <h1 id="assistant-title">Review assistant</h1>
        <p className="muted">
          AI-generated summaries and drafts are advisory and untrusted. Review every result; the
          assistant cannot confirm reports or send messages by itself.
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
        <div className="section-heading">
          <h2>Pending reports</h2>
          <button
            className="text-button compact-button"
            type="button"
            onClick={() => void loadReports()}
            disabled={loading || pending}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="muted" aria-live="polite">
            Loading pending reports…
          </p>
        ) : reports.length === 0 ? (
          <p className="empty-state">No pending return or loss reports.</p>
        ) : (
          <form onSubmit={(event) => void summarize(event)}>
            <div className="account-table-wrap">
              <table className="account-table">
                <caption className="sr-only">
                  Pending reports available to the review assistant
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Select</span>
                    </th>
                    <th scope="col">Book</th>
                    <th scope="col">Member</th>
                    <th scope="col">Report</th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((item) => (
                    <tr key={item.loan.loanId}>
                      <td>
                        <input
                          aria-label={`Select ${item.loan.bookTitle}`}
                          type="checkbox"
                          checked={selectedIds.includes(item.loan.loanId)}
                          onChange={() => toggleReport(item.loan.loanId)}
                          disabled={pending}
                        />
                      </td>
                      <th scope="row">
                        {item.loan.bookTitle}
                        <small>{item.loan.loanId}</small>
                      </th>
                      <td>{item.loan.memberId}</td>
                      <td>{item.loan.closureReportType}</td>
                      <td>
                        <button
                          className="text-button compact-button"
                          type="button"
                          onClick={() => void createDraft(item)}
                          disabled={pending}
                        >
                          Prepare draft
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="primary-button compact-button"
              type="submit"
              disabled={pending || selectedIds.length === 0}
            >
              {pending ? 'Working…' : 'Summarize selected reports'}
            </button>
          </form>
        )}
        {summary && (
          <section className="catalog-form-shell" aria-labelledby="summary-title">
            <p className="eyebrow">AI-GENERATED · ADVISORY</p>
            <h2 id="summary-title">Pending-report summary</h2>
            <p>{summary.summary}</p>
            {summary.uncertainty && (
              <p className="muted">
                <strong>Uncertainty:</strong> {summary.uncertainty}
              </p>
            )}
            <ul>
              {summary.items.map((item) => (
                <li key={item.loanId}>
                  <strong>{item.bookTitle}</strong> · {item.action.replace('_', ' ')} — {item.facts}
                </li>
              ))}
            </ul>
            <p className="muted">
              Review the report in the normal closure workflow before taking action.
            </p>
          </section>
        )}
        {draft && (
          <form
            className="catalog-form-shell catalog-form"
            onSubmit={(event) => void sendDraft(event)}
            aria-labelledby="draft-title"
          >
            <p className="eyebrow">AI-GENERATED · EDIT BEFORE SENDING</p>
            <h2 id="draft-title">Notification draft</h2>
            <p className="muted">
              For member {draft.memberId}. This is an ephemeral preview and has not been saved as a
              notification.
            </p>
            <label className="field">
              Reviewed message
              <textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                maxLength={2000}
                disabled={pending}
                required
              />
            </label>
            <p className="muted">
              <strong>Rationale:</strong> {draft.rationale}
            </p>
            {draft.warning && <p className="form-error">Warning: {draft.warning}</p>}
            <p className="muted">
              Explicit confirmation is required; sending uses the existing active-member and
              idempotency checks.
            </p>
            <div className="catalog-form-actions">
              <button className="primary-button compact-button" type="submit" disabled={pending}>
                {pending ? 'Sending…' : 'Confirm and send reviewed message'}
              </button>
              <button
                className="text-button compact-button"
                type="button"
                onClick={() => {
                  setDraft(null);
                  setDraftText('');
                }}
                disabled={pending}
              >
                Discard draft
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/errors.js';
import { fineApi, type FineView, type MemberFine } from '../api/fines.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';

export function formatFineAmount(fine: MemberFine): string {
  if (!Number.isSafeInteger(fine.amountMinorUnits) || fine.amountMinorUnits < 0) return 'Amount unavailable';
  const cents = BigInt(fine.amountMinorUnits);
  const whole = (cents / 100n).toString();
  const fraction = (cents % 100n).toString().padStart(2, '0');
  const grouped = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 }).format(BigInt(whole));
  return `${fine.currency} ${grouped}.${fraction}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium' }).format(date);
}

export function MemberFines() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<FineView>('outstanding');
  const [outstanding, setOutstanding] = useState<MemberFine[]>([]);
  const [history, setHistory] = useState<MemberFine[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemberFine | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pagePendingRef = useRef(false);

  const loadView = useCallback(async (target: FineView, reset = true) => {
    if (target === 'history' && !reset && (!nextCursor || pagePendingRef.current)) return;
    const cursor = target === 'history' && !reset ? nextCursor ?? undefined : undefined;
    if (target === 'history' && !reset) pagePendingRef.current = true;
    if (reset) { setLoading(true); setError(null); }
    else setLoadingMore(true);
    try {
      const result = await fineApi.listFines(target, cursor);
      if (target === 'outstanding') setOutstanding(result.items);
      else {
        setHistory((current) => reset ? result.items : [...current, ...result.items.filter((item) => !current.some((existing) => existing.fineId === item.fineId))]);
        setNextCursor(result.page.nextCursor);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your fines. Please try again.');
    } finally {
      pagePendingRef.current = false;
      if (reset) setLoading(false); else setLoadingMore(false);
    }
  }, [nextCursor]);

  useEffect(() => { void loadView(view); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected) dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    else triggerRef.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (!sentinelRef.current || view !== 'history' || !nextCursor || loadingMore || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadView('history', false);
    }, { rootMargin: '160px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [view, nextCursor, loadingMore, loading, loadView]);

  const cancelPayment = () => {
    if (submitting) return;
    setSelected(null);
    triggerRef.current?.focus();
  };

  const confirmPayment = async () => {
    if (!selected || submittingRef.current) return;
    const fine = selected;
    submittingRef.current = true;
    setSubmitting(true); setError(null); setFeedback(null);
    try {
      await fineApi.payFine(fine.fineId);
      setFeedback(`Payment confirmed for ${fine.bookTitle}.`);
      setOutstanding((current) => current.filter((item) => item.fineId !== fine.fineId));
      triggerRef.current = headingRef.current;
      setSelected(null);
      await loadView(view);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 409) {
        triggerRef.current = headingRef.current;
        await loadView(view);
        setError('This fine is no longer outstanding. Its status has been refreshed.');
        setSelected(null);
      } else {
        setError(cause instanceof Error ? cause.message : 'Could not pay this fine. Please try again.');
      }
    } finally { submittingRef.current = false; setSubmitting(false); }
  };

  if (!user || user.accountType !== 'MEMBER') return null;
  const fines = view === 'outstanding' ? outstanding : history;

  return <main className="dashboard-page member-dashboard-page">
    <MemberNavigation onLogout={logout} />
    <section className="member-profile-content" aria-labelledby="member-fines-heading">
      <MemberProfileHub>
        <div className="member-fines-page">
          <p className="eyebrow">MEMBER ACCOUNT</p>
          <h1 ref={headingRef} id="member-fines-heading" tabIndex={-1}>My Fines</h1>
          <div className="loan-view-toggle" role="group" aria-label="Fine view">
            <button type="button" aria-pressed={view === 'outstanding'} onClick={() => { setError(null); setView('outstanding'); }}>Outstanding</button>
            <button type="button" aria-pressed={view === 'history'} onClick={() => { setError(null); setView('history'); }}>History</button>
          </div>
          {error && <div role="alert" className="form-error"><p>{error}</p><button type="button" onClick={() => void loadView(view)}>Retry</button></div>}
          {loading ? <p role="status" className="muted">Loading fines…</p> : fines.length === 0 ?
            <p role="status" className="muted">{view === 'outstanding' ? 'You have no outstanding fines.' : 'You have no fine history.'}</p> :
            <div className="member-fine-list" aria-label={view === 'outstanding' ? 'Outstanding fines' : 'Fine history'}>
              {fines.map((fine) => <article className="member-fine-card" key={fine.fineId}>
                <div className="member-fine-card-heading"><h2>{fine.bookTitle}</h2><strong>{formatFineAmount(fine)}</strong></div>
                <p><span>Reason:</span> {fine.reason}</p>
                <p><span>Issued:</span> <time dateTime={fine.issuedDateTime}>{formatDate(fine.issuedDateTime)}</time></p>
                <p><span>Status:</span> <strong>{fine.status}</strong></p>
                {fine.status === 'OUTSTANDING' && <button type="button" disabled={submitting} onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setError(null); setFeedback(null); setSelected(fine);
                }}>Pay Fine</button>}
              </article>)}
            </div>}
          {view === 'history' && nextCursor && !loading && <div ref={sentinelRef} className="member-fine-load-more"><button type="button" disabled={loadingMore} onClick={() => void loadView('history', false)}>{loadingMore ? 'Loading more…' : 'Load more'}</button></div>}
          {loadingMore && <p role="status" className="muted">Loading more fines…</p>}
          {feedback && <p role="status" aria-live="polite">{feedback}</p>}
          {selected && <div className="member-fine-dialog-backdrop"><div ref={dialogRef} className="member-fine-dialog" role="dialog" aria-modal="true" aria-labelledby="fine-payment-heading" onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); cancelPayment(); }
            if (event.key === 'Tab') {
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
              const first = buttons[0], last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
          }}>
            <h2 id="fine-payment-heading">Confirm fine payment</h2>
            <p><strong>{selected.bookTitle}</strong></p>
            <p>Reason: {selected.reason}</p>
            <p>Amount: {formatFineAmount(selected)}</p>
            <button type="button" disabled={submitting} onClick={() => void confirmPayment()}>{submitting ? 'Processing…' : 'Confirm Payment'}</button>
            <button type="button" disabled={submitting} onClick={cancelPayment}>Cancel</button>
            {submitting && <p role="status" aria-live="polite">Processing payment…</p>}
          </div></div>}
        </div>
      </MemberProfileHub>
    </section>
  </main>;
}

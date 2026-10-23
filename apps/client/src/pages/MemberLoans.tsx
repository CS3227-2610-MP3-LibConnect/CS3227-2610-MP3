import { useEffect, useRef, useState } from 'react';
import { borrowApi, type MemberLoan } from '../api/borrow.js';
import { ApiClientError } from '../api/errors.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberLoanCard } from '../components/MemberLoanCard.js';
import { loansForView, type LoanView } from './member-loan-view.js';

export function MemberLoans() {
  const { user, logout } = useAuth();
  const [loans, setLoans] = useState<MemberLoan[]>([]);
  const [view, setView] = useState<LoanView>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportLoan, setReportLoan] = useState<MemberLoan | null>(null);
  const [reportType, setReportType] = useState<'RETURNED' | 'LOST' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [renewalFeedback, setRenewalFeedback] = useState<string | null>(null);
  const [renewingLoanIds, setRenewingLoanIds] = useState<string[]>([]);
  const renewingLoanIdsRef = useRef(new Set<string>());
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const refreshLoans = async () => {
    const result = await borrowApi.listLoans();
    setLoans(result);
  };

  useEffect(() => {
    let active = true;
    void borrowApi
      .listLoans()
      .then((result) => {
        if (active) setLoans(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your loans.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reportLoan) dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    else triggerRef.current?.focus();
  }, [reportLoan, reportType]);

  const cancelReport = () => {
    if (!submitting) {
      setReportType(null);
      setReportLoan(null);
    }
  };
  const submitReport = async () => {
    if (!reportLoan || !reportType || submitting) return;
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      await borrowApi.reportClosure(reportLoan.loanId, reportType);
      try {
        await refreshLoans();
      } catch {
        setLoans((current) =>
          current.map((loan) =>
            loan.loanId === reportLoan.loanId
              ? { ...loan, status: 'PENDING_CLOSE', closureReportType: reportType }
              : loan,
          ),
        );
      }
      setFeedback('Your report was submitted for librarian review.');
      setReportLoan(null);
      setReportType(null);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 409) {
        let refreshed = false;
        try {
          await refreshLoans();
          refreshed = true;
        } catch {
          /* Keep the last confirmed list if refresh is unavailable. */
        }
        setError(
          `This loan is no longer active, so the report could not be submitted. Your loan list${refreshed ? ' has been refreshed' : ' could not be refreshed'}.`,
        );
        setReportLoan(null);
        setReportType(null);
      } else
        setError(
          cause instanceof Error ? cause.message : 'Could not submit the report. Please try again.',
        );
    } finally {
      setSubmitting(false);
    }
  };

  const renewLoan = async (loan: MemberLoan) => {
    const renewalAlreadyInProgress = renewingLoanIdsRef.current.has(loan.loanId);
    if (renewalAlreadyInProgress) return;
    renewingLoanIdsRef.current.add(loan.loanId);
    setRenewingLoanIds((current) => [...current, loan.loanId]);
    setRenewalFeedback(null);
    setError(null);
    try {
      const renewedLoan = await borrowApi.renewLoan(loan.loanId);
      if (!renewedLoan.isRenewed)
        throw new Error(
          'The renewal response was incomplete. Please refresh your loans and try again.',
        );
      setLoans((current) =>
        current.map((currentLoan) =>
          currentLoan.loanId === renewedLoan.loanId ? renewedLoan : currentLoan,
        ),
      );
      setRenewalFeedback(
        `${renewedLoan.bookTitle} was renewed. Its new due date is ${new Date(renewedLoan.dueDate).toLocaleDateString()}.`,
      );
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 409) {
        try {
          await refreshLoans();
        } catch {
          /* Keep the last confirmed loan list when refresh is unavailable. */
        }
        setError(
          `${loan.bookTitle} can no longer be renewed. Your loan list has been refreshed when available.`,
        );
      } else {
        setError(
          cause instanceof Error ? cause.message : 'Could not renew this loan. Please try again.',
        );
      }
    } finally {
      renewingLoanIdsRef.current.delete(loan.loanId);
      setRenewingLoanIds((current) => current.filter((loanId) => loanId !== loan.loanId));
    }
  };

  if (!user || user.accountType !== 'MEMBER') return null;

  const visibleLoans = loansForView(loans, view);

  return (
    <main className="dashboard-page member-dashboard-page">
      <MemberNavigation onLogout={logout} />
      <section className="member-profile-content" aria-labelledby="member-loans-heading">
        <MemberProfileHub>
          <div className="member-loans-page">
            <p className="eyebrow">MEMBER ACCOUNT</p>
            <h1 id="member-loans-heading">My Loans</h1>
            <div className="loan-view-toggle" role="group" aria-label="Loan history view">
              <button
                type="button"
                aria-pressed={view === 'active'}
                onClick={() => setView('active')}
              >
                Active
              </button>
              <button type="button" aria-pressed={view === 'past'} onClick={() => setView('past')}>
                Past
              </button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}{' '}
                <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </p>
            )}
            {loading ? (
              <p className="muted" role="status">
                Loading loans…
              </p>
            ) : visibleLoans.length === 0 ? (
              <p className="muted" role="status">
                {view === 'active' ? 'You have no active loans.' : 'You have no past loans.'}
              </p>
            ) : (
              <div
                className="member-loan-list"
                aria-label={`${view === 'active' ? 'Active' : 'Past'} loans`}
              >
                {visibleLoans.map((loan) => {
                  return (
                    <MemberLoanCard
                      key={loan.loanId}
                      loan={loan}
                      renewing={renewingLoanIds.includes(loan.loanId)}
                      onRenew={(selected) => void renewLoan(selected)}
                      onReport={(selected) => {
                        triggerRef.current = document.activeElement as HTMLElement;
                        setFeedback(null);
                        setError(null);
                        setReportLoan(selected);
                        setReportType(null);
                      }}
                    />
                  );
                })}
              </div>
            )}
            {feedback && <p role="status">{feedback}</p>}
            {renewalFeedback && (
              <p role="status">
                {renewalFeedback}{' '}
                <button
                  type="button"
                  aria-label="Dismiss renewal confirmation"
                  onClick={() => setRenewalFeedback(null)}
                >
                  Dismiss
                </button>
              </p>
            )}
            {reportLoan && (
              <div className="member-report-backdrop">
                <div
                  ref={dialogRef}
                  className="member-report-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="loan-report-heading"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelReport();
                    }
                    if (event.key === 'Tab') {
                      const buttons = Array.from(
                        event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          'button:not(:disabled)',
                        ),
                      );
                      if (!buttons.length) return;
                      const first = buttons[0],
                        last = buttons[buttons.length - 1];
                      if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                      } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                      }
                    }
                  }}
                >
                  <h2 id="loan-report-heading">
                    {reportType ? 'Confirm report' : 'Report return or loss'}
                  </h2>
                  <p>{reportLoan.bookTitle}</p>
                  {reportType ? (
                    <>
                      <p>Report this book as {reportType === 'RETURNED' ? 'returned' : 'lost'}?</p>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void submitReport()}
                      >
                        {submitting ? 'Submitting…' : 'Confirm report'}
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setReportType(null)}
                      >
                        Back
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setReportType('RETURNED')}>
                        Returned
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => setReportType('LOST')}
                      >
                        Lost
                      </button>
                    </>
                  )}
                  <button type="button" disabled={submitting} onClick={cancelReport}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </MemberProfileHub>
      </section>
    </main>
  );
}

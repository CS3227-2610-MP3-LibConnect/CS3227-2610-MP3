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
  const [renewalFeedback, setRenewalFeedback] = useState<string | null>(null);
  const [renewingLoanIds, setRenewingLoanIds] = useState<string[]>([]);
  const renewingLoanIdsRef = useRef(new Set<string>());

  const refreshLoans = async () => {
    const result = await borrowApi.listLoans();
    setLoans(result);
  };

  useEffect(() => {
    let active = true;
    void borrowApi.listLoans().then((result) => {
      if (active) setLoans(result);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load your loans.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const renewLoan = async (loan: MemberLoan) => {
    const renewalAlreadyInProgress = renewingLoanIdsRef.current.has(loan.loanId);
    if (renewalAlreadyInProgress) return;
    renewingLoanIdsRef.current.add(loan.loanId);
    setRenewingLoanIds((current) => [...current, loan.loanId]);
    setRenewalFeedback(null);
    setError(null);
    try {
      const renewedLoan = await borrowApi.renewLoan(loan.loanId);
      if (!renewedLoan.isRenewed) throw new Error('The renewal response was incomplete. Please refresh your loans and try again.');
      setLoans((current) => current.map((currentLoan) => currentLoan.loanId === renewedLoan.loanId ? renewedLoan : currentLoan));
      setRenewalFeedback(`${renewedLoan.bookTitle} was renewed. Its new due date is ${new Date(renewedLoan.dueDate).toLocaleDateString()}.`);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 409) {
        try { await refreshLoans(); }
        catch { /* Keep the last confirmed loan list when refresh is unavailable. */ }
        setError(`${loan.bookTitle} can no longer be renewed. Your loan list has been refreshed when available.`);
      } else {
        setError(cause instanceof Error ? cause.message : 'Could not renew this loan. Please try again.');
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
              <button type="button" aria-pressed={view === 'active'} onClick={() => setView('active')}>Active</button>
              <button type="button" aria-pressed={view === 'past'} onClick={() => setView('past')}>Past</button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {renewalFeedback && <p role="status">{renewalFeedback} <button type="button" aria-label="Dismiss renewal confirmation" onClick={() => setRenewalFeedback(null)}>Dismiss</button></p>}
            {loading ? <p className="muted" role="status">Loading loans…</p> : visibleLoans.length === 0 ? (
              <p className="muted" role="status">{view === 'active' ? 'You have no active loans.' : 'You have no past loans.'}</p>
            ) : (
              <div className="member-loan-list" aria-label={`${view === 'active' ? 'Active' : 'Past'} loans`}>
                {visibleLoans.map((loan) => {
                  return (
                    <MemberLoanCard key={loan.loanId} loan={loan} renewing={renewingLoanIds.includes(loan.loanId)} onRenew={(selected) => void renewLoan(selected)} />
                  );
                })}
              </div>
            )}
          </div>
        </MemberProfileHub>
      </section>
    </main>
  );
}

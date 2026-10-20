import { useEffect, useState } from 'react';
import { borrowApi, type MemberLoan } from '../api/borrow.js';
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
            {loading ? <p className="muted" role="status">Loading loans…</p> : visibleLoans.length === 0 ? (
              <p className="muted" role="status">{view === 'active' ? 'You have no active loans.' : 'You have no past loans.'}</p>
            ) : (
              <div className="member-loan-list" aria-label={`${view === 'active' ? 'Active' : 'Past'} loans`}>
                {visibleLoans.map((loan) => {
                  return (
                    <MemberLoanCard key={loan.loanId} loan={loan} />
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

import { isBeforeSingaporeDueDateCutoff, loanCardTreatment, formatLoanDueDate } from '../pages/member-loan-view.js';
import type { MemberLoan } from '../api/borrow.js';

export function MemberLoanCard({ loan, now = Date.now(), onRenew, renewing = false }: {
  loan: MemberLoan;
  now?: number;
  onRenew?: (loan: MemberLoan) => void;
  renewing?: boolean;
}) {
  const { overdue, showDisabledReturn } = loanCardTreatment(loan, now);
  const showRenewAction = loan.status === 'ACTIVE' && !loan.isRenewed && isBeforeSingaporeDueDateCutoff(loan.dueDate, now);

  return (
    <article className={`member-loan-card${overdue ? ' member-loan-card-overdue' : ''}`}>
      <h2>{loan.bookTitle}</h2>
      <p>Due date: <time dateTime={loan.dueDate}>{formatLoanDueDate(loan.dueDate)}</time></p>
      {showDisabledReturn && <button type="button" disabled>Return</button>}
      {showRenewAction && <button type="button" aria-live="polite" aria-busy={renewing} disabled={renewing} onClick={() => onRenew?.(loan)}>{renewing ? 'Renewing…' : 'Renew'}</button>}
    </article>
  );
}

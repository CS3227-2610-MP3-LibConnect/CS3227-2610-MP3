import {
  isBeforeSingaporeDueDateCutoff,
  loanCardTreatment,
  formatLoanDueDate,
} from '../pages/member-loan-view.js';
import type { MemberLoan } from '../api/borrow.js';

export function MemberLoanCard({
  loan,
  now = Date.now(),
  onReport,
  onRenew,
  renewing = false,
}: {
  loan: MemberLoan;
  now?: number;
  onReport?: (loan: MemberLoan) => void;
  onRenew?: (loan: MemberLoan) => void;
  renewing?: boolean;
}) {
  const { overdue, showReportAction } = loanCardTreatment(loan, now);
  const showRenewAction =
    loan.status === 'ACTIVE' &&
    !loan.isRenewed &&
    isBeforeSingaporeDueDateCutoff(loan.dueDate, now);

  return (
    <article className={`member-loan-card${overdue ? ' member-loan-card-overdue' : ''}`}>
      <h2>{loan.bookTitle}</h2>
      <p>
        Due date: <time dateTime={loan.dueDate}>{formatLoanDueDate(loan.dueDate)}</time>
      </p>
      {loan.status === 'PENDING_CLOSE' && (
        <p role="status">
          {loan.closureReportType === 'LOST' ? 'Lost' : 'Returned'} report submitted; awaiting
          librarian review.
        </p>
      )}
      {showRenewAction && (
        <button
          type="button"
          aria-live="polite"
          aria-busy={renewing}
          disabled={renewing}
          onClick={() => onRenew?.(loan)}
        >
          {renewing ? 'Renewing…' : 'Renew'}
        </button>
      )}
      {showReportAction && (
        <button type="button" onClick={() => onReport?.(loan)}>
          Report Return or Loss
        </button>
      )}
    </article>
  );
}

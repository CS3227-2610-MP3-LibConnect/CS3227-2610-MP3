import { loanCardTreatment, formatLoanDueDate } from '../pages/member-loan-view.js';
import type { MemberLoan } from '../api/borrow.js';

export function MemberLoanCard({ loan, now = Date.now() }: { loan: MemberLoan; now?: number }) {
  const { overdue, showDisabledReturn } = loanCardTreatment(loan, now);

  return (
    <article className={`member-loan-card${overdue ? ' member-loan-card-overdue' : ''}`}>
      <h2>{loan.bookTitle}</h2>
      <p>Due date: <time dateTime={loan.dueDate}>{formatLoanDueDate(loan.dueDate)}</time></p>
      {showDisabledReturn && <button type="button" disabled>Return</button>}
    </article>
  );
}

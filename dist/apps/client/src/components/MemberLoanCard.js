import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { isBeforeSingaporeDueDateCutoff, loanCardTreatment, formatLoanDueDate } from '../pages/member-loan-view.js';
export function MemberLoanCard({ loan, now = Date.now(), onReport, onRenew, renewing = false }) {
    const { overdue, showReportAction } = loanCardTreatment(loan, now);
    const showRenewAction = loan.status === 'ACTIVE' && !loan.isRenewed && isBeforeSingaporeDueDateCutoff(loan.dueDate, now);
    return (_jsxs("article", { className: `member-loan-card${overdue ? ' member-loan-card-overdue' : ''}`, children: [_jsx("h2", { children: loan.bookTitle }), _jsxs("p", { children: ["Due date: ", _jsx("time", { dateTime: loan.dueDate, children: formatLoanDueDate(loan.dueDate) })] }), loan.status === 'PENDING_CLOSE' && _jsxs("p", { role: "status", children: [loan.closureReportType === 'LOST' ? 'Lost' : 'Returned', " report submitted; awaiting librarian review."] }), showRenewAction && _jsx("button", { type: "button", "aria-live": "polite", "aria-busy": renewing, disabled: renewing, onClick: () => onRenew?.(loan), children: renewing ? 'Renewing…' : 'Renew' }), showReportAction && _jsx("button", { type: "button", onClick: () => onReport?.(loan), children: "Report Return or Loss" })] }));
}
//# sourceMappingURL=MemberLoanCard.js.map
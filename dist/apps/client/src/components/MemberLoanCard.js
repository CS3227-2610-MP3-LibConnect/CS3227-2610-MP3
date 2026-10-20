import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { loanCardTreatment, formatLoanDueDate } from '../pages/member-loan-view.js';
export function MemberLoanCard({ loan, now = Date.now() }) {
    const { overdue, showDisabledReturn } = loanCardTreatment(loan, now);
    return (_jsxs("article", { className: `member-loan-card${overdue ? ' member-loan-card-overdue' : ''}`, children: [_jsx("h2", { children: loan.bookTitle }), _jsxs("p", { children: ["Due date: ", _jsx("time", { dateTime: loan.dueDate, children: formatLoanDueDate(loan.dueDate) })] }), showDisabledReturn && _jsx("button", { type: "button", disabled: true, children: "Return" })] }));
}
//# sourceMappingURL=MemberLoanCard.js.map
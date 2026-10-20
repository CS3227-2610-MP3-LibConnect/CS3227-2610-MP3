import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { borrowApi } from '../api/borrow.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberLoanCard } from '../components/MemberLoanCard.js';
import { loansForView } from './member-loan-view.js';
export function MemberLoans() {
    const { user, logout } = useAuth();
    const [loans, setLoans] = useState([]);
    const [view, setView] = useState('active');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        let active = true;
        void borrowApi.listLoans().then((result) => {
            if (active)
                setLoans(result);
        }).catch((cause) => {
            if (active)
                setError(cause instanceof Error ? cause.message : 'Could not load your loans.');
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => { active = false; };
    }, []);
    if (!user || user.accountType !== 'MEMBER')
        return null;
    const visibleLoans = loansForView(loans, view);
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsx("section", { className: "member-profile-content", "aria-labelledby": "member-loans-heading", children: _jsx(MemberProfileHub, { children: _jsxs("div", { className: "member-loans-page", children: [_jsx("p", { className: "eyebrow", children: "MEMBER ACCOUNT" }), _jsx("h1", { id: "member-loans-heading", children: "My Loans" }), _jsxs("div", { className: "loan-view-toggle", role: "group", "aria-label": "Loan history view", children: [_jsx("button", { type: "button", "aria-pressed": view === 'active', onClick: () => setView('active'), children: "Active" }), _jsx("button", { type: "button", "aria-pressed": view === 'past', onClick: () => setView('past'), children: "Past" })] }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), loading ? _jsx("p", { className: "muted", role: "status", children: "Loading loans\u2026" }) : visibleLoans.length === 0 ? (_jsx("p", { className: "muted", role: "status", children: view === 'active' ? 'You have no active loans.' : 'You have no past loans.' })) : (_jsx("div", { className: "member-loan-list", "aria-label": `${view === 'active' ? 'Active' : 'Past'} loans`, children: visibleLoans.map((loan) => {
                                    return (_jsx(MemberLoanCard, { loan: loan }, loan.loanId));
                                }) }))] }) }) })] }));
}
//# sourceMappingURL=MemberLoans.js.map
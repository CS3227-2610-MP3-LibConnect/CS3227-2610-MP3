import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.js';
import { dashboardPathFor } from './dashboard-routing.js';
export function ProtectedRoute({ children, accountType }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) {
        return _jsx("main", { className: "page-center", "aria-live": "polite", children: "Checking your session\u2026" });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location } });
    }
    if (accountType && user.accountType !== accountType) {
        return _jsx(Navigate, { to: dashboardPathFor(user.accountType), replace: true });
    }
    return children;
}
//# sourceMappingURL=ProtectedRoute.js.map
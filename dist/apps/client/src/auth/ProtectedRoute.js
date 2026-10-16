import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.js';
export function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) {
        return _jsx("main", { className: "page-center", "aria-live": "polite", children: "Checking your session\u2026" });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location } });
    }
    return children;
}
//# sourceMappingURL=ProtectedRoute.js.map
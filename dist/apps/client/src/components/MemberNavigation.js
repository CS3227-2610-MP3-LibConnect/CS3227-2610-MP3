import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useHref, useNavigate } from 'react-router-dom';
export function MemberNavigation({ onLogout }) {
    const navigate = useNavigate();
    const dashboardHref = useHref('/member/dashboard');
    const navigateToDashboard = (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
        event.preventDefault();
        navigate('/member/dashboard');
    };
    return (_jsxs("header", { className: "member-header", children: [_jsxs("a", { href: dashboardHref, className: "brand-lockup member-brand", "aria-label": "LibConnect home", onClick: navigateToDashboard, children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "member-navigation", "aria-label": "Member main navigation", children: [_jsx("a", { href: dashboardHref, className: "member-navigation-current", "aria-current": "page", "aria-disabled": "true", tabIndex: -1, onClick: (event) => event.preventDefault(), children: "Dashboard" }), _jsxs("div", { className: "member-account-actions", children: [_jsx("button", { "aria-label": "Profile", className: "member-profile-button", type: "button", disabled: true, children: "Profile" }), _jsx("button", { className: "member-logout-button", type: "button", onClick: () => void onLogout(), children: "Logout" })] })] })] }));
}
//# sourceMappingURL=MemberNavigation.js.map
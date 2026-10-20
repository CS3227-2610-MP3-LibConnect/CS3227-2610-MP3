import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useHref, useLocation, useNavigate } from 'react-router-dom';
export function MemberNavigation({ onLogout }) {
    const navigate = useNavigate();
    const location = useLocation();
    const dashboardHref = useHref('/member/dashboard');
    const navigateToDashboard = (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
        event.preventDefault();
        navigate('/member/dashboard');
    };
    return (_jsxs("header", { className: "member-header", children: [_jsxs("a", { href: dashboardHref, className: "brand-lockup member-brand", "aria-label": "LibConnect home", onClick: navigateToDashboard, children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "member-navigation", "aria-label": "Member main navigation", children: [_jsx("a", { href: dashboardHref, className: location.pathname === '/member/dashboard' ? 'member-navigation-current' : undefined, "aria-current": location.pathname === '/member/dashboard' ? 'page' : undefined, onClick: (event) => {
                            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                                return;
                            event.preventDefault();
                            navigate('/member/dashboard');
                        }, children: "Dashboard" }), _jsx("a", { href: "/member/borrow", className: location.pathname === '/member/borrow' ? 'member-navigation-current' : undefined, "aria-current": location.pathname === '/member/borrow' ? 'page' : undefined, onClick: (event) => {
                            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                                return;
                            event.preventDefault();
                            navigate('/member/borrow');
                        }, children: "Borrow" }), _jsxs("div", { className: "member-account-actions", children: [_jsx("a", { href: "/member/profile", "aria-label": "Profile", className: location.pathname === '/member/profile' ? 'member-profile-button member-navigation-current' : 'member-profile-button', "aria-current": location.pathname === '/member/profile' ? 'page' : undefined, onClick: (event) => {
                                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                                        return;
                                    event.preventDefault();
                                    navigate('/member/profile');
                                }, children: "Profile" }), _jsx("button", { className: "member-logout-button", type: "button", onClick: () => void onLogout(), children: "Logout" })] })] })] }));
}
//# sourceMappingURL=MemberNavigation.js.map
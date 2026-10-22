import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { MemberNavigation } from './MemberNavigation.js';
const sections = [
    { label: 'Profile', path: '/member/profile' },
    { label: 'My Loans', path: '/member/profile/loans' },
    { label: 'My Reservations', path: '/member/profile/reservations' },
    { label: 'My Fines', path: '/member/profile/fines' },
];
export function MemberProfileHub({ children }) {
    const { pathname } = useLocation();
    const currentPath = pathname === '/member/profile' ? pathname : pathname.replace(/\/$/u, '');
    return (_jsxs("div", { className: "member-profile-hub", children: [_jsx("nav", { className: "member-profile-subnav", "aria-label": "Member profile sections", children: sections.map(({ label, path }) => (_jsx(Link, { to: path, className: currentPath === path ? 'member-profile-subnav-current' : undefined, "aria-current": currentPath === path ? 'page' : undefined, children: label }, path))) }), _jsx("div", { className: "member-profile-hub-content", children: children })] }));
}
export function MemberProfilePlaceholder({ title }) {
    const { logout } = useAuth();
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsx("section", { className: "member-profile-content", children: _jsx(MemberProfileHub, { children: _jsxs("div", { className: "member-profile-placeholder", children: [_jsx("p", { className: "eyebrow", children: "MEMBER ACCOUNT" }), _jsx("h1", { id: "profile-section-heading", children: title }), _jsx("p", { className: "muted", children: "This section is not available yet." })] }) }) })] }));
}
//# sourceMappingURL=MemberProfileHub.js.map
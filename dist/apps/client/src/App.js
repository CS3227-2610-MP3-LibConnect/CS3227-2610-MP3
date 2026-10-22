import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';
import { dashboardPathFor } from './auth/dashboard-routing.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ManagerLibrarianAccountsPage } from './pages/ManagerLibrarianAccountsPage.js';
import { LibrarianCatalogInventoryPage } from './pages/LibrarianCatalogInventoryPage.js';
import { LibrarianCirculationPage } from './pages/LibrarianCirculationPage.js';
import { LibrarianReservationsFinesPage } from './pages/LibrarianReservationsFinesPage.js';
import { LibrarianMemberSupportPage } from './pages/LibrarianMemberSupportPage.js';
import { LibrarianAssistantPage } from './pages/LibrarianAssistantPage.js';
import { MemberDashboard } from './pages/MemberDashboard.js';
import { MemberBookDetail } from './pages/MemberBookDetail.js';
import { MemberBorrow } from './pages/MemberBorrow.js';
import { MemberProfile } from './pages/MemberProfile.js';
import { MemberLoans } from './pages/MemberLoans.js';
import { MemberFines } from './pages/MemberFines.js';
import { MemberReservations } from './pages/MemberReservations.js';
import { MemberAssistantProvider } from './components/MemberAssistant.js';
function DashboardPage() {
    const { user, logout } = useAuth();
    if (!user)
        return null;
    if (user.accountType === 'MEMBER')
        return _jsx(MemberDashboard, {});
    return (_jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs("a", { className: "brand-lockup", href: "/", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] }), _jsxs("section", { className: "welcome-panel", children: [_jsx("p", { className: "eyebrow", children: "YOUR LIBRARY, CONNECTED" }), _jsxs("h1", { children: ["Welcome, ", user.name] }), _jsxs("p", { className: "muted", children: ["You are signed in as a ", user.accountType === 'MEMBER' ? 'member' : 'librarian', "."] }), _jsx("div", { className: "account-chip", children: user.accountType }), user.accountType === 'LIBRARIAN' && _jsxs("p", { children: [_jsx(Link, { className: "text-button", to: "/librarian/catalog", children: "Catalog & inventory" }), " ", _jsx(Link, { className: "text-button", to: "/librarian/circulation", children: "Loans & reviews" }), " ", _jsx(Link, { className: "text-button", to: "/librarian/reservations-fines", children: "Reservations & fines" }), " ", _jsx(Link, { className: "text-button", to: "/librarian/members", children: "Member accounts" }), " ", _jsx(Link, { className: "text-button", to: "/librarian/assistant", children: "Review assistant" }), user.isManager === true && _jsxs(_Fragment, { children: [" ", _jsx(Link, { className: "text-button", to: "/librarian/manager/accounts", children: "Manage librarian accounts" })] })] })] })] }));
}
export function App() {
    return (_jsx(MemberAssistantProvider, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/register", element: _jsx(RegisterPage, {}) }), _jsx(Route, { path: "/", element: _jsx(ProtectedRoute, { children: _jsx(DashboardRedirect, {}) }) }), _jsx(Route, { path: "/member/dashboard", element: _jsx(ProtectedRoute, { accountType: "MEMBER", children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/member/books/:isbn", element: _jsx(ProtectedRoute, { accountType: "MEMBER", children: _jsx(MemberBookDetail, {}) }) }), _jsx(Route, { path: "/member/borrow", element: _jsx(ProtectedRoute, { accountType: "MEMBER", children: _jsx(MemberBorrow, {}) }) }), _jsx(Route, { path: "/member/profile", element: _jsx(ProtectedRoute, { accountType: "MEMBER", children: _jsx(MemberProfile, {}) }) }), _jsx(Route, { path: "/member/profile/loans", element: _jsx(ProtectedRoute, { accountType: "MEMBER", children: _jsx(MemberLoans, {}) }) }), _jsx(Route, { path: "/member/profile/reservations", element: _jsx(ProtectedRoute, { accountType: "MEMBER", children: _jsx(MemberReservations, {}) }) }), _jsx(Route, { path: "/member/profile/fines", element: _jsx(ProtectedRoute, { accountType: "MEMBER", children: _jsx(MemberFines, {}) }) }), _jsx(Route, { path: "/librarian/dashboard", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/librarian/catalog", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(LibrarianCatalogInventoryPage, {}) }) }), _jsx(Route, { path: "/librarian/circulation", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(LibrarianCirculationPage, {}) }) }), _jsx(Route, { path: "/librarian/reservations-fines", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(LibrarianReservationsFinesPage, {}) }) }), _jsx(Route, { path: "/librarian/members", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(LibrarianMemberSupportPage, {}) }) }), _jsx(Route, { path: "/librarian/assistant", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(LibrarianAssistantPage, {}) }) }), _jsx(Route, { path: "/librarian/manager/accounts", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", managerOnly: true, children: _jsx(ManagerLibrarianAccountsPage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
}
function DashboardRedirect() {
    const { user } = useAuth();
    if (!user)
        return null;
    return _jsx(Navigate, { to: dashboardPathFor(user.accountType), replace: true });
}
//# sourceMappingURL=App.js.map
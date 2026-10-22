import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';
import { dashboardPathFor } from './auth/dashboard-routing.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ManagerLibrarianAccountsPage } from './pages/ManagerLibrarianAccountsPage.js';
import { LibrarianCatalogInventoryPage } from './pages/LibrarianCatalogInventoryPage.js';
import { LibrarianCirculationPage } from './pages/LibrarianCirculationPage.js';
import { LibrarianReservationsFinesPage } from './pages/LibrarianReservationsFinesPage.js';
function DashboardPage() {
    const { user, logout } = useAuth();
    if (!user)
        return null;
    return (_jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs("a", { className: "brand-lockup", href: "/", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] }), _jsxs("section", { className: "welcome-panel", children: [_jsx("p", { className: "eyebrow", children: "YOUR LIBRARY, CONNECTED" }), _jsxs("h1", { children: ["Welcome, ", user.name] }), _jsxs("p", { className: "muted", children: ["You are signed in as a ", user.accountType === 'MEMBER' ? 'member' : 'librarian', "."] }), _jsx("div", { className: "account-chip", children: user.accountType }), user.accountType === 'LIBRARIAN' && _jsxs("p", { children: [_jsx(Link, { className: "text-button", to: "/librarian/catalog", children: "Catalog & inventory" }), " ", _jsx(Link, { className: "text-button", to: "/librarian/circulation", children: "Loans & reviews" }), " ", _jsx(Link, { className: "text-button", to: "/librarian/reservations-fines", children: "Reservations & fines" }), user.isManager === true && _jsxs(_Fragment, { children: [" ", _jsx(Link, { className: "text-button", to: "/librarian/manager/accounts", children: "Manage librarian accounts" })] })] })] })] }));
}
export function App() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/register", element: _jsx(RegisterPage, {}) }), _jsx(Route, { path: "/", element: _jsx(ProtectedRoute, { children: _jsx(DashboardRedirect, {}) }) }), _jsx(Route, { path: "/member/dashboard", element: _jsx(ProtectedRoute, { accountType: "MEMBER", children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/librarian/dashboard", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/librarian/catalog", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(LibrarianCatalogInventoryPage, {}) }) }), _jsx(Route, { path: "/librarian/circulation", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(LibrarianCirculationPage, {}) }) }), _jsx(Route, { path: "/librarian/reservations-fines", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", children: _jsx(LibrarianReservationsFinesPage, {}) }) }), _jsx(Route, { path: "/librarian/manager/accounts", element: _jsx(ProtectedRoute, { accountType: "LIBRARIAN", managerOnly: true, children: _jsx(ManagerLibrarianAccountsPage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }));
}
function DashboardRedirect() {
    const { user } = useAuth();
    if (!user)
        return null;
    return _jsx(Navigate, { to: dashboardPathFor(user.accountType), replace: true });
}
//# sourceMappingURL=App.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { managerApi } from '../api/manager.js';
import { useAuth } from '../auth/AuthContext.js';
function readableStatus(status) {
    return status === 'ACTIVE' ? 'Active' : 'Inactive';
}
export function ManagerLibrarianAccountsPage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [librarians, setLibrarians] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [pendingUserId, setPendingUserId] = useState(null);
    const loadLibrarians = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await managerApi.listLibrarians();
            setLibrarians(result.librarians);
        }
        catch (caught) {
            setError(caught instanceof ApiClientError ? caught.message : 'Librarian accounts could not be loaded.');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void loadLibrarians(); }, [loadLibrarians]);
    async function changeStatus(target) {
        const nextStatus = target.accountStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        const action = nextStatus === 'ACTIVE' ? 'activate' : 'deactivate';
        const confirmed = window.confirm(`Confirm ${action} account for ${target.name}? The account will become ${readableStatus(nextStatus)}.`);
        if (!confirmed)
            return;
        setPendingUserId(target.userId);
        setError(null);
        setSuccess(null);
        try {
            await managerApi.updateLibrarianStatus(target.userId, nextStatus);
            setSuccess(`${target.name}'s account is now ${readableStatus(nextStatus)}.`);
            if (target.userId === user?.userId && nextStatus === 'INACTIVE') {
                await logout().catch(() => undefined);
                navigate('/login', { replace: true });
                return;
            }
            await loadLibrarians();
        }
        catch (caught) {
            setError(caught instanceof ApiClientError ? caught.message : 'The account status could not be changed. Please try again.');
        }
        finally {
            setPendingUserId(null);
        }
    }
    return (_jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs(Link, { className: "brand-lockup", to: "/librarian/dashboard", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "dashboard-actions", "aria-label": "Account actions", children: [_jsx(Link, { className: "text-button", to: "/librarian/dashboard", children: "Dashboard" }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] })] }), _jsxs("section", { className: "manager-panel", "aria-labelledby": "manager-title", children: [_jsx("p", { className: "eyebrow", children: "MANAGER TOOLS" }), _jsx("h1", { id: "manager-title", children: "Librarian accounts" }), _jsx("p", { className: "muted", children: "Activate new librarians and deactivate accounts that should no longer sign in." }), success && _jsx("p", { className: "form-success", role: "status", children: success }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), loading ? _jsx("p", { className: "muted", "aria-live": "polite", children: "Loading librarian accounts\u2026" }) : (_jsx("div", { className: "account-table-wrap", children: _jsxs("table", { className: "account-table", children: [_jsx("caption", { className: "sr-only", children: "Librarian accounts and statuses" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Librarian" }), _jsx("th", { scope: "col", children: "Employee ID" }), _jsx("th", { scope: "col", children: "Status" }), _jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Actions" }) })] }) }), _jsx("tbody", { children: librarians.map((librarian) => {
                                        const nextStatus = librarian.accountStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
                                        return (_jsxs("tr", { children: [_jsxs("th", { scope: "row", children: [_jsx("span", { children: librarian.name }), _jsxs("small", { children: [librarian.email, librarian.isManager ? ' · Manager' : ''] })] }), _jsx("td", { children: librarian.employeeId }), _jsx("td", { children: _jsx("span", { className: `status-pill status-${librarian.accountStatus.toLowerCase()}`, children: readableStatus(librarian.accountStatus) }) }), _jsx("td", { children: _jsx("button", { className: "primary-button compact-button", disabled: pendingUserId !== null, onClick: () => void changeStatus(librarian), children: pendingUserId === librarian.userId ? 'Saving…' : nextStatus === 'ACTIVE' ? 'Activate account' : 'Deactivate account' }) })] }, librarian.userId));
                                    }) })] }) }))] })] }));
}
//# sourceMappingURL=ManagerLibrarianAccountsPage.js.map
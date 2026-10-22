import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { managerApi } from '../api/manager.js';
import { useAuth } from '../auth/AuthContext.js';
import { isSelfDeactivation, isSelfPasswordReset, nextAccountStatus, passwordResetDetails, readableAccountStatus, statusChangeDetails } from './manager-account-actions.js';
export function ManagerLibrarianAccountsPage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [librarians, setLibrarians] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [pendingUserId, setPendingUserId] = useState(null);
    const [resetTarget, setResetTarget] = useState(null);
    const [resetPassword, setResetPassword] = useState('');
    const [resetConfirmation, setResetConfirmation] = useState('');
    const [resetConfirmed, setResetConfirmed] = useState(false);
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
        const { nextStatus, confirmationMessage, successMessage } = statusChangeDetails(target);
        const confirmed = window.confirm(confirmationMessage);
        if (!confirmed)
            return;
        setPendingUserId(target.userId);
        setError(null);
        setSuccess(null);
        try {
            await managerApi.updateLibrarianStatus(target.userId, nextStatus);
            setSuccess(successMessage);
            if (isSelfDeactivation(target.userId, user?.userId, nextStatus)) {
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
    function openReset(target) {
        setResetTarget(target);
        setResetPassword('');
        setResetConfirmation('');
        setResetConfirmed(false);
        setError(null);
        setSuccess(null);
    }
    function closeReset() {
        if (pendingUserId !== null)
            return;
        setResetTarget(null);
        setResetPassword('');
        setResetConfirmation('');
        setResetConfirmed(false);
    }
    async function submitReset(event) {
        event.preventDefault();
        if (!resetTarget)
            return;
        const details = passwordResetDetails(resetTarget.name);
        if (!resetConfirmed) {
            setError('Confirm that you understand the password reset before submitting.');
            setResetPassword('');
            setResetConfirmation('');
            return;
        }
        setPendingUserId(resetTarget.userId);
        setError(null);
        setSuccess(null);
        try {
            await managerApi.resetLibrarianPassword(resetTarget.userId, resetPassword, resetConfirmation);
            setResetTarget(null);
            setResetPassword('');
            setResetConfirmation('');
            setResetConfirmed(false);
            await loadLibrarians();
            setSuccess(details.successMessage);
        }
        catch (caught) {
            setError(caught instanceof ApiClientError ? caught.message : 'The password could not be reset. Please try again.');
            setResetPassword('');
            setResetConfirmation('');
            setResetConfirmed(false);
        }
        finally {
            setPendingUserId(null);
        }
    }
    return (_jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs(Link, { className: "brand-lockup", to: "/librarian/dashboard", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "dashboard-actions", "aria-label": "Account actions", children: [_jsx(Link, { className: "text-button", to: "/librarian/dashboard", children: "Dashboard" }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] })] }), _jsxs("section", { className: "manager-panel", "aria-labelledby": "manager-title", children: [_jsx("p", { className: "eyebrow", children: "MANAGER TOOLS" }), _jsx("h1", { id: "manager-title", children: "Librarian accounts" }), _jsx("p", { className: "muted", children: "Activate new librarians, deactivate accounts, or reset another librarian\u2019s password." }), success && _jsx("p", { className: "form-success", role: "status", children: success }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), loading ? _jsx("p", { className: "muted", "aria-live": "polite", children: "Loading librarian accounts\u2026" }) : (_jsx("div", { className: "account-table-wrap", children: _jsxs("table", { className: "account-table", children: [_jsx("caption", { className: "sr-only", children: "Librarian accounts and statuses" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Librarian" }), _jsx("th", { scope: "col", children: "Employee ID" }), _jsx("th", { scope: "col", children: "Status" }), _jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Actions" }) })] }) }), _jsx("tbody", { children: librarians.map((librarian) => {
                                        const nextStatus = nextAccountStatus(librarian.accountStatus);
                                        return (_jsxs("tr", { children: [_jsxs("th", { scope: "row", children: [_jsx("span", { children: librarian.name }), _jsxs("small", { children: [librarian.email, librarian.isManager ? ' · Manager' : ''] })] }), _jsx("td", { children: librarian.employeeId }), _jsx("td", { children: _jsx("span", { className: `status-pill status-${librarian.accountStatus.toLowerCase()}`, children: readableAccountStatus(librarian.accountStatus) }) }), _jsxs("td", { className: "account-actions", children: [_jsx("button", { className: "primary-button compact-button", disabled: pendingUserId !== null, onClick: () => void changeStatus(librarian), children: pendingUserId === librarian.userId ? 'Saving…' : nextStatus === 'ACTIVE' ? 'Activate account' : 'Deactivate account' }), !isSelfPasswordReset(librarian.userId, user?.userId) && _jsxs(_Fragment, { children: [_jsx("button", { className: "text-button compact-button", type: "button", disabled: pendingUserId !== null, onClick: () => openReset(librarian), children: "Reset password" }), _jsx("a", { className: "text-button compact-button", href: managerApi.resetLibrarianPasswordFormUrl(librarian.userId), children: "Open reset form" })] })] })] }, librarian.userId));
                                    }) })] }) })), resetTarget && (() => {
                        const details = passwordResetDetails(resetTarget.name);
                        return _jsxs("form", { className: "reset-password-form", method: "post", action: managerApi.resetLibrarianPasswordFormUrl(resetTarget.userId), onSubmit: (event) => void submitReset(event), "aria-labelledby": "reset-password-title", children: [_jsx("h2", { id: "reset-password-title", children: details.heading }), _jsx("p", { className: "muted", id: "reset-password-help", children: details.explanation }), _jsxs("label", { className: "field", children: ["New password", _jsx("input", { name: "password", type: "password", autoComplete: "new-password", required: true, minLength: 8, maxLength: 1024, pattern: "[^\\s]+", value: resetPassword, onChange: (event) => setResetPassword(event.target.value), "aria-describedby": "reset-password-help" })] }), _jsxs("label", { className: "field", children: ["Confirm new password", _jsx("input", { name: "confirmPassword", type: "password", autoComplete: "new-password", required: true, maxLength: 1024, value: resetConfirmation, onChange: (event) => setResetConfirmation(event.target.value) })] }), _jsxs("label", { className: "reset-confirmation", children: [_jsx("input", { type: "checkbox", checked: resetConfirmed, onChange: (event) => setResetConfirmed(event.target.checked), disabled: pendingUserId !== null }), details.confirmationLabel] }), _jsxs("div", { className: "reset-form-actions", children: [_jsx("button", { className: "primary-button compact-button", type: "submit", disabled: pendingUserId !== null, children: pendingUserId === resetTarget.userId ? 'Resetting…' : 'Confirm password reset' }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: closeReset, disabled: pendingUserId !== null, children: "Cancel" })] })] });
                    })()] })] }));
}
//# sourceMappingURL=ManagerLibrarianAccountsPage.js.map
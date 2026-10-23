import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { useAuth } from '../auth/AuthContext.js';
import { dashboardPathFor, postLoginPathFor } from '../auth/dashboard-routing.js';
export function LoginPage() {
    const { login, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const locationState = location.state;
    const redirectTo = locationState?.from?.pathname ?? '/';
    const registrationSuccessMessage = locationState?.registrationSuccess === 'MEMBER'
        ? 'Your member account is ready. Sign in with your email and password.'
        : locationState?.registrationSuccess === 'LIBRARIAN'
            ? 'Registration received. A manager must activate your librarian account before you can sign in.'
            : '';
    const [accountType, setAccountType] = useState('MEMBER');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    if (user)
        return _jsx(Navigate, { to: dashboardPathFor(user.accountType), replace: true });
    async function onSubmit(event) {
        event.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const authenticatedUser = await login({ accountType, email, password });
            navigate(postLoginPathFor(authenticatedUser.accountType, redirectTo), { replace: true });
        }
        catch (cause) {
            setError(cause instanceof ApiClientError && cause.status === 401
                ? cause.code === 'ACCOUNT_DISABLED'
                    ? 'This account is disabled.'
                    : cause.code === 'LIBRARIAN_INACTIVE'
                        ? 'Your librarian account is not active yet. Please contact a library manager to activate it, then sign in again.'
                        : 'Email or password is incorrect.'
                : cause instanceof Error ? cause.message : 'Sign in failed. Please try again.');
        }
        finally {
            setSubmitting(false);
        }
    }
    return (_jsx("main", { className: "auth-page", children: _jsxs("section", { className: "auth-card", "aria-labelledby": "login-title", children: [_jsx(Brand, {}), _jsx("p", { className: "eyebrow", children: "WELCOME BACK" }), _jsx("h1", { id: "login-title", children: "Sign in to LibConnect" }), _jsx("p", { className: "muted", children: "Choose the account type you are signing in to." }), registrationSuccessMessage && _jsx("p", { className: "form-success", role: "status", children: registrationSuccessMessage }), _jsxs("form", { onSubmit: onSubmit, className: "auth-form", children: [_jsxs("fieldset", { className: "account-choice", children: [_jsx("legend", { children: "Account type" }), _jsxs("label", { className: accountType === 'MEMBER' ? 'choice selected' : 'choice', children: [_jsx("input", { type: "radio", name: "accountType", value: "MEMBER", checked: accountType === 'MEMBER', onChange: () => setAccountType('MEMBER') }), _jsx("span", { children: "Member" })] }), _jsxs("label", { className: accountType === 'LIBRARIAN' ? 'choice selected' : 'choice', children: [_jsx("input", { type: "radio", name: "accountType", value: "LIBRARIAN", checked: accountType === 'LIBRARIAN', onChange: () => setAccountType('LIBRARIAN') }), _jsx("span", { children: "Librarian" })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Email address" }), _jsx("input", { autoComplete: "username", type: "email", value: email, onChange: (event) => setEmail(event.target.value), required: true })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Password" }), _jsx("input", { autoComplete: "current-password", type: "password", value: password, onChange: (event) => setPassword(event.target.value), required: true })] }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), _jsx("button", { className: "primary-button", type: "submit", disabled: submitting, children: submitting ? 'Signing in…' : 'Sign in' })] }), _jsxs("p", { className: "form-footer", children: ["New to LibConnect? ", _jsx(Link, { to: "/register", children: "Create an account" })] })] }) }));
}
export function Brand() {
    return _jsxs("div", { className: "brand-lockup", children: [_jsx("div", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] });
}
//# sourceMappingURL=LoginPage.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { useAuth } from '../auth/AuthContext.js';
import { Brand } from './LoginPage.js';
export function RegisterPage() {
    const { register, user } = useAuth();
    const [accountType, setAccountType] = useState('MEMBER');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    if (user)
        return _jsx(Navigate, { to: "/", replace: true });
    async function onSubmit(event) {
        event.preventDefault();
        setError('');
        setMessage('');
        setSubmitting(true);
        const input = accountType === 'LIBRARIAN'
            ? { accountType, name, email, password, employeeId }
            : { accountType, name, email, password };
        try {
            await register(input);
            setMessage(accountType === 'LIBRARIAN'
                ? 'Registration received. A manager must activate your librarian account before you can sign in.'
                : 'Your member account is ready. Sign in with your email and password.');
            setPassword('');
        }
        catch (cause) {
            setError(cause instanceof ApiClientError ? cause.message : cause instanceof Error ? cause.message : 'Registration failed. Please try again.');
        }
        finally {
            setSubmitting(false);
        }
    }
    return (_jsx("main", { className: "auth-page", children: _jsxs("section", { className: "auth-card", "aria-labelledby": "register-title", children: [_jsx(Brand, {}), _jsx("p", { className: "eyebrow", children: "GET STARTED" }), _jsx("h1", { id: "register-title", children: "Create your account" }), _jsx("p", { className: "muted", children: "Registration will not sign you in automatically." }), _jsxs("form", { onSubmit: onSubmit, className: "auth-form", children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Account type" }), _jsxs("select", { value: accountType, onChange: (event) => setAccountType(event.target.value), children: [_jsx("option", { value: "MEMBER", children: "Member" }), _jsx("option", { value: "LIBRARIAN", children: "Librarian" })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Full name" }), _jsx("input", { autoComplete: "name", value: name, onChange: (event) => setName(event.target.value), required: true, maxLength: 120 })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Email address" }), _jsx("input", { autoComplete: "email", type: "email", value: email, onChange: (event) => setEmail(event.target.value), required: true })] }), accountType === 'LIBRARIAN' && _jsxs("label", { className: "field", children: [_jsx("span", { children: "Employee ID" }), _jsx("input", { value: employeeId, onChange: (event) => setEmployeeId(event.target.value), required: true, maxLength: 128 })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Password" }), _jsx("input", { autoComplete: "new-password", type: "password", value: password, onChange: (event) => setPassword(event.target.value), required: true })] }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), message && _jsx("p", { className: "form-success", role: "status", children: message }), _jsx("button", { className: "primary-button", type: "submit", disabled: submitting, children: submitting ? 'Creating account…' : 'Create account' })] }), _jsxs("p", { className: "form-footer", children: ["Already registered? ", _jsx(Link, { to: "/login", children: "Sign in" })] })] }) }));
}
//# sourceMappingURL=RegisterPage.js.map
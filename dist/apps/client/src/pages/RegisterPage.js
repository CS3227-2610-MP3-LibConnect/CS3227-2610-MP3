import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { useAuth } from '../auth/AuthContext.js';
import { Brand } from './LoginPage.js';
export function RegisterPage() {
    const { register, user } = useAuth();
    const navigate = useNavigate();
    const [accountType, setAccountType] = useState('MEMBER');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    if (user)
        return _jsx(Navigate, { to: "/", replace: true });
    async function onSubmit(event) {
        event.preventDefault();
        setError('');
        setFieldErrors({});
        const passwordLength = Array.from(password).length;
        if (passwordLength < 8) {
            setFieldErrors({ password: 'Password must be at least 8 characters.' });
            return;
        }
        if (/\p{White_Space}/u.test(password)) {
            setFieldErrors({ password: 'Password must not contain whitespace.' });
            return;
        }
        if (password !== confirmPassword) {
            setFieldErrors({ confirmPassword: 'Confirmation password must match the password.' });
            return;
        }
        setSubmitting(true);
        const input = accountType === 'LIBRARIAN'
            ? { accountType, name, email, password, confirmPassword, employeeId }
            : { accountType, name, email, password, confirmPassword };
        try {
            await register(input);
            setPassword('');
            setConfirmPassword('');
            navigate('/login', { replace: true, state: { registrationSuccess: accountType } });
        }
        catch (cause) {
            if (cause instanceof ApiClientError && cause.fields && Object.keys(cause.fields).length > 0) {
                setFieldErrors(cause.fields);
            }
            else {
                setError(cause instanceof ApiClientError
                    ? cause.message
                    : 'Registration could not be completed. Check your connection and try again.');
            }
        }
        finally {
            setSubmitting(false);
        }
    }
    function clearFieldError(field) {
        setFieldErrors((current) => {
            const next = { ...current };
            delete next[field];
            if (field === 'password')
                delete next.confirmPassword;
            return next;
        });
        setError('');
    }
    return (_jsx("main", { className: "auth-page", children: _jsxs("section", { className: "auth-card", "aria-labelledby": "register-title", children: [_jsx(Brand, {}), _jsx("p", { className: "eyebrow", children: "GET STARTED" }), _jsx("h1", { id: "register-title", children: "Create your account" }), _jsx("p", { className: "muted", children: "Registration will not sign you in automatically." }), _jsxs("form", { onSubmit: onSubmit, className: "auth-form", children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Account type" }), _jsxs("select", { value: accountType, onChange: (event) => { clearFieldError('accountType'); setAccountType(event.target.value); }, children: [_jsx("option", { value: "MEMBER", children: "Member" }), _jsx("option", { value: "LIBRARIAN", children: "Librarian" })] }), fieldErrors.accountType && _jsx("span", { className: "form-error", role: "alert", children: fieldErrors.accountType })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Full name" }), _jsx("input", { autoComplete: "name", value: name, onChange: (event) => { clearFieldError('name'); setName(event.target.value); }, required: true, maxLength: 120, "aria-invalid": Boolean(fieldErrors.name), "aria-describedby": fieldErrors.name ? 'register-name-error' : undefined }), fieldErrors.name && _jsx("span", { id: "register-name-error", className: "form-error", role: "alert", children: fieldErrors.name })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Email address" }), _jsx("input", { autoComplete: "email", type: "email", value: email, onChange: (event) => { clearFieldError('email'); setEmail(event.target.value); }, required: true, "aria-invalid": Boolean(fieldErrors.email), "aria-describedby": fieldErrors.email ? 'register-email-error' : undefined }), fieldErrors.email && _jsx("span", { id: "register-email-error", className: "form-error", role: "alert", children: fieldErrors.email })] }), accountType === 'LIBRARIAN' && _jsxs("label", { className: "field", children: [_jsx("span", { children: "Employee ID" }), _jsx("input", { value: employeeId, onChange: (event) => { clearFieldError('employeeId'); setEmployeeId(event.target.value); }, required: true, maxLength: 128, "aria-invalid": Boolean(fieldErrors.employeeId), "aria-describedby": fieldErrors.employeeId ? 'register-employee-id-error' : undefined }), fieldErrors.employeeId && _jsx("span", { id: "register-employee-id-error", className: "form-error", role: "alert", children: fieldErrors.employeeId })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Password" }), _jsx("input", { autoComplete: "new-password", type: "password", value: password, onChange: (event) => { clearFieldError('password'); setPassword(event.target.value); }, required: true, minLength: 8, maxLength: 1024, pattern: "[^\\s]+", title: "Password must not contain whitespace.", "aria-invalid": Boolean(fieldErrors.password), "aria-describedby": fieldErrors.password ? 'register-password-error' : undefined }), fieldErrors.password && _jsx("span", { id: "register-password-error", className: "form-error", role: "alert", children: fieldErrors.password })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Confirm password" }), _jsx("input", { autoComplete: "new-password", type: "password", value: confirmPassword, onChange: (event) => { clearFieldError('confirmPassword'); setConfirmPassword(event.target.value); }, required: true, maxLength: 1024, "aria-invalid": Boolean(fieldErrors.confirmPassword), "aria-describedby": fieldErrors.confirmPassword ? 'register-confirm-password-error' : undefined }), fieldErrors.confirmPassword && _jsx("span", { id: "register-confirm-password-error", className: "form-error", role: "alert", children: fieldErrors.confirmPassword })] }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), _jsx("button", { className: "primary-button", type: "submit", disabled: submitting, children: submitting ? 'Creating account…' : 'Create account' })] }), _jsxs("p", { className: "form-footer", children: ["Already registered? ", _jsx(Link, { to: "/login", children: "Sign in" })] })] }) }));
}
//# sourceMappingURL=RegisterPage.js.map
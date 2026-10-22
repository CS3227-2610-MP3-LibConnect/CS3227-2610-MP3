import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { memberProfileApi } from '../api/member-profile.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';
function validEmail(value) {
    const trimmed = value.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed);
}
function validPassword(value) {
    return Array.from(value).length >= 8 && !/\p{White_Space}/u.test(value);
}
export function MemberProfile() {
    const { user, logout, updateUser } = useAuth();
    const [name, setName] = useState(user?.name ?? '');
    const [email, setEmail] = useState(user?.email ?? '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [feedback, setFeedback] = useState({ name: null, email: null, password: null });
    const [loading, setLoading] = useState(false);
    const setSectionFeedback = (section, value) => {
        setFeedback((current) => ({ ...current, [section]: value }));
    };
    useEffect(() => {
        let active = true;
        void memberProfileApi.get().then(({ user: profile }) => {
            if (!active)
                return;
            setName(profile.name);
            setEmail(profile.email);
            updateUser(profile);
        }).catch((cause) => {
            if (active)
                setSectionFeedback('name', { kind: 'error', message: cause instanceof Error ? cause.message : 'Could not load your profile.' });
        });
        return () => { active = false; };
    }, [updateUser]);
    if (!user || user.accountType !== 'MEMBER')
        return null;
    const submitName = async (event) => {
        event.preventDefault();
        if (loading)
            return;
        if (!name.trim()) {
            setSectionFeedback('name', { kind: 'error', message: 'Enter your name.' });
            return;
        }
        setLoading(true);
        setSectionFeedback('name', null);
        try {
            const result = await memberProfileApi.updateName(name);
            setName(result.user.name);
            setEmail(result.user.email);
            updateUser(result.user);
            setSectionFeedback('name', { kind: 'success', message: 'Your name was updated.' });
        }
        catch (cause) {
            setSectionFeedback('name', { kind: 'error', message: cause instanceof Error ? cause.message : 'Could not update your name. Please try again.' });
        }
        finally {
            setLoading(false);
        }
    };
    const submitEmail = async (event) => {
        event.preventDefault();
        if (loading)
            return;
        if (!validEmail(email)) {
            setSectionFeedback('email', { kind: 'error', message: 'Enter a valid email address.' });
            return;
        }
        setLoading(true);
        setSectionFeedback('email', null);
        try {
            const result = await memberProfileApi.updateEmail(email);
            setName(result.user.name);
            setEmail(result.user.email);
            updateUser(result.user);
            setSectionFeedback('email', { kind: 'success', message: 'Your email address was updated.' });
        }
        catch (cause) {
            setSectionFeedback('email', { kind: 'error', message: cause instanceof Error ? cause.message : 'Could not update your email. Please try again.' });
        }
        finally {
            setLoading(false);
        }
    };
    const submitPassword = async (event) => {
        event.preventDefault();
        if (loading)
            return;
        if (!validPassword(newPassword)) {
            setSectionFeedback('password', { kind: 'error', message: 'Use at least 8 characters and do not include whitespace.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setSectionFeedback('password', { kind: 'error', message: 'The new password and confirmation do not match.' });
            return;
        }
        setLoading(true);
        setSectionFeedback('password', null);
        try {
            await memberProfileApi.changePassword({ currentPassword, newPassword, confirmPassword });
            setSectionFeedback('password', { kind: 'success', message: 'Your password was changed.' });
        }
        catch (cause) {
            setSectionFeedback('password', { kind: 'error', message: cause instanceof Error ? cause.message : 'Could not change your password. Please try again.' });
        }
        finally {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setLoading(false);
        }
    };
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsx("section", { className: "member-profile-content", "aria-labelledby": "profile-heading", children: _jsxs(MemberProfileHub, { children: [_jsx("p", { className: "eyebrow", children: "MEMBER ACCOUNT" }), _jsx("h1", { id: "profile-heading", children: "Profile" }), _jsxs("div", { className: "member-profile-panels", children: [_jsxs("section", { className: "member-profile-panel", "aria-labelledby": "profile-details-heading", children: [_jsx("h2", { id: "profile-details-heading", children: "Profile details" }), _jsx("p", { className: "muted", children: "Your current account details are shown below." }), feedback.name && _jsx("p", { className: feedback.name.kind === 'success' ? 'form-success' : 'form-error', role: feedback.name.kind === 'success' ? 'status' : 'alert', children: feedback.name.message }), _jsxs("form", { className: "member-profile-form", onSubmit: (event) => void submitName(event), children: [_jsxs("label", { className: "field", htmlFor: "profile-name", children: [_jsx("span", { children: "Name" }), _jsx("input", { id: "profile-name", name: "name", value: name, maxLength: 120, autoComplete: "name", onChange: (event) => setName(event.target.value) })] }), _jsxs("p", { className: "member-profile-current-value", children: ["Email: ", _jsx("span", { children: user.email })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: loading, children: loading ? 'Saving…' : 'Save name' })] })] }), _jsxs("section", { className: "member-profile-panel", "aria-labelledby": "profile-email-heading", children: [_jsx("h2", { id: "profile-email-heading", children: "Email" }), _jsx("p", { className: "muted", children: "Your email address is used to sign in." }), feedback.email && _jsx("p", { className: feedback.email.kind === 'success' ? 'form-success' : 'form-error', role: feedback.email.kind === 'success' ? 'status' : 'alert', children: feedback.email.message }), _jsxs("form", { className: "member-profile-form", onSubmit: (event) => void submitEmail(event), children: [_jsxs("label", { className: "field", htmlFor: "profile-email", children: [_jsx("span", { children: "Email address" }), _jsx("input", { id: "profile-email", name: "email", type: "email", value: email, autoComplete: "email", onChange: (event) => setEmail(event.target.value) })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: loading, children: loading ? 'Saving…' : 'Save email' })] })] }), _jsxs("section", { className: "member-profile-panel", "aria-labelledby": "profile-password-heading", children: [_jsx("h2", { id: "profile-password-heading", children: "Password" }), _jsx("p", { className: "muted", children: "Choose a password with at least 8 characters and no whitespace." }), feedback.password && _jsx("p", { className: feedback.password.kind === 'success' ? 'form-success' : 'form-error', role: feedback.password.kind === 'success' ? 'status' : 'alert', children: feedback.password.message }), _jsxs("form", { className: "member-profile-form", onSubmit: (event) => void submitPassword(event), children: [_jsxs("label", { className: "field", htmlFor: "profile-current-password", children: [_jsx("span", { children: "Current password" }), _jsx("input", { id: "profile-current-password", name: "currentPassword", type: "password", value: currentPassword, autoComplete: "current-password", onChange: (event) => setCurrentPassword(event.target.value) })] }), _jsxs("label", { className: "field", htmlFor: "profile-new-password", children: [_jsx("span", { children: "New password" }), _jsx("input", { id: "profile-new-password", name: "newPassword", type: "password", value: newPassword, autoComplete: "new-password", onChange: (event) => setNewPassword(event.target.value) })] }), _jsxs("label", { className: "field", htmlFor: "profile-confirm-password", children: [_jsx("span", { children: "Confirm new password" }), _jsx("input", { id: "profile-confirm-password", name: "confirmPassword", type: "password", value: confirmPassword, autoComplete: "new-password", onChange: (event) => setConfirmPassword(event.target.value) })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: loading, children: loading ? 'Changing…' : 'Change password' })] })] })] })] }) })] }));
}
//# sourceMappingURL=MemberProfile.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { memberAccountsApi } from '../api/members.js';
import { useAuth } from '../auth/AuthContext.js';
function readableStatus(status) {
    return status === 'ACTIVE' ? 'Active' : 'Inactive';
}
export function nextMemberStatus(status) {
    return status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
}
export function memberStatusChangeDetails(member) {
    const nextStatus = nextMemberStatus(member.accountStatus);
    const action = nextStatus === 'ACTIVE' ? 'activate' : 'deactivate';
    return {
        nextStatus,
        confirmationMessage: `Confirm that you want to ${action} ${member.name}'s member account? The account will become ${readableStatus(nextStatus)}.`,
        successMessage: `${member.name}'s account is now ${readableStatus(nextStatus)}.`,
    };
}
export function createMemberStatusSubmissionGuard() {
    let pendingUserId = null;
    return {
        acquire(userId) {
            if (pendingUserId !== null)
                return false;
            pendingUserId = userId;
            return true;
        },
        release(userId) {
            if (pendingUserId === userId)
                pendingUserId = null;
        },
    };
}
function displayError(caught, fallback) {
    if (caught instanceof ApiClientError && caught.status === 409)
        return 'The member account changed before this request. Refresh and try again.';
    return caught instanceof ApiClientError ? caught.message : fallback;
}
function formatRegistrationDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}
export function LibrarianMemberSupportPage() {
    const { logout } = useAuth();
    const [members, setMembers] = useState([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [currentCursor, setCurrentCursor] = useState();
    const [nextCursor, setNextCursor] = useState(null);
    const [selectedMember, setSelectedMember] = useState(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [pendingUserId, setPendingUserId] = useState(null);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const statusSubmissionGuard = useRef(createMemberStatusSubmissionGuard());
    const loadMembers = useCallback(async (cursor) => {
        setLoading(true);
        setError(null);
        try {
            const result = await memberAccountsApi.list({ status: statusFilter || undefined, limit: 20, cursor });
            setMembers(result.items);
            setNextCursor(result.page.nextCursor);
            setCurrentCursor(cursor);
            setSelectedMember(null);
        }
        catch (caught) {
            setError(displayError(caught, 'Member accounts could not be loaded.'));
        }
        finally {
            setLoading(false);
        }
    }, [statusFilter]);
    useEffect(() => { void loadMembers(); }, [loadMembers]);
    async function selectMember(userId) {
        setDetailLoading(true);
        setError(null);
        try {
            const result = await memberAccountsApi.get(userId);
            setSelectedMember(result.member);
        }
        catch (caught) {
            setError(displayError(caught, 'Member details could not be loaded.'));
        }
        finally {
            setDetailLoading(false);
        }
    }
    async function changeStatus(member) {
        const details = memberStatusChangeDetails(member);
        if (!statusSubmissionGuard.current.acquire(member.userId))
            return;
        if (!window.confirm(details.confirmationMessage)) {
            statusSubmissionGuard.current.release(member.userId);
            return;
        }
        setPendingUserId(member.userId);
        setError(null);
        setSuccess(null);
        try {
            await memberAccountsApi.updateStatus(member.userId, details.nextStatus);
            setSuccess(details.successMessage);
            await loadMembers(currentCursor);
        }
        catch (caught) {
            setError(displayError(caught, 'The member account status could not be changed. Please refresh and try again.'));
        }
        finally {
            statusSubmissionGuard.current.release(member.userId);
            setPendingUserId(null);
        }
    }
    function applyFilter(event) {
        event.preventDefault();
        void loadMembers();
    }
    return _jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs(Link, { className: "brand-lockup", to: "/librarian/dashboard", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "dashboard-actions", "aria-label": "Member support navigation", children: [_jsx(Link, { className: "text-button", to: "/librarian/dashboard", children: "Dashboard" }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] })] }), _jsxs("section", { className: "catalog-panel", "aria-labelledby": "member-support-title", children: [_jsx("p", { className: "eyebrow", children: "LIBRARIAN TOOLS" }), _jsx("h1", { id: "member-support-title", children: "Member account support" }), _jsx("p", { className: "muted", children: "View bounded member account details and activate or deactivate access when needed. Loans, reservations, fines, and notifications are preserved." }), success && _jsx("p", { className: "form-success", role: "status", children: success }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), _jsxs("form", { className: "catalog-search", onSubmit: applyFilter, "aria-label": "Filter member accounts", children: [_jsxs("label", { className: "field", children: ["Account status", _jsxs("select", { value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), children: [_jsx("option", { value: "", children: "All" }), _jsx("option", { value: "ACTIVE", children: "Active" }), _jsx("option", { value: "INACTIVE", children: "Inactive" })] })] }), _jsx("button", { className: "primary-button compact-button", type: "submit", disabled: loading || pendingUserId !== null, children: "Apply filter" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void loadMembers(currentCursor), disabled: loading || pendingUserId !== null, children: "Refresh" })] }), loading ? _jsx("p", { className: "muted", "aria-live": "polite", children: "Loading member accounts\u2026" }) : members.length === 0 ? _jsx("p", { className: "empty-state", children: "No member accounts match this filter." }) : _jsx("div", { className: "account-table-wrap", children: _jsxs("table", { className: "account-table", children: [_jsx("caption", { className: "sr-only", children: "Member accounts and statuses" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Member" }), _jsx("th", { scope: "col", children: "Member ID" }), _jsx("th", { scope: "col", children: "Registered" }), _jsx("th", { scope: "col", children: "Status" }), _jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Actions" }) })] }) }), _jsx("tbody", { children: members.map((member) => { const details = memberStatusChangeDetails(member); return _jsxs("tr", { children: [_jsxs("th", { scope: "row", children: [_jsx("span", { children: member.name }), _jsx("small", { children: member.email })] }), _jsx("td", { children: member.memberId }), _jsx("td", { children: formatRegistrationDate(member.registrationDateTime) }), _jsx("td", { children: _jsx("span", { className: `status-pill status-${member.accountStatus.toLowerCase()}`, children: readableStatus(member.accountStatus) }) }), _jsxs("td", { className: "account-actions", children: [_jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void selectMember(member.userId), disabled: pendingUserId !== null || detailLoading, children: "View details" }), _jsx("button", { className: "primary-button compact-button", type: "button", onClick: () => void changeStatus(member), disabled: pendingUserId !== null, children: pendingUserId === member.userId ? 'Saving…' : details.nextStatus === 'ACTIVE' ? 'Activate account' : 'Deactivate account' })] })] }, member.userId); }) })] }) }), nextCursor && _jsx("button", { className: "text-button", type: "button", onClick: () => void loadMembers(nextCursor), disabled: loading || pendingUserId !== null, children: "Next member accounts" }), detailLoading && _jsx("p", { className: "muted", "aria-live": "polite", children: "Loading member details\u2026" }), selectedMember && _jsxs("section", { className: "catalog-detail", "aria-labelledby": "member-detail-title", children: [_jsx("h2", { id: "member-detail-title", children: selectedMember.name }), _jsxs("dl", { className: "book-metadata", children: [_jsxs("div", { children: [_jsx("dt", { children: "Member ID" }), _jsx("dd", { children: selectedMember.memberId })] }), _jsxs("div", { children: [_jsx("dt", { children: "Email" }), _jsx("dd", { children: selectedMember.email })] }), _jsxs("div", { children: [_jsx("dt", { children: "Status" }), _jsx("dd", { children: readableStatus(selectedMember.accountStatus) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Registered" }), _jsx("dd", { children: formatRegistrationDate(selectedMember.registrationDateTime) })] })] })] })] })] });
}
//# sourceMappingURL=LibrarianMemberSupportPage.js.map
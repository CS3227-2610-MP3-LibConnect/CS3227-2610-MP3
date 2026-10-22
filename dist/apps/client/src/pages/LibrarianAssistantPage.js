import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { librarianAssistantApi } from '../api/librarian-assistant.js';
import { circulationApi } from '../api/circulation.js';
import { reservationsFinesApi } from '../api/circulation.js';
import { useAuth } from '../auth/AuthContext.js';
function displayError(caught, fallback) {
    return caught instanceof ApiClientError ? caught.message : fallback;
}
export function LibrarianAssistantPage() {
    const { logout } = useAuth();
    const [reports, setReports] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [summary, setSummary] = useState(null);
    const [draft, setDraft] = useState(null);
    const [draftText, setDraftText] = useState('');
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const loadReports = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await circulationApi.pendingClose();
            setReports(result.items);
            setSelectedIds((current) => current.filter((id) => result.items.some((item) => item.loan.loanId === id)));
        }
        catch (caught) {
            setError(displayError(caught, 'Pending reports could not be loaded.'));
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void loadReports(); }, [loadReports]);
    function toggleReport(loanId) {
        setSelectedIds((current) => current.includes(loanId) ? current.filter((id) => id !== loanId) : current.length >= 20 ? current : [...current, loanId]);
    }
    async function summarize(event) {
        event?.preventDefault();
        if (selectedIds.length === 0) {
            setError('Select at least one pending report.');
            return;
        }
        setPending(true);
        setError(null);
        setSuccess(null);
        setDraft(null);
        try {
            setSummary(await librarianAssistantApi.summarize(selectedIds));
        }
        catch (caught) {
            setSummary(null);
            setError(displayError(caught, 'The assistant is unavailable. Refresh and try again.'));
        }
        finally {
            setPending(false);
        }
    }
    async function createDraft(item) {
        const purpose = item.loan.closureReportType === 'RETURNED' ? 'RETURN_FOLLOW_UP' : 'LOSS_FOLLOW_UP';
        setPending(true);
        setError(null);
        setSuccess(null);
        setSummary(null);
        try {
            const result = await librarianAssistantApi.draft(item.loan.loanId, purpose);
            setDraft(result);
            setDraftText(result.message);
        }
        catch (caught) {
            setDraft(null);
            setError(displayError(caught, 'The draft could not be prepared. Refresh and try again.'));
        }
        finally {
            setPending(false);
        }
    }
    async function sendDraft(event) {
        event.preventDefault();
        if (!draft || !draftText.trim()) {
            setError('Review and enter a draft before sending.');
            return;
        }
        if (!window.confirm(`Send this reviewed message to member ${draft.memberId}?`))
            return;
        setPending(true);
        setError(null);
        setSuccess(null);
        try {
            await reservationsFinesApi.sendMessage(draft.memberId, draftText.trim(), `ai-draft-${crypto.randomUUID()}`);
            setDraft(null);
            setDraftText('');
            setSuccess('The reviewed message was sent through the normal notification workflow.');
            await loadReports();
        }
        catch (caught) {
            setError(displayError(caught, 'The message was not sent. Refresh and try again.'));
        }
        finally {
            setPending(false);
        }
    }
    return _jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs(Link, { className: "brand-lockup", to: "/librarian/dashboard", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "dashboard-actions", "aria-label": "Assistant navigation", children: [_jsx(Link, { className: "text-button", to: "/librarian/dashboard", children: "Dashboard" }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] })] }), _jsxs("section", { className: "catalog-panel", "aria-labelledby": "assistant-title", children: [_jsx("p", { className: "eyebrow", children: "LIBRARIAN TOOLS" }), _jsx("h1", { id: "assistant-title", children: "Review assistant" }), _jsx("p", { className: "muted", children: "AI-generated summaries and drafts are advisory and untrusted. Review every result; the assistant cannot confirm reports or send messages by itself." }), success && _jsx("p", { className: "form-success", role: "status", children: success }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), _jsxs("div", { className: "section-heading", children: [_jsx("h2", { children: "Pending reports" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void loadReports(), disabled: loading || pending, children: "Refresh" })] }), loading ? _jsx("p", { className: "muted", "aria-live": "polite", children: "Loading pending reports\u2026" }) : reports.length === 0 ? _jsx("p", { className: "empty-state", children: "No pending return or loss reports." }) : _jsxs("form", { onSubmit: (event) => void summarize(event), children: [_jsx("div", { className: "account-table-wrap", children: _jsxs("table", { className: "account-table", children: [_jsx("caption", { className: "sr-only", children: "Pending reports available to the review assistant" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Select" }) }), _jsx("th", { scope: "col", children: "Book" }), _jsx("th", { scope: "col", children: "Member" }), _jsx("th", { scope: "col", children: "Report" }), _jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Action" }) })] }) }), _jsx("tbody", { children: reports.map((item) => _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { "aria-label": `Select ${item.loan.bookTitle}`, type: "checkbox", checked: selectedIds.includes(item.loan.loanId), onChange: () => toggleReport(item.loan.loanId), disabled: pending }) }), _jsxs("th", { scope: "row", children: [item.loan.bookTitle, _jsx("small", { children: item.loan.loanId })] }), _jsx("td", { children: item.loan.memberId }), _jsx("td", { children: item.loan.closureReportType }), _jsx("td", { children: _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void createDraft(item), disabled: pending, children: "Prepare draft" }) })] }, item.loan.loanId)) })] }) }), _jsx("button", { className: "primary-button compact-button", type: "submit", disabled: pending || selectedIds.length === 0, children: pending ? 'Working…' : 'Summarize selected reports' })] }), summary && _jsxs("section", { className: "catalog-form-shell", "aria-labelledby": "summary-title", children: [_jsx("p", { className: "eyebrow", children: "AI-GENERATED \u00B7 ADVISORY" }), _jsx("h2", { id: "summary-title", children: "Pending-report summary" }), _jsx("p", { children: summary.summary }), summary.uncertainty && _jsxs("p", { className: "muted", children: [_jsx("strong", { children: "Uncertainty:" }), " ", summary.uncertainty] }), _jsx("ul", { children: summary.items.map((item) => _jsxs("li", { children: [_jsx("strong", { children: item.bookTitle }), " \u00B7 ", item.action.replace('_', ' '), " \u2014 ", item.facts] }, item.loanId)) }), _jsx("p", { className: "muted", children: "Review the report in the normal closure workflow before taking action." })] }), draft && _jsxs("form", { className: "catalog-form-shell catalog-form", onSubmit: (event) => void sendDraft(event), "aria-labelledby": "draft-title", children: [_jsx("p", { className: "eyebrow", children: "AI-GENERATED \u00B7 EDIT BEFORE SENDING" }), _jsx("h2", { id: "draft-title", children: "Notification draft" }), _jsxs("p", { className: "muted", children: ["For member ", draft.memberId, ". This is an ephemeral preview and has not been saved as a notification."] }), _jsxs("label", { className: "field", children: ["Reviewed message", _jsx("textarea", { value: draftText, onChange: (event) => setDraftText(event.target.value), maxLength: 2000, disabled: pending, required: true })] }), _jsxs("p", { className: "muted", children: [_jsx("strong", { children: "Rationale:" }), " ", draft.rationale] }), draft.warning && _jsxs("p", { className: "form-error", children: ["Warning: ", draft.warning] }), _jsx("p", { className: "muted", children: "Explicit confirmation is required; sending uses the existing active-member and idempotency checks." }), _jsxs("div", { className: "catalog-form-actions", children: [_jsx("button", { className: "primary-button compact-button", type: "submit", disabled: pending, children: pending ? 'Sending…' : 'Confirm and send reviewed message' }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => { setDraft(null); setDraftText(''); }, disabled: pending, children: "Discard draft" })] })] })] })] });
}
//# sourceMappingURL=LibrarianAssistantPage.js.map
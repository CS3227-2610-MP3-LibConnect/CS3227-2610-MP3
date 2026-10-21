import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { circulationApi } from '../api/circulation.js';
import { useAuth } from '../auth/AuthContext.js';
function displayError(caught, fallback) {
    return caught instanceof ApiClientError ? caught.message : fallback;
}
export function LibrarianCirculationPage() {
    const { logout } = useAuth();
    const [memberId, setMemberId] = useState('');
    const [copyId, setCopyId] = useState('');
    const [items, setItems] = useState([]);
    const [selected, setSelected] = useState(null);
    const [disposition, setDisposition] = useState('AVAILABLE');
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const loadQueue = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setItems((await circulationApi.pendingClose()).items);
        }
        catch (caught) {
            setError(displayError(caught, 'Pending closure reports could not be loaded.'));
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void loadQueue(); }, [loadQueue]);
    async function createLoan(event) {
        event.preventDefault();
        if (!memberId.trim() || !copyId.trim()) {
            setError('Member ID and copy ID are required.');
            return;
        }
        setPending(true);
        setError(null);
        setSuccess(null);
        try {
            await circulationApi.createLoan(memberId.trim(), copyId.trim());
            setMemberId('');
            setCopyId('');
            setSuccess('Loan created.');
            await loadQueue();
        }
        catch (caught) {
            setError(displayError(caught, 'The loan could not be created.'));
        }
        finally {
            setPending(false);
        }
    }
    async function selectReport(item) {
        setPending(true);
        setError(null);
        setSuccess(null);
        try {
            const preview = item.loan.closureReportType === 'RETURNED' ? await circulationApi.returnPreview(item.loan.loanId) : null;
            setDisposition(preview?.allowedDispositions[0] ?? 'AVAILABLE');
            setSelected({ item, preview });
        }
        catch (caught) {
            setError(displayError(caught, 'The report preview could not be loaded.'));
        }
        finally {
            setPending(false);
        }
    }
    async function review(decision) {
        if (!selected)
            return;
        if (decision === 'CONFIRM' && selected.item.loan.closureReportType === 'RETURNED' && !selected.preview?.allowedDispositions.includes(disposition)) {
            setError('Choose an allowed return disposition before confirming.');
            return;
        }
        if (!window.confirm(`${decision === 'CONFIRM' ? 'Confirm' : 'Reject'} this ${selected.item.loan.closureReportType?.toLowerCase()} report?`))
            return;
        setPending(true);
        setError(null);
        setSuccess(null);
        try {
            await circulationApi.review(selected.item.loan.loanId, decision, decision === 'CONFIRM' && selected.item.loan.closureReportType === 'RETURNED' ? disposition : undefined);
            setSelected(null);
            setSuccess('Closure review saved.');
            await loadQueue();
        }
        catch (caught) {
            setError(displayError(caught, 'The closure review could not be saved.'));
        }
        finally {
            setPending(false);
        }
    }
    return _jsxs("main", { className: "dashboard-page", children: [_jsxs("header", { className: "dashboard-header", children: [_jsxs(Link, { className: "brand-lockup", to: "/librarian/dashboard", "aria-label": "LibConnect home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true", children: "L" }), _jsx("span", { children: "LibConnect" })] }), _jsxs("nav", { className: "dashboard-actions", "aria-label": "Circulation navigation", children: [_jsx(Link, { className: "text-button", to: "/librarian/dashboard", children: "Dashboard" }), _jsx("button", { className: "text-button", onClick: () => void logout(), children: "Sign out" })] })] }), _jsxs("section", { className: "manager-panel", "aria-labelledby": "circulation-title", children: [_jsx("p", { className: "eyebrow", children: "LIBRARIAN TOOLS" }), _jsx("h1", { id: "circulation-title", children: "Loans & closure review" }), _jsx("p", { className: "muted", children: "Create loans and review member return or loss reports. Server checks the member, copy, and current state before every change." }), success && _jsx("p", { className: "form-success", role: "status", children: success }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), _jsxs("form", { className: "reset-password-form", onSubmit: (event) => void createLoan(event), "aria-labelledby": "create-loan-title", children: [_jsx("h2", { id: "create-loan-title", children: "Create a loan" }), _jsxs("label", { className: "field", children: ["Member ID", _jsx("input", { value: memberId, onChange: (event) => setMemberId(event.target.value), maxLength: 128, required: true })] }), _jsxs("label", { className: "field", children: ["Copy ID", _jsx("input", { value: copyId, onChange: (event) => setCopyId(event.target.value), maxLength: 128, required: true })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: pending, children: pending ? 'Saving…' : 'Create loan' })] }), _jsxs("div", { className: "section-heading", style: { marginTop: '2.5rem' }, children: [_jsx("h2", { children: "Pending reports" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void loadQueue(), disabled: loading || pending, children: "Refresh" })] }), loading ? _jsx("p", { className: "muted", "aria-live": "polite", children: "Loading pending reports\u2026" }) : items.length === 0 ? _jsx("p", { className: "empty-state", children: "No pending return or loss reports." }) : _jsx("div", { className: "account-table-wrap", children: _jsxs("table", { className: "account-table", children: [_jsx("caption", { className: "sr-only", children: "Pending member closure reports" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Book" }), _jsx("th", { scope: "col", children: "Member" }), _jsx("th", { scope: "col", children: "Report" }), _jsx("th", { scope: "col", children: "Copy" }), _jsx("th", { scope: "col", children: _jsx("span", { className: "sr-only", children: "Action" }) })] }) }), _jsx("tbody", { children: items.map((item) => _jsxs("tr", { children: [_jsxs("th", { scope: "row", children: [item.loan.bookTitle, _jsx("small", { children: item.loan.loanId })] }), _jsx("td", { children: item.loan.memberId }), _jsx("td", { children: item.loan.closureReportType }), _jsxs("td", { children: [item.copy.copyId, _jsx("small", { children: item.copy.status.replace('_', ' ') })] }), _jsx("td", { children: _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void selectReport(item), disabled: pending, children: "Review" }) })] }, item.loan.loanId)) })] }) }), selected && _jsxs("section", { className: "catalog-form-shell", "aria-labelledby": "review-title", children: [_jsxs("h2", { id: "review-title", children: ["Review ", selected.item.loan.closureReportType?.toLowerCase(), " report"] }), _jsxs("p", { className: "muted", children: [selected.item.loan.bookTitle, " \u00B7 ", selected.item.loan.memberId, " \u00B7 ", selected.item.copy.copyId] }), selected.item.loan.closureReportType === 'RETURNED' && selected.preview && _jsxs("label", { className: "field", children: ["Return disposition", _jsx("select", { value: disposition, onChange: (event) => setDisposition(event.target.value), children: selected.preview.allowedDispositions.map((option) => _jsx("option", { value: option, children: option.replace('_', ' ') }, option)) })] }), selected.item.loan.closureReportType === 'LOST' && _jsx("p", { className: "muted", children: "Confirming marks the copy lost and creates the server-policy fine. The fine amount cannot be changed here." }), _jsxs("div", { className: "catalog-form-actions", children: [_jsx("button", { className: "primary-button compact-button", type: "button", onClick: () => void review('CONFIRM'), disabled: pending, children: "Confirm report" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => void review('REJECT'), disabled: pending, children: "Reject report" }), _jsx("button", { className: "text-button compact-button", type: "button", onClick: () => setSelected(null), disabled: pending, children: "Cancel" })] })] })] })] });
}
//# sourceMappingURL=LibrarianCirculationPage.js.map
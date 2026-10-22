import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { borrowApi } from '../api/borrow.js';
import { ApiClientError } from '../api/errors.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberLoanCard } from '../components/MemberLoanCard.js';
import { loansForView } from './member-loan-view.js';
export function MemberLoans() {
    const { user, logout } = useAuth();
    const [loans, setLoans] = useState([]);
    const [view, setView] = useState('active');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reportLoan, setReportLoan] = useState(null);
    const [reportType, setReportType] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [renewalFeedback, setRenewalFeedback] = useState(null);
    const [renewingLoanIds, setRenewingLoanIds] = useState([]);
    const renewingLoanIdsRef = useRef(new Set());
    const dialogRef = useRef(null);
    const triggerRef = useRef(null);
    const refreshLoans = async () => {
        const result = await borrowApi.listLoans();
        setLoans(result);
    };
    useEffect(() => {
        let active = true;
        void borrowApi.listLoans().then((result) => {
            if (active)
                setLoans(result);
        }).catch((cause) => {
            if (active)
                setError(cause instanceof Error ? cause.message : 'Could not load your loans.');
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => { active = false; };
    }, []);
    useEffect(() => {
        if (reportLoan)
            dialogRef.current?.querySelector('button')?.focus();
        else
            triggerRef.current?.focus();
    }, [reportLoan, reportType]);
    const cancelReport = () => { if (!submitting) {
        setReportType(null);
        setReportLoan(null);
    } };
    const submitReport = async () => {
        if (!reportLoan || !reportType || submitting)
            return;
        setSubmitting(true);
        setError(null);
        setFeedback(null);
        try {
            await borrowApi.reportClosure(reportLoan.loanId, reportType);
            try {
                await refreshLoans();
            }
            catch {
                setLoans((current) => current.map((loan) => loan.loanId === reportLoan.loanId
                    ? { ...loan, status: 'PENDING_CLOSE', closureReportType: reportType }
                    : loan));
            }
            setFeedback('Your report was submitted for librarian review.');
            setReportLoan(null);
            setReportType(null);
        }
        catch (cause) {
            if (cause instanceof ApiClientError && cause.status === 409) {
                let refreshed = false;
                try {
                    await refreshLoans();
                    refreshed = true;
                }
                catch { /* Keep the last confirmed list if refresh is unavailable. */ }
                setError(`This loan is no longer active, so the report could not be submitted. Your loan list${refreshed ? ' has been refreshed' : ' could not be refreshed'}.`);
                setReportLoan(null);
                setReportType(null);
            }
            else
                setError(cause instanceof Error ? cause.message : 'Could not submit the report. Please try again.');
        }
        finally {
            setSubmitting(false);
        }
    };
    const renewLoan = async (loan) => {
        const renewalAlreadyInProgress = renewingLoanIdsRef.current.has(loan.loanId);
        if (renewalAlreadyInProgress)
            return;
        renewingLoanIdsRef.current.add(loan.loanId);
        setRenewingLoanIds((current) => [...current, loan.loanId]);
        setRenewalFeedback(null);
        setError(null);
        try {
            const renewedLoan = await borrowApi.renewLoan(loan.loanId);
            if (!renewedLoan.isRenewed)
                throw new Error('The renewal response was incomplete. Please refresh your loans and try again.');
            setLoans((current) => current.map((currentLoan) => currentLoan.loanId === renewedLoan.loanId ? renewedLoan : currentLoan));
            setRenewalFeedback(`${renewedLoan.bookTitle} was renewed. Its new due date is ${new Date(renewedLoan.dueDate).toLocaleDateString()}.`);
        }
        catch (cause) {
            if (cause instanceof ApiClientError && cause.status === 409) {
                try {
                    await refreshLoans();
                }
                catch { /* Keep the last confirmed loan list when refresh is unavailable. */ }
                setError(`${loan.bookTitle} can no longer be renewed. Your loan list has been refreshed when available.`);
            }
            else {
                setError(cause instanceof Error ? cause.message : 'Could not renew this loan. Please try again.');
            }
        }
        finally {
            renewingLoanIdsRef.current.delete(loan.loanId);
            setRenewingLoanIds((current) => current.filter((loanId) => loanId !== loan.loanId));
        }
    };
    if (!user || user.accountType !== 'MEMBER')
        return null;
    const visibleLoans = loansForView(loans, view);
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsx("section", { className: "member-profile-content", "aria-labelledby": "member-loans-heading", children: _jsx(MemberProfileHub, { children: _jsxs("div", { className: "member-loans-page", children: [_jsx("p", { className: "eyebrow", children: "MEMBER ACCOUNT" }), _jsx("h1", { id: "member-loans-heading", children: "My Loans" }), _jsxs("div", { className: "loan-view-toggle", role: "group", "aria-label": "Loan history view", children: [_jsx("button", { type: "button", "aria-pressed": view === 'active', onClick: () => setView('active'), children: "Active" }), _jsx("button", { type: "button", "aria-pressed": view === 'past', onClick: () => setView('past'), children: "Past" })] }), error && _jsxs("p", { className: "form-error", role: "alert", children: [error, " ", _jsx("button", { type: "button", "aria-label": "Dismiss error", onClick: () => setError(null), children: "Dismiss" })] }), loading ? _jsx("p", { className: "muted", role: "status", children: "Loading loans\u2026" }) : visibleLoans.length === 0 ? (_jsx("p", { className: "muted", role: "status", children: view === 'active' ? 'You have no active loans.' : 'You have no past loans.' })) : (_jsx("div", { className: "member-loan-list", "aria-label": `${view === 'active' ? 'Active' : 'Past'} loans`, children: visibleLoans.map((loan) => {
                                    return (_jsx(MemberLoanCard, { loan: loan, renewing: renewingLoanIds.includes(loan.loanId), onRenew: (selected) => void renewLoan(selected), onReport: (selected) => {
                                            triggerRef.current = document.activeElement;
                                            setFeedback(null);
                                            setError(null);
                                            setReportLoan(selected);
                                            setReportType(null);
                                        } }, loan.loanId));
                                }) })), feedback && _jsx("p", { role: "status", children: feedback }), renewalFeedback && _jsxs("p", { role: "status", children: [renewalFeedback, " ", _jsx("button", { type: "button", "aria-label": "Dismiss renewal confirmation", onClick: () => setRenewalFeedback(null), children: "Dismiss" })] }), reportLoan && _jsx("div", { className: "member-report-backdrop", children: _jsxs("div", { ref: dialogRef, className: "member-report-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "loan-report-heading", onKeyDown: (event) => {
                                        if (event.key === 'Escape') {
                                            event.preventDefault();
                                            cancelReport();
                                        }
                                        if (event.key === 'Tab') {
                                            const buttons = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'));
                                            if (!buttons.length)
                                                return;
                                            const first = buttons[0], last = buttons[buttons.length - 1];
                                            if (event.shiftKey && document.activeElement === first) {
                                                event.preventDefault();
                                                last.focus();
                                            }
                                            else if (!event.shiftKey && document.activeElement === last) {
                                                event.preventDefault();
                                                first.focus();
                                            }
                                        }
                                    }, children: [_jsx("h2", { id: "loan-report-heading", children: reportType ? 'Confirm report' : 'Report return or loss' }), _jsx("p", { children: reportLoan.bookTitle }), reportType ? _jsxs(_Fragment, { children: [_jsxs("p", { children: ["Report this book as ", reportType === 'RETURNED' ? 'returned' : 'lost', "?"] }), _jsx("button", { type: "button", disabled: submitting, onClick: () => void submitReport(), children: submitting ? 'Submitting…' : 'Confirm report' }), _jsx("button", { type: "button", disabled: submitting, onClick: () => setReportType(null), children: "Back" })] }) : _jsxs(_Fragment, { children: [_jsx("button", { type: "button", onClick: () => setReportType('RETURNED'), children: "Returned" }), _jsx("button", { className: "danger-button", type: "button", onClick: () => setReportType('LOST'), children: "Lost" })] }), _jsx("button", { type: "button", disabled: submitting, onClick: cancelReport, children: "Cancel" })] }) })] }) }) })] }));
}
//# sourceMappingURL=MemberLoans.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { borrowApi } from '../api/borrow.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
export function MemberBorrow() {
    const { user, logout } = useAuth();
    const [capacity, setCapacity] = useState(null);
    const [capacityLoading, setCapacityLoading] = useState(true);
    const [capacityError, setCapacityError] = useState('');
    const [copyId, setCopyId] = useState('');
    const [copies, setCopies] = useState([]);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState('');
    const [confirmationOpen, setConfirmationOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [successfulLoans, setSuccessfulLoans] = useState([]);
    const [confirmationError, setConfirmationError] = useState('');
    useEffect(() => {
        let active = true;
        void borrowApi.capacity().then((result) => {
            if (active)
                setCapacity(result);
        }).catch(() => {
            if (active)
                setCapacityError('Could not load your borrowing capacity. Please try again.');
        }).finally(() => {
            if (active)
                setCapacityLoading(false);
        });
        return () => { active = false; };
    }, []);
    if (!user || user.accountType !== 'MEMBER')
        return null;
    const remainingCapacity = capacity?.remainingSlots ?? 0;
    const remainingStagingSlots = Math.max(0, remainingCapacity - copies.length);
    const addCopy = async (event) => {
        event.preventDefault();
        const requestedId = copyId.trim();
        if (!requestedId || adding || capacityLoading || capacityError || !capacity || remainingStagingSlots <= 0)
            return;
        if (copies.some((item) => item.copy.copyId === requestedId)) {
            setError('That copy is already in this transaction.');
            return;
        }
        setAdding(true);
        setError('');
        try {
            const result = await borrowApi.addCopy(requestedId);
            if (copies.some((item) => item.copy.copyId === result.copy.copyId)) {
                setError('That copy is already in this transaction.');
                return;
            }
            setCopies((current) => current.length >= remainingCapacity || current.some((item) => item.copy.copyId === result.copy.copyId)
                ? current
                : [...current, result]);
            setCopyId('');
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not add this copy. Please check its ID and availability.');
        }
        finally {
            setAdding(false);
        }
    };
    const removeCopy = (id) => {
        setCopies((current) => current.filter((item) => item.copy.copyId !== id));
        setError('');
    };
    const confirmBorrow = async () => {
        if (confirming || copies.length === 0)
            return;
        setConfirming(true);
        setConfirmationError('');
        setSuccessfulLoans([]);
        try {
            const result = await borrowApi.confirm(copies.map(({ copy }) => copy.copyId));
            setSuccessfulLoans(result.loans);
            setCopies([]);
            setCapacityLoading(true);
            setCapacityError('');
            void borrowApi.capacity().then(setCapacity).catch(() => {
                setCapacityError('Could not refresh your borrowing capacity. Please try again.');
            }).finally(() => setCapacityLoading(false));
            setConfirmationOpen(false);
        }
        catch (cause) {
            setConfirmationError(cause instanceof Error ? cause.message : 'Could not confirm these copies. Please try again.');
        }
        finally {
            setConfirming(false);
        }
    };
    const cancelConfirmation = () => {
        setConfirmationOpen(false);
        setConfirmationError('');
    };
    return (_jsxs("main", { className: "dashboard-page member-dashboard-page", children: [_jsx(MemberNavigation, { onLogout: logout }), _jsxs("section", { className: "member-borrow-content", "aria-labelledby": "borrow-heading", children: [_jsx("p", { className: "eyebrow", children: "MEMBER BORROWING" }), _jsx("h1", { id: "borrow-heading", children: "Borrow copies" }), capacityLoading && _jsx("p", { role: "status", children: "Loading your remaining loan slots\u2026" }), capacityError && _jsx("p", { className: "form-error", role: "alert", children: capacityError }), capacity && _jsxs("p", { className: "muted", children: ["You have ", capacity.openLoanCount, " open loans and can stage ", remainingCapacity, " more ", remainingCapacity === 1 ? 'copy' : 'copies', "."] }), _jsxs("form", { className: "member-borrow-form", onSubmit: (event) => void addCopy(event), children: [_jsxs("label", { className: "field", htmlFor: "borrow-copy-id", children: [_jsx("span", { children: "Copy ID" }), _jsx("input", { id: "borrow-copy-id", name: "copyId", value: copyId, onChange: (event) => setCopyId(event.target.value), autoComplete: "off" })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: capacityLoading || Boolean(capacityError) || !capacity || copies.length >= remainingCapacity || adding || !copyId.trim(), children: adding ? 'Checking copy…' : 'Add copy' })] }), error && _jsx("p", { className: "form-error", role: "alert", children: error }), capacityError && _jsx("button", { className: "text-button", type: "button", onClick: () => {
                            setCapacityLoading(true);
                            setCapacityError('');
                            void borrowApi.capacity().then(setCapacity).catch(() => setCapacityError('Could not load your borrowing capacity. Please try again.')).finally(() => setCapacityLoading(false));
                        }, children: "Try again" }), _jsxs("section", { className: "member-staged-copies", "aria-labelledby": "staged-copies-heading", children: [_jsx("h2", { id: "staged-copies-heading", children: "Copies in this transaction" }), copies.length === 0 ? _jsx("p", { className: "member-result-message", children: "No copies added yet. Adding a copy only stages it for review; it does not borrow or reserve it." }) : (_jsx("ul", { className: "member-copy-list", children: copies.map(item => (_jsxs("li", { children: [_jsxs("span", { children: [_jsx("strong", { children: item.book.title }), " \u00B7 Copy ", item.copy.copyId] }), _jsx("span", { children: Array.isArray(item.book.author) ? item.book.author.join(', ') : item.book.author }), _jsx("button", { className: "text-button danger-button", type: "button", onClick: () => removeCopy(item.copy.copyId), children: "Remove" })] }, item.copy.copyId))) }))] }), copies.length > 0 && _jsx("button", { className: "primary-button", type: "button", onClick: () => { setSuccessfulLoans([]); setConfirmationError(''); setConfirmationOpen(true); }, children: "Review and borrow" }), confirmationOpen && _jsx("div", { className: "member-borrow-dialog-backdrop", children: _jsxs("section", { className: "member-borrow-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "borrow-confirmation-heading", children: [_jsx("h2", { id: "borrow-confirmation-heading", children: "Confirm borrow" }), _jsx("p", { children: "Confirm the borrowing of these copies. They are not borrowed or reserved yet." }), _jsx("ul", { className: "member-copy-list", children: copies.map(item => _jsxs("li", { children: [_jsxs("span", { children: [_jsx("strong", { children: item.book.title }), " \u00B7 Copy ", item.copy.copyId] }), _jsx("span", { children: Array.isArray(item.book.author) ? item.book.author.join(', ') : item.book.author })] }, item.copy.copyId)) }), confirmationError && _jsx("p", { className: "form-error", role: "alert", children: confirmationError }), _jsxs("div", { className: "member-borrow-dialog-actions", children: [_jsx("button", { className: "text-button", type: "button", onClick: cancelConfirmation, disabled: confirming, children: "Cancel" }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void confirmBorrow(), disabled: confirming, children: confirming ? 'Borrowing…' : 'Confirm borrow' })] })] }) }), successfulLoans.length > 0 && _jsx("div", { className: "member-borrow-dialog-backdrop", children: _jsxs("section", { className: "member-borrow-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "borrow-success-heading", children: [_jsx("h2", { id: "borrow-success-heading", children: "Borrowing successful" }), _jsxs("p", { role: "status", children: [successfulLoans.length === 1 ? 'This copy was' : 'These copies were', " successfully borrowed:"] }), _jsx("ul", { className: "member-copy-list", children: successfulLoans.map((loan) => _jsxs("li", { children: ["Copy ", loan.copyId] }, loan.copyId)) }), _jsx("div", { className: "member-borrow-dialog-actions", children: _jsx("button", { className: "primary-button", type: "button", onClick: () => setSuccessfulLoans([]), children: "Close" }) })] }) })] })] }));
}
//# sourceMappingURL=MemberBorrow.js.map
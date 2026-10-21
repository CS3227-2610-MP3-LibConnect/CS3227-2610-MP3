import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '../api/errors.js';
import { assistantApi } from '../api/assistant.js';
import { useAuth } from '../auth/AuthContext.js';
const AssistantContext = createContext(null);
export function MemberAssistantProvider({ children }) {
    const { user } = useAuth();
    const memberKey = user?.accountType === 'MEMBER' ? `${user.userId}:${user.memberId ?? ''}` : null;
    const activeMemberKey = useRef(memberKey);
    activeMemberKey.current = memberKey;
    const [open, setOpen] = useState(false);
    const [ownerKey, setOwnerKey] = useState(memberKey);
    const [messages, setMessages] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (ownerKey !== memberKey) {
            setOwnerKey(memberKey);
            setMessages([]);
            setError('');
            setOpen(false);
            setLoading(false);
        }
    }, [memberKey, ownerKey]);
    const close = useCallback(() => setOpen(false), []);
    const openPanel = useCallback(() => setOpen(true), []);
    const contextValue = useMemo(() => ({ isOpen: open, open: openPanel, close }), [open, openPanel, close]);
    const visibleMessages = ownerKey === memberKey ? messages : [];
    return (_jsxs(AssistantContext.Provider, { value: contextValue, children: [children, memberKey && ownerKey === memberKey && open && (_jsx(AssistantChatPanel, { messages: visibleMessages, error: error, loading: loading, onClose: close, onClearError: () => setError(''), onSend: async (question) => {
                    const requestMemberKey = memberKey;
                    const history = visibleMessages.slice(-10).map(({ role, content }) => ({ role, content }));
                    setError('');
                    setMessages((current) => [...current, { id: Date.now(), role: 'user', content: question }].slice(-20));
                    setLoading(true);
                    try {
                        const response = await assistantApi.chat({ question, history });
                        if (activeMemberKey.current !== requestMemberKey)
                            return;
                        setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', content: response.answer }].slice(-20));
                    }
                    catch (cause) {
                        if (activeMemberKey.current !== requestMemberKey)
                            return;
                        setError(cause instanceof ApiClientError
                            ? cause.message
                            : 'Libby is temporarily unavailable. Please try again later.');
                    }
                    finally {
                        if (activeMemberKey.current === requestMemberKey)
                            setLoading(false);
                    }
                } }))] }));
}
export function useMemberAssistant() {
    const context = useContext(AssistantContext);
    if (!context)
        throw new Error('useMemberAssistant must be used inside MemberAssistantProvider.');
    return context;
}
function AssistantChatPanel({ messages, error, loading, onClose, onClearError, onSend, }) {
    const [question, setQuestion] = useState('');
    const submit = (event) => {
        event.preventDefault();
        const trimmed = question.trim();
        if (!trimmed || loading)
            return;
        setQuestion('');
        onClearError();
        void onSend(trimmed);
    };
    return (_jsxs("section", { className: "member-assistant-panel", "aria-label": "Libby assistant", children: [_jsxs("header", { className: "member-assistant-heading", children: [_jsx("h2", { children: "Libby" }), _jsx("button", { type: "button", "aria-label": "Close Libby", onClick: onClose, children: "Close" })] }), _jsxs("div", { className: "member-assistant-messages", "aria-live": "polite", children: [messages.map((message) => _jsx("p", { className: `member-assistant-message member-assistant-${message.role}`, children: message.content }, message.id)), loading && _jsx("p", { className: "member-assistant-status", role: "status", children: "Libby is thinking\u2026" }), error && _jsx("p", { className: "form-error member-assistant-error", role: "alert", children: error })] }), _jsxs("form", { className: "member-assistant-form", onSubmit: submit, children: [_jsx("label", { className: "sr-only", htmlFor: "member-assistant-question", children: "Message Libby" }), _jsx("textarea", { id: "member-assistant-question", value: question, maxLength: 2000, rows: 2, onChange: (event) => setQuestion(event.target.value), placeholder: "Ask a question" }), _jsx("button", { className: "primary-button", type: "submit", disabled: loading || !question.trim(), children: "Send" })] })] }));
}
//# sourceMappingURL=MemberAssistant.js.map
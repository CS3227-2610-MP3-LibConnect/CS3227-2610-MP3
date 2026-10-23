import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ApiClientError } from '../api/errors.js';
import { assistantApi, type AssistantTurn } from '../api/assistant.js';
import { useAuth } from '../auth/AuthContext.js';

interface ConversationMessage extends AssistantTurn {
  id: number;
}
interface AssistantContextValue {
  isOpen: boolean;
  open(): void;
  close(): void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function MemberAssistantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const memberKey = user?.accountType === 'MEMBER' ? `${user.userId}:${user.memberId ?? ''}` : null;
  const activeMemberKey = useRef(memberKey);
  activeMemberKey.current = memberKey;
  const [open, setOpen] = useState(false);
  const [ownerKey, setOwnerKey] = useState<string | null>(memberKey);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
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
  const contextValue = useMemo(
    () => ({ isOpen: open, open: openPanel, close }),
    [open, openPanel, close],
  );
  const visibleMessages = ownerKey === memberKey ? messages : [];

  return (
    <AssistantContext.Provider value={contextValue}>
      {children}
      {memberKey && ownerKey === memberKey && open && (
        <AssistantChatPanel
          messages={visibleMessages}
          error={error}
          loading={loading}
          onClose={close}
          onClearError={() => setError('')}
          onSend={async (question) => {
            const requestMemberKey = memberKey;
            const history = visibleMessages
              .slice(-10)
              .map(({ role, content }) => ({ role, content }));
            setError('');
            setMessages((current) =>
              [...current, { id: Date.now(), role: 'user', content: question }].slice(-20),
            );
            setLoading(true);
            try {
              const response = await assistantApi.chat({ question, history });
              if (activeMemberKey.current !== requestMemberKey) return;
              setMessages((current) =>
                [
                  ...current,
                  { id: Date.now() + 1, role: 'assistant', content: response.answer },
                ].slice(-20),
              );
            } catch (cause) {
              if (activeMemberKey.current !== requestMemberKey) return;
              setError(
                cause instanceof ApiClientError
                  ? cause.message
                  : 'Libby is temporarily unavailable. Please try again later.',
              );
            } finally {
              if (activeMemberKey.current === requestMemberKey) setLoading(false);
            }
          }}
        />
      )}
    </AssistantContext.Provider>
  );
}

export function useMemberAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) throw new Error('useMemberAssistant must be used inside MemberAssistantProvider.');
  return context;
}

function AssistantChatPanel({
  messages,
  error,
  loading,
  onClose,
  onClearError,
  onSend,
}: {
  messages: ConversationMessage[];
  error: string;
  loading: boolean;
  onClose(): void;
  onClearError(): void;
  onSend(question: string): Promise<void>;
}) {
  const [question, setQuestion] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const messageList = messagesRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [messages]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setQuestion('');
    onClearError();
    void onSend(trimmed);
  };

  return (
    <section className="member-assistant-panel" aria-label="Libby assistant">
      <header className="member-assistant-heading">
        <h2>Libby</h2>
        <button type="button" aria-label="Close Libby" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="member-assistant-messages" aria-live="polite" ref={messagesRef}>
        {messages.map((message) => (
          <p
            className={`member-assistant-message member-assistant-${message.role}`}
            key={message.id}
          >
            {message.role === 'assistant' ? renderAssistantText(message.content) : message.content}
          </p>
        ))}
        {loading && (
          <p className="member-assistant-status" role="status">
            Libby is thinking…
          </p>
        )}
        {error && (
          <p className="form-error member-assistant-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <form className="member-assistant-form" onSubmit={submit} ref={formRef}>
        <label className="sr-only" htmlFor="member-assistant-question">
          Message Libby
        </label>
        <textarea
          id="member-assistant-question"
          value={question}
          maxLength={2000}
          rows={2}
          aria-describedby="member-assistant-keyboard-hint"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return;
            event.preventDefault();
            if (!loading) formRef.current?.requestSubmit();
          }}
          placeholder="Ask a question"
        />
        <span className="sr-only" id="member-assistant-keyboard-hint">
          Press Enter to send. Press Shift and Enter to add a new line.
        </span>
        <button className="primary-button" type="submit" disabled={loading || !question.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

/** Render only the supported Markdown bold syntax; all other content stays inert text. */
function renderAssistantText(content: string) {
  return content.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) => {
    const bold = part.match(/^\*\*([^*\n]+)\*\*$/);
    return bold ? <strong key={index}>{bold[1]}</strong> : part;
  });
}

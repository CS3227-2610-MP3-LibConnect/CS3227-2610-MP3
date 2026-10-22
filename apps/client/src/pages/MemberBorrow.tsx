import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { borrowApi, type BorrowCapacity, type BorrowCopyDetails, type BorrowReceipt } from '../api/borrow.js';
import { MemberNavigation } from '../components/MemberNavigation.js';

export function MemberBorrow() {
  const { user, logout } = useAuth();
  const [capacity, setCapacity] = useState<BorrowCapacity | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(true);
  const [capacityError, setCapacityError] = useState('');
  const [copyId, setCopyId] = useState('');
  const [copies, setCopies] = useState<BorrowCopyDetails[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [successfulLoans, setSuccessfulLoans] = useState<BorrowReceipt[]>([]);
  const [confirmationError, setConfirmationError] = useState('');

  useEffect(() => {
    let active = true;
    void borrowApi.capacity().then((result) => {
      if (active) setCapacity(result);
    }).catch(() => {
      if (active) setCapacityError('Could not load your borrowing capacity. Please try again.');
    }).finally(() => {
      if (active) setCapacityLoading(false);
    });
    return () => { active = false; };
  }, []);

  if (!user || user.accountType !== 'MEMBER') return null;

  const remainingCapacity = capacity?.remainingSlots ?? 0;
  const remainingStagingSlots = Math.max(0, remainingCapacity - copies.length);

  const addCopy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedId = copyId.trim();
    if (!requestedId || adding || capacityLoading || capacityError || !capacity || remainingStagingSlots <= 0) return;
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this copy. Please check its ID and availability.');
    } finally {
      setAdding(false);
    }
  };

  const removeCopy = (id: string) => {
    setCopies((current) => current.filter((item) => item.copy.copyId !== id));
    setError('');
  };

  const confirmBorrow = async () => {
    if (confirming || copies.length === 0) return;
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
    } catch (cause) {
      setConfirmationError(cause instanceof Error ? cause.message : 'Could not confirm these copies. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const cancelConfirmation = () => {
    setConfirmationOpen(false);
    setConfirmationError('');
  };

  return (
    <main className="dashboard-page member-dashboard-page">
      <MemberNavigation onLogout={logout} />
      <section className="member-borrow-content" aria-labelledby="borrow-heading">
        <p className="eyebrow">MEMBER BORROWING</p>
        <h1 id="borrow-heading">Borrow copies</h1>
        {capacityLoading && <p role="status">Loading your remaining loan slots…</p>}
        {capacityError && <p className="form-error" role="alert">{capacityError}</p>}
        {capacity && <p className="muted">You have {capacity.openLoanCount} open loans and can stage {remainingCapacity} more {remainingCapacity === 1 ? 'copy' : 'copies'}.</p>}
        <form className="member-borrow-form" onSubmit={(event) => void addCopy(event)}>
          <label className="field" htmlFor="borrow-copy-id"><span>Copy ID</span>
            <input id="borrow-copy-id" name="copyId" value={copyId} onChange={(event) => setCopyId(event.target.value)} autoComplete="off" />
          </label>
          <button className="primary-button" type="submit" disabled={capacityLoading || Boolean(capacityError) || !capacity || copies.length >= remainingCapacity || adding || !copyId.trim()}>
            {adding ? 'Checking copy…' : 'Add copy'}
          </button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        {capacityError && <button className="text-button" type="button" onClick={() => {
          setCapacityLoading(true);
          setCapacityError('');
          void borrowApi.capacity().then(setCapacity).catch(() => setCapacityError('Could not load your borrowing capacity. Please try again.')).finally(() => setCapacityLoading(false));
        }}>Try again</button>}
        <section className="member-staged-copies" aria-labelledby="staged-copies-heading">
          <h2 id="staged-copies-heading">Copies in this transaction</h2>
          {copies.length === 0 ? <p className="member-result-message">No copies added yet. Adding a copy only stages it for review; it does not borrow or reserve it.</p> : (
            <ul className="member-copy-list">
              {copies.map(item => (
                <li key={item.copy.copyId}>
                  <span><strong>{item.book.title}</strong> · Copy {item.copy.copyId}</span>
                  <span>{Array.isArray(item.book.author) ? item.book.author.join(', ') : item.book.author}</span>
                  <button className="text-button danger-button" type="button" onClick={() => removeCopy(item.copy.copyId)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {copies.length > 0 && <button className="primary-button" type="button" onClick={() => { setSuccessfulLoans([]); setConfirmationError(''); setConfirmationOpen(true); }}>
          Review and borrow
        </button>}
        {confirmationOpen && <div className="member-borrow-dialog-backdrop">
          <section className="member-borrow-dialog" role="dialog" aria-modal="true" aria-labelledby="borrow-confirmation-heading">
            <h2 id="borrow-confirmation-heading">Confirm borrow</h2>
            <p>Confirm the borrowing of these copies. They are not borrowed or reserved yet.</p>
            <ul className="member-copy-list">
              {copies.map(item => <li key={item.copy.copyId}>
                <span><strong>{item.book.title}</strong> · Copy {item.copy.copyId}</span>
                <span>{Array.isArray(item.book.author) ? item.book.author.join(', ') : item.book.author}</span>
              </li>)}
            </ul>
            {confirmationError && <p className="form-error" role="alert">{confirmationError}</p>}
            <div className="member-borrow-dialog-actions">
              <button className="text-button" type="button" onClick={cancelConfirmation} disabled={confirming}>Cancel</button>
              <button className="primary-button" type="button" onClick={() => void confirmBorrow()} disabled={confirming}>
                {confirming ? 'Borrowing…' : 'Confirm borrow'}
              </button>
            </div>
          </section>
        </div>}
        {successfulLoans.length > 0 && <div className="member-borrow-dialog-backdrop">
          <section className="member-borrow-dialog" role="dialog" aria-modal="true" aria-labelledby="borrow-success-heading">
            <h2 id="borrow-success-heading">Borrowing successful</h2>
            <p role="status">{successfulLoans.length === 1 ? 'This copy was' : 'These copies were'} successfully borrowed:</p>
            <ul className="member-copy-list">
              {successfulLoans.map((loan) => <li key={loan.copyId}>Copy {loan.copyId}</li>)}
            </ul>
            <div className="member-borrow-dialog-actions">
              <button className="primary-button" type="button" onClick={() => setSuccessfulLoans([])}>Close</button>
            </div>
          </section>
        </div>}
      </section>
    </main>
  );
}

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { managerApi, type LibrarianAccount } from '../api/manager.js';
import { useAuth } from '../auth/AuthContext.js';
import { isSelfDeactivation, isSelfPasswordReset, nextAccountStatus, passwordResetDetails, readableAccountStatus, statusChangeDetails } from './manager-account-actions.js';

export function ManagerLibrarianAccountsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [librarians, setLibrarians] = useState<LibrarianAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<LibrarianAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetConfirmed, setResetConfirmed] = useState(false);

  const loadLibrarians = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await managerApi.listLibrarians();
      setLibrarians(result.librarians);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Librarian accounts could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadLibrarians(); }, [loadLibrarians]);

  async function changeStatus(target: LibrarianAccount) {
    const { nextStatus, confirmationMessage, successMessage } = statusChangeDetails(target);
    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) return;

    setPendingUserId(target.userId);
    setError(null);
    setSuccess(null);
    try {
      await managerApi.updateLibrarianStatus(target.userId, nextStatus);
      setSuccess(successMessage);
      if (isSelfDeactivation(target.userId, user?.userId, nextStatus)) {
        await logout().catch(() => undefined);
        navigate('/login', { replace: true });
        return;
      }
      await loadLibrarians();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'The account status could not be changed. Please try again.');
    } finally {
      setPendingUserId(null);
    }
  }

  function openReset(target: LibrarianAccount) {
    setResetTarget(target);
    setResetPassword('');
    setResetConfirmation('');
    setResetConfirmed(false);
    setError(null);
    setSuccess(null);
  }

  function closeReset() {
    if (pendingUserId !== null) return;
    setResetTarget(null);
    setResetPassword('');
    setResetConfirmation('');
    setResetConfirmed(false);
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    const details = passwordResetDetails(resetTarget.name);
    if (!resetConfirmed) {
      setError('Confirm that you understand the password reset before submitting.');
      setResetPassword('');
      setResetConfirmation('');
      return;
    }
    setPendingUserId(resetTarget.userId);
    setError(null);
    setSuccess(null);
    try {
      await managerApi.resetLibrarianPassword(resetTarget.userId, resetPassword, resetConfirmation);
      setResetTarget(null);
      setResetPassword('');
      setResetConfirmation('');
      setResetConfirmed(false);
      await loadLibrarians();
      setSuccess(details.successMessage);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'The password could not be reset. Please try again.');
      setResetPassword('');
      setResetConfirmation('');
      setResetConfirmed(false);
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="brand-lockup" to="/librarian/dashboard" aria-label="LibConnect home"><span className="brand-mark" aria-hidden="true">L</span><span>LibConnect</span></Link>
        <nav className="dashboard-actions" aria-label="Account actions">
          <Link className="text-button" to="/librarian/dashboard">Dashboard</Link>
          <button className="text-button" onClick={() => void logout()}>Sign out</button>
        </nav>
      </header>
      <section className="manager-panel" aria-labelledby="manager-title">
        <p className="eyebrow">MANAGER TOOLS</p>
        <h1 id="manager-title">Librarian accounts</h1>
        <p className="muted">Activate new librarians, deactivate accounts, or reset another librarian’s password.</p>
        {success && <p className="form-success" role="status">{success}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? <p className="muted" aria-live="polite">Loading librarian accounts…</p> : (
          <div className="account-table-wrap">
            <table className="account-table">
              <caption className="sr-only">Librarian accounts and statuses</caption>
              <thead><tr><th scope="col">Librarian</th><th scope="col">Employee ID</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {librarians.map((librarian) => {
                  const nextStatus = nextAccountStatus(librarian.accountStatus);
                  return (
                    <tr key={librarian.userId}>
                      <th scope="row"><span>{librarian.name}</span><small>{librarian.email}{librarian.isManager ? ' · Manager' : ''}</small></th>
                      <td>{librarian.employeeId}</td>
                      <td><span className={`status-pill status-${librarian.accountStatus.toLowerCase()}`}>{readableAccountStatus(librarian.accountStatus)}</span></td>
                      <td className="account-actions">
                        <button className="primary-button compact-button" disabled={pendingUserId !== null} onClick={() => void changeStatus(librarian)}>{pendingUserId === librarian.userId ? 'Saving…' : nextStatus === 'ACTIVE' ? 'Activate account' : 'Deactivate account'}</button>
                        {!isSelfPasswordReset(librarian.userId, user?.userId) && <>
                          <button className="text-button compact-button" type="button" disabled={pendingUserId !== null} onClick={() => openReset(librarian)}>Reset password</button>
                          <a className="text-button compact-button" href={managerApi.resetLibrarianPasswordFormUrl(librarian.userId)}>Open reset form</a>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {resetTarget && (() => {
          const details = passwordResetDetails(resetTarget.name);
          return <form className="reset-password-form" method="post" action={managerApi.resetLibrarianPasswordFormUrl(resetTarget.userId)} onSubmit={(event) => void submitReset(event)} aria-labelledby="reset-password-title">
            <h2 id="reset-password-title">{details.heading}</h2>
            <p className="muted" id="reset-password-help">{details.explanation}</p>
            <label className="field">New password<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} pattern="[^\s]+" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} aria-describedby="reset-password-help" /></label>
            <label className="field">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required maxLength={1024} value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} /></label>
            <label className="reset-confirmation"><input type="checkbox" checked={resetConfirmed} onChange={(event) => setResetConfirmed(event.target.checked)} disabled={pendingUserId !== null} />{details.confirmationLabel}</label>
            <div className="reset-form-actions"><button className="primary-button compact-button" type="submit" disabled={pendingUserId !== null}>{pendingUserId === resetTarget.userId ? 'Resetting…' : 'Confirm password reset'}</button><button className="text-button compact-button" type="button" onClick={closeReset} disabled={pendingUserId !== null}>Cancel</button></div>
          </form>;
        })()}
      </section>
    </main>
  );
}

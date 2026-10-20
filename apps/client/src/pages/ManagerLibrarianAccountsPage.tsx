import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { managerApi, type LibrarianAccount } from '../api/manager.js';
import { useAuth } from '../auth/AuthContext.js';
import { isSelfDeactivation, nextAccountStatus, readableAccountStatus, statusChangeDetails } from './manager-account-actions.js';

export function ManagerLibrarianAccountsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [librarians, setLibrarians] = useState<LibrarianAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

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
        <p className="muted">Activate new librarians and deactivate accounts that should no longer sign in.</p>
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
                      <td><button className="primary-button compact-button" disabled={pendingUserId !== null} onClick={() => void changeStatus(librarian)}>{pendingUserId === librarian.userId ? 'Saving…' : nextStatus === 'ACTIVE' ? 'Activate account' : 'Deactivate account'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

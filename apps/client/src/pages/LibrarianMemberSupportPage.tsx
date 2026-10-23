import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/base.js';
import { memberAccountsApi, type MemberAccount } from '../api/members.js';
import { useAuth } from '../auth/AuthContext.js';

function readableStatus(status: MemberAccount['accountStatus']): string {
  return status === 'ACTIVE' ? 'Active' : 'Inactive';
}

export function nextMemberStatus(
  status: MemberAccount['accountStatus'],
): MemberAccount['accountStatus'] {
  return status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

export function memberStatusChangeDetails(member: Pick<MemberAccount, 'name' | 'accountStatus'>) {
  const nextStatus = nextMemberStatus(member.accountStatus);
  const action = nextStatus === 'ACTIVE' ? 'activate' : 'deactivate';
  return {
    nextStatus,
    confirmationMessage: `Confirm that you want to ${action} ${member.name}'s member account? The account will become ${readableStatus(nextStatus)}.`,
    successMessage: `${member.name}'s account is now ${readableStatus(nextStatus)}.`,
  };
}

export function createMemberStatusSubmissionGuard() {
  let pendingUserId: string | null = null;
  return {
    acquire(userId: string): boolean {
      if (pendingUserId !== null) return false;
      pendingUserId = userId;
      return true;
    },
    release(userId: string): void {
      if (pendingUserId === userId) pendingUserId = null;
    },
  };
}

function displayError(caught: unknown, fallback: string): string {
  if (caught instanceof ApiClientError && caught.status === 409)
    return 'The member account changed before this request. Refresh and try again.';
  return caught instanceof ApiClientError ? caught.message : fallback;
}

function formatRegistrationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}

export function LibrarianMemberSupportPage() {
  const { logout } = useAuth();
  const [members, setMembers] = useState<MemberAccount[]>([]);
  const [statusFilter, setStatusFilter] = useState<MemberAccount['accountStatus'] | ''>('');
  const [currentCursor, setCurrentCursor] = useState<string | undefined>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const statusSubmissionGuard = useRef(createMemberStatusSubmissionGuard());

  const loadMembers = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await memberAccountsApi.list({
          status: statusFilter || undefined,
          limit: 20,
          cursor,
        });
        setMembers(result.items);
        setNextCursor(result.page.nextCursor);
        setCurrentCursor(cursor);
        setSelectedMember(null);
      } catch (caught) {
        setError(displayError(caught, 'Member accounts could not be loaded.'));
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function selectMember(userId: string) {
    setDetailLoading(true);
    setError(null);
    try {
      const result = await memberAccountsApi.get(userId);
      setSelectedMember(result.member);
    } catch (caught) {
      setError(displayError(caught, 'Member details could not be loaded.'));
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(member: MemberAccount) {
    const details = memberStatusChangeDetails(member);
    if (!statusSubmissionGuard.current.acquire(member.userId)) return;
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
    } catch (caught) {
      setError(
        displayError(
          caught,
          'The member account status could not be changed. Please refresh and try again.',
        ),
      );
    } finally {
      statusSubmissionGuard.current.release(member.userId);
      setPendingUserId(null);
    }
  }

  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadMembers();
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="brand-lockup" to="/librarian/dashboard" aria-label="LibConnect home">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>LibConnect</span>
        </Link>
        <nav className="dashboard-actions" aria-label="Member support navigation">
          <Link className="text-button" to="/librarian/dashboard">
            Dashboard
          </Link>
          <button className="text-button" onClick={() => void logout()}>
            Sign out
          </button>
        </nav>
      </header>
      <section className="catalog-panel" aria-labelledby="member-support-title">
        <p className="eyebrow">LIBRARIAN TOOLS</p>
        <h1 id="member-support-title">Member account support</h1>
        <p className="muted">
          View bounded member account details and activate or deactivate access when needed. Loans,
          reservations, fines, and notifications are preserved.
        </p>
        {success && (
          <p className="form-success" role="status">
            {success}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <form className="catalog-search" onSubmit={applyFilter} aria-label="Filter member accounts">
          <label className="field">
            Account status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as MemberAccount['accountStatus'] | '')
              }
            >
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          <button
            className="primary-button compact-button"
            type="submit"
            disabled={loading || pendingUserId !== null}
          >
            Apply filter
          </button>
          <button
            className="text-button compact-button"
            type="button"
            onClick={() => void loadMembers(currentCursor)}
            disabled={loading || pendingUserId !== null}
          >
            Refresh
          </button>
        </form>
        {loading ? (
          <p className="muted" aria-live="polite">
            Loading member accounts…
          </p>
        ) : members.length === 0 ? (
          <p className="empty-state">No member accounts match this filter.</p>
        ) : (
          <div className="account-table-wrap">
            <table className="account-table">
              <caption className="sr-only">Member accounts and statuses</caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Member ID</th>
                  <th scope="col">Registered</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const details = memberStatusChangeDetails(member);
                  return (
                    <tr key={member.userId}>
                      <th scope="row">
                        <span>{member.name}</span>
                        <small>{member.email}</small>
                      </th>
                      <td>{member.memberId}</td>
                      <td>{formatRegistrationDate(member.registrationDateTime)}</td>
                      <td>
                        <span
                          className={`status-pill status-${member.accountStatus.toLowerCase()}`}
                        >
                          {readableStatus(member.accountStatus)}
                        </span>
                      </td>
                      <td className="account-actions">
                        <button
                          className="text-button compact-button"
                          type="button"
                          onClick={() => void selectMember(member.userId)}
                          disabled={pendingUserId !== null || detailLoading}
                        >
                          View details
                        </button>
                        <button
                          className="primary-button compact-button"
                          type="button"
                          onClick={() => void changeStatus(member)}
                          disabled={pendingUserId !== null}
                        >
                          {pendingUserId === member.userId
                            ? 'Saving…'
                            : details.nextStatus === 'ACTIVE'
                              ? 'Activate account'
                              : 'Deactivate account'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {nextCursor && (
          <button
            className="text-button"
            type="button"
            onClick={() => void loadMembers(nextCursor)}
            disabled={loading || pendingUserId !== null}
          >
            Next member accounts
          </button>
        )}
        {detailLoading && (
          <p className="muted" aria-live="polite">
            Loading member details…
          </p>
        )}
        {selectedMember && (
          <section className="catalog-detail" aria-labelledby="member-detail-title">
            <h2 id="member-detail-title">{selectedMember.name}</h2>
            <dl className="book-metadata">
              <div>
                <dt>Member ID</dt>
                <dd>{selectedMember.memberId}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{selectedMember.email}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{readableStatus(selectedMember.accountStatus)}</dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>{formatRegistrationDate(selectedMember.registrationDateTime)}</dd>
              </div>
            </dl>
          </section>
        )}
      </section>
    </main>
  );
}

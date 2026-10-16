import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { useAuth, type AccountType } from '../auth/AuthContext.js';

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: { pathname?: string }; registrationSuccess?: AccountType } | null;
  const redirectTo = locationState?.from?.pathname ?? '/';
  const registrationSuccessMessage = locationState?.registrationSuccess === 'MEMBER'
    ? 'Your member account is ready. Sign in with your email and password.'
    : locationState?.registrationSuccess === 'LIBRARIAN'
      ? 'Registration received. A manager must activate your librarian account before you can sign in.'
      : '';
  const [accountType, setAccountType] = useState<AccountType>('MEMBER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login({ accountType, email, password });
      navigate(redirectTo, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 401
        ? 'Email or password is incorrect.'
        : cause instanceof Error ? cause.message : 'Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <Brand />
        <p className="eyebrow">WELCOME BACK</p>
        <h1 id="login-title">Sign in to LibConnect</h1>
        <p className="muted">Choose the account type you are signing in to.</p>
        {registrationSuccessMessage && <p className="form-success" role="status">{registrationSuccessMessage}</p>}
        <form onSubmit={onSubmit} className="auth-form">
          <fieldset className="account-choice">
            <legend>Account type</legend>
            <label className={accountType === 'MEMBER' ? 'choice selected' : 'choice'}>
              <input type="radio" name="accountType" value="MEMBER" checked={accountType === 'MEMBER'} onChange={() => setAccountType('MEMBER')} />
              <span>Member</span>
            </label>
            <label className={accountType === 'LIBRARIAN' ? 'choice selected' : 'choice'}>
              <input type="radio" name="accountType" value="LIBRARIAN" checked={accountType === 'LIBRARIAN'} onChange={() => setAccountType('LIBRARIAN')} />
              <span>Librarian</span>
            </label>
          </fieldset>
          <label className="field">
            <span>Email address</span>
            <input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="form-footer">New to LibConnect? <Link to="/register">Create an account</Link></p>
      </section>
    </main>
  );
}

export function Brand() {
  return <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">L</div><span>LibConnect</span></div>;
}

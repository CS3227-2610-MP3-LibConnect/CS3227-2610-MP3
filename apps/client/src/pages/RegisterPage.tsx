import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { useAuth, type AccountType } from '../auth/AuthContext.js';
import { Brand } from './LoginPage.js';

export function RegisterPage() {
  const { register, user } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>('MEMBER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    const input = accountType === 'LIBRARIAN'
      ? { accountType, name, email, password, employeeId }
      : { accountType, name, email, password };
    try {
      await register(input);
      setMessage(accountType === 'LIBRARIAN'
        ? 'Registration received. A manager must activate your librarian account before you can sign in.'
        : 'Your member account is ready. Sign in with your email and password.');
      setPassword('');
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : cause instanceof Error ? cause.message : 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-title">
        <Brand />
        <p className="eyebrow">GET STARTED</p>
        <h1 id="register-title">Create your account</h1>
        <p className="muted">Registration will not sign you in automatically.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="field">
            <span>Account type</span>
            <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)}>
              <option value="MEMBER">Member</option>
              <option value="LIBRARIAN">Librarian</option>
            </select>
          </label>
          <label className="field">
            <span>Full name</span>
            <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </label>
          <label className="field">
            <span>Email address</span>
            <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          {accountType === 'LIBRARIAN' && <label className="field">
            <span>Employee ID</span>
            <input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required maxLength={128} />
          </label>}
          <label className="field">
            <span>Password</span>
            <input autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="form-footer">Already registered? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}

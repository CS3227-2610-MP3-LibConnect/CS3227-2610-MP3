import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../api/errors.js';
import { useAuth, type AccountType } from '../auth/AuthContext.js';
import { Brand } from './LoginPage.js';

export function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>('MEMBER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    const passwordLength = Array.from(password).length;
    if (passwordLength < 8) {
      setFieldErrors({ password: 'Password must be at least 8 characters.' });
      return;
    }
    if (/\p{White_Space}/u.test(password)) {
      setFieldErrors({ password: 'Password must not contain whitespace.' });
      return;
    }
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Confirmation password must match the password.' });
      return;
    }

    setSubmitting(true);
    const input = accountType === 'LIBRARIAN'
      ? { accountType, name, email, password, confirmPassword, employeeId }
      : { accountType, name, email, password, confirmPassword };
    try {
      await register(input);
      setPassword('');
      setConfirmPassword('');
      navigate('/login', { replace: true, state: { registrationSuccess: accountType } });
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.fields && Object.keys(cause.fields).length > 0) {
        setFieldErrors(cause.fields);
      } else {
        setError(cause instanceof ApiClientError
          ? cause.message
          : 'Registration could not be completed. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      if (field === 'password') delete next.confirmPassword;
      return next;
    });
    setError('');
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
            <select value={accountType} onChange={(event) => { clearFieldError('accountType'); setAccountType(event.target.value as AccountType); }}>
              <option value="MEMBER">Member</option>
              <option value="LIBRARIAN">Librarian</option>
            </select>
            {fieldErrors.accountType && <span className="form-error" role="alert">{fieldErrors.accountType}</span>}
          </label>
          <label className="field">
            <span>Full name</span>
            <input autoComplete="name" value={name} onChange={(event) => { clearFieldError('name'); setName(event.target.value); }} required maxLength={120} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'register-name-error' : undefined} />
            {fieldErrors.name && <span id="register-name-error" className="form-error" role="alert">{fieldErrors.name}</span>}
          </label>
          <label className="field">
            <span>Email address</span>
            <input autoComplete="email" type="email" value={email} onChange={(event) => { clearFieldError('email'); setEmail(event.target.value); }} required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'register-email-error' : undefined} />
            {fieldErrors.email && <span id="register-email-error" className="form-error" role="alert">{fieldErrors.email}</span>}
          </label>
          {accountType === 'LIBRARIAN' && <label className="field">
            <span>Employee ID</span>
            <input value={employeeId} onChange={(event) => { clearFieldError('employeeId'); setEmployeeId(event.target.value); }} required maxLength={128} aria-invalid={Boolean(fieldErrors.employeeId)} aria-describedby={fieldErrors.employeeId ? 'register-employee-id-error' : undefined} />
            {fieldErrors.employeeId && <span id="register-employee-id-error" className="form-error" role="alert">{fieldErrors.employeeId}</span>}
          </label>}
          <label className="field">
            <span>Password</span>
            <input autoComplete="new-password" type="password" value={password} onChange={(event) => { clearFieldError('password'); setPassword(event.target.value); }} required minLength={8} maxLength={1024} pattern="[^\s]+" title="Password must not contain whitespace." aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'register-password-error' : undefined} />
            {fieldErrors.password && <span id="register-password-error" className="form-error" role="alert">{fieldErrors.password}</span>}
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => { clearFieldError('confirmPassword'); setConfirmPassword(event.target.value); }} required maxLength={1024} aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-password-error' : undefined} />
            {fieldErrors.confirmPassword && <span id="register-confirm-password-error" className="form-error" role="alert">{fieldErrors.confirmPassword}</span>}
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="form-footer">Already registered? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}

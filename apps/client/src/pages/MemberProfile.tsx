import { useEffect, useState, type FormEvent } from 'react';
import { memberProfileApi } from '../api/member-profile.js';
import { useAuth } from '../auth/AuthContext.js';
import { MemberNavigation } from '../components/MemberNavigation.js';
import { MemberProfileHub } from '../components/MemberProfileHub.js';

function validEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed);
}

function validPassword(value: string): boolean {
  return Array.from(value).length >= 8 && !/\p{White_Space}/u.test(value);
}

export function MemberProfile() {
  const { user, logout, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState<{
    name: { kind: 'success' | 'error'; message: string } | null;
    email: { kind: 'success' | 'error'; message: string } | null;
    password: { kind: 'success' | 'error'; message: string } | null;
  }>({ name: null, email: null, password: null });
  const [loading, setLoading] = useState(false);

  const setSectionFeedback = (
    section: keyof typeof feedback,
    value: { kind: 'success' | 'error'; message: string } | null,
  ) => {
    setFeedback((current) => ({ ...current, [section]: value }));
  };

  useEffect(() => {
    let active = true;
    void memberProfileApi
      .get()
      .then(({ user: profile }) => {
        if (!active) return;
        setName(profile.name);
        setEmail(profile.email);
        updateUser(profile);
      })
      .catch((cause: unknown) => {
        if (active)
          setSectionFeedback('name', {
            kind: 'error',
            message: cause instanceof Error ? cause.message : 'Could not load your profile.',
          });
      });
    return () => {
      active = false;
    };
  }, [updateUser]);

  if (!user || user.accountType !== 'MEMBER') return null;

  const submitName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    if (!name.trim()) {
      setSectionFeedback('name', { kind: 'error', message: 'Enter your name.' });
      return;
    }
    setLoading(true);
    setSectionFeedback('name', null);
    try {
      const result = await memberProfileApi.updateName(name);
      setName(result.user.name);
      setEmail(result.user.email);
      updateUser(result.user);
      setSectionFeedback('name', { kind: 'success', message: 'Your name was updated.' });
    } catch (cause) {
      setSectionFeedback('name', {
        kind: 'error',
        message:
          cause instanceof Error ? cause.message : 'Could not update your name. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    if (!validEmail(email)) {
      setSectionFeedback('email', { kind: 'error', message: 'Enter a valid email address.' });
      return;
    }
    setLoading(true);
    setSectionFeedback('email', null);
    try {
      const result = await memberProfileApi.updateEmail(email);
      setName(result.user.name);
      setEmail(result.user.email);
      updateUser(result.user);
      setSectionFeedback('email', { kind: 'success', message: 'Your email address was updated.' });
    } catch (cause) {
      setSectionFeedback('email', {
        kind: 'error',
        message:
          cause instanceof Error ? cause.message : 'Could not update your email. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    if (!validPassword(newPassword)) {
      setSectionFeedback('password', {
        kind: 'error',
        message: 'Use at least 8 characters and do not include whitespace.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSectionFeedback('password', {
        kind: 'error',
        message: 'The new password and confirmation do not match.',
      });
      return;
    }
    setLoading(true);
    setSectionFeedback('password', null);
    try {
      await memberProfileApi.changePassword({ currentPassword, newPassword, confirmPassword });
      setSectionFeedback('password', { kind: 'success', message: 'Your password was changed.' });
    } catch (cause) {
      setSectionFeedback('password', {
        kind: 'error',
        message:
          cause instanceof Error
            ? cause.message
            : 'Could not change your password. Please try again.',
      });
    } finally {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    }
  };

  return (
    <main className="dashboard-page member-dashboard-page">
      <MemberNavigation onLogout={logout} />
      <section className="member-profile-content" aria-labelledby="profile-heading">
        <MemberProfileHub>
          <p className="eyebrow">MEMBER ACCOUNT</p>
          <h1 id="profile-heading">Profile</h1>
          <div className="member-profile-panels">
            <section className="member-profile-panel" aria-labelledby="profile-details-heading">
              <h2 id="profile-details-heading">Profile details</h2>
              <p className="muted">Your current account details are shown below.</p>
              {feedback.name && (
                <p
                  className={feedback.name.kind === 'success' ? 'form-success' : 'form-error'}
                  role={feedback.name.kind === 'success' ? 'status' : 'alert'}
                >
                  {feedback.name.message}
                </p>
              )}
              <form className="member-profile-form" onSubmit={(event) => void submitName(event)}>
                <label className="field" htmlFor="profile-name">
                  <span>Name</span>
                  <input
                    id="profile-name"
                    name="name"
                    value={name}
                    maxLength={120}
                    autoComplete="name"
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <p className="member-profile-current-value">
                  Email: <span>{user.email}</span>
                </p>
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? 'Saving…' : 'Save name'}
                </button>
              </form>
            </section>
            <section className="member-profile-panel" aria-labelledby="profile-email-heading">
              <h2 id="profile-email-heading">Email</h2>
              <p className="muted">Your email address is used to sign in.</p>
              {feedback.email && (
                <p
                  className={feedback.email.kind === 'success' ? 'form-success' : 'form-error'}
                  role={feedback.email.kind === 'success' ? 'status' : 'alert'}
                >
                  {feedback.email.message}
                </p>
              )}
              <form className="member-profile-form" onSubmit={(event) => void submitEmail(event)}>
                <label className="field" htmlFor="profile-email">
                  <span>Email address</span>
                  <input
                    id="profile-email"
                    name="email"
                    type="email"
                    value={email}
                    autoComplete="email"
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? 'Saving…' : 'Save email'}
                </button>
              </form>
            </section>
            <section className="member-profile-panel" aria-labelledby="profile-password-heading">
              <h2 id="profile-password-heading">Password</h2>
              <p className="muted">
                Choose a password with at least 8 characters and no whitespace.
              </p>
              {feedback.password && (
                <p
                  className={feedback.password.kind === 'success' ? 'form-success' : 'form-error'}
                  role={feedback.password.kind === 'success' ? 'status' : 'alert'}
                >
                  {feedback.password.message}
                </p>
              )}
              <form
                className="member-profile-form"
                onSubmit={(event) => void submitPassword(event)}
              >
                <label className="field" htmlFor="profile-current-password">
                  <span>Current password</span>
                  <input
                    id="profile-current-password"
                    name="currentPassword"
                    type="password"
                    value={currentPassword}
                    autoComplete="current-password"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="profile-new-password">
                  <span>New password</span>
                  <input
                    id="profile-new-password"
                    name="newPassword"
                    type="password"
                    value={newPassword}
                    autoComplete="new-password"
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="profile-confirm-password">
                  <span>Confirm new password</span>
                  <input
                    id="profile-confirm-password"
                    name="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    autoComplete="new-password"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? 'Changing…' : 'Change password'}
                </button>
              </form>
            </section>
          </div>
        </MemberProfileHub>
      </section>
    </main>
  );
}

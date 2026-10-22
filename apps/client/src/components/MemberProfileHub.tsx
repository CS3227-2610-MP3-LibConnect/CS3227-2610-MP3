import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { MemberNavigation } from './MemberNavigation.js';

const sections = [
  { label: 'Profile', path: '/member/profile' },
  { label: 'My Loans', path: '/member/profile/loans' },
  { label: 'My Reservations', path: '/member/profile/reservations' },
  { label: 'My Fines', path: '/member/profile/fines' },
] as const;

export function MemberProfileHub({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const currentPath = pathname === '/member/profile' ? pathname : pathname.replace(/\/$/u, '');

  return (
    <div className="member-profile-hub">
      <nav className="member-profile-subnav" aria-label="Member profile sections">
        {sections.map(({ label, path }) => (
          <Link key={path} to={path} className={currentPath === path ? 'member-profile-subnav-current' : undefined} aria-current={currentPath === path ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="member-profile-hub-content">{children}</div>
    </div>
  );
}

export function MemberProfilePlaceholder({ title }: { title: string }) {
  const { logout } = useAuth();

  return (
    <main className="dashboard-page member-dashboard-page">
      <MemberNavigation onLogout={logout} />
      <section className="member-profile-content">
        <MemberProfileHub>
          <div className="member-profile-placeholder">
            <p className="eyebrow">MEMBER ACCOUNT</p>
            <h1 id="profile-section-heading">{title}</h1>
            <p className="muted">This section is not available yet.</p>
          </div>
        </MemberProfileHub>
      </section>
    </main>
  );
}

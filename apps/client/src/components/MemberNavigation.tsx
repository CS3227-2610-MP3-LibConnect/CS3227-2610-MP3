import type { MouseEvent } from 'react';
import { useHref, useNavigate } from 'react-router-dom';

interface MemberNavigationProps {
  onLogout: () => void | Promise<void>;
}

export function MemberNavigation({ onLogout }: MemberNavigationProps) {
  const navigate = useNavigate();
  const dashboardHref = useHref('/member/dashboard');
  const navigateToDashboard = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate('/member/dashboard');
  };

  return (
    <header className="member-header">
      <a href={dashboardHref} className="brand-lockup member-brand" aria-label="LibConnect home" onClick={navigateToDashboard}>
        <span className="brand-mark" aria-hidden="true">L</span>
        <span>LibConnect</span>
      </a>
      <nav className="member-navigation" aria-label="Member main navigation">
        <a
          href={dashboardHref}
          className="member-navigation-current"
          aria-current="page"
          aria-disabled="true"
          tabIndex={-1}
          onClick={(event) => event.preventDefault()}
        >
          Dashboard
        </a>
        <div className="member-account-actions">
          <button aria-label="Profile" className="member-profile-button" type="button" disabled>
            Profile
          </button>
          <button className="member-logout-button" type="button" onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </nav>
    </header>
  );
}

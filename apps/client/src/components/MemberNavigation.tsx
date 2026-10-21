import type { MouseEvent } from 'react';
import { useHref, useLocation, useNavigate } from 'react-router-dom';

interface MemberNavigationProps {
  onLogout: () => void | Promise<void>;
}

export function MemberNavigation({ onLogout }: MemberNavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
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
        <a href={dashboardHref} className={location.pathname === '/member/dashboard' ? 'member-navigation-current' : undefined} aria-current={location.pathname === '/member/dashboard' ? 'page' : undefined} onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          navigate('/member/dashboard');
        }}>
          Dashboard
        </a>
        <a href="/member/borrow" className={location.pathname === '/member/borrow' ? 'member-navigation-current' : undefined} aria-current={location.pathname === '/member/borrow' ? 'page' : undefined} onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          navigate('/member/borrow');
        }}>Borrow</a>
        <div className="member-account-actions">
          <a href="/member/profile" aria-label="Profile" className={location.pathname === '/member/profile' ? 'member-profile-button member-navigation-current' : 'member-profile-button'} aria-current={location.pathname === '/member/profile' ? 'page' : undefined} onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigate('/member/profile');
          }}>
            Profile
          </a>
          <button className="member-logout-button danger-button" type="button" onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </nav>
    </header>
  );
}

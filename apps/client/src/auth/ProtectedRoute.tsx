import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type AccountType } from './AuthContext.js';
import { dashboardPathFor } from './dashboard-routing.js';

export function ProtectedRoute({
  children,
  accountType,
  managerOnly = false,
}: {
  children: React.ReactNode;
  accountType?: AccountType;
  managerOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="page-center" aria-live="polite">
        Checking your session…
      </main>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (accountType && user.accountType !== accountType) {
    return <Navigate to={dashboardPathFor(user.accountType)} replace />;
  }
  if (managerOnly && user.isManager !== true) {
    return <Navigate to={dashboardPathFor(user.accountType)} replace />;
  }
  return children;
}

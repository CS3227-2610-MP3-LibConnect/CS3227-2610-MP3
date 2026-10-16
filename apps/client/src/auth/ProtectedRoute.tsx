import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.js';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <main className="page-center" aria-live="polite">Checking your session…</main>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

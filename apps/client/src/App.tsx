import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';
import { dashboardPathFor } from './auth/dashboard-routing.js';
import { LoginPage } from './pages/LoginPage.js';
import { MemberDashboard } from './pages/MemberDashboard.js';
import { MemberBookDetail } from './pages/MemberBookDetail.js';
import { MemberBorrow } from './pages/MemberBorrow.js';
import { MemberProfile } from './pages/MemberProfile.js';
import { MemberLoans } from './pages/MemberLoans.js';
import { MemberFines } from './pages/MemberFines.js';
import { MemberReservations } from './pages/MemberReservations.js';
import { MemberProfilePlaceholder } from './components/MemberProfileHub.js';
import { RegisterPage } from './pages/RegisterPage.js';

function DashboardPage() {
  const { user, logout } = useAuth();
  if (!user) return null;
  if (user.accountType === 'MEMBER') {
    return <MemberDashboard />;
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <a className="brand-lockup" href="/" aria-label="LibConnect home"><span className="brand-mark" aria-hidden="true">L</span><span>LibConnect</span></a>
        <button className="text-button" onClick={() => void logout()}>Sign out</button>
      </header>
      <section className="welcome-panel">
        <p className="eyebrow">YOUR LIBRARY, CONNECTED</p>
        <h1>Welcome, {user.name}</h1>
        <p className="muted">You are signed in as a {user.accountType === 'MEMBER' ? 'member' : 'librarian'}.</p>
        <div className="account-chip">{user.accountType}</div>
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />
      <Route path="/member/dashboard" element={<ProtectedRoute accountType="MEMBER"><DashboardPage /></ProtectedRoute>} />
      <Route path="/member/books/:isbn" element={<ProtectedRoute accountType="MEMBER"><MemberBookDetail /></ProtectedRoute>} />
      <Route path="/member/borrow" element={<ProtectedRoute accountType="MEMBER"><MemberBorrow /></ProtectedRoute>} />
      <Route path="/member/profile" element={<ProtectedRoute accountType="MEMBER"><MemberProfile /></ProtectedRoute>} />
      <Route path="/member/profile/loans" element={<ProtectedRoute accountType="MEMBER"><MemberLoans /></ProtectedRoute>} />
      <Route path="/member/profile/reservations" element={<ProtectedRoute accountType="MEMBER"><MemberReservations /></ProtectedRoute>} />
      <Route path="/member/profile/fines" element={<ProtectedRoute accountType="MEMBER"><MemberFines /></ProtectedRoute>} />
      <Route path="/librarian/dashboard" element={<ProtectedRoute accountType="LIBRARIAN"><DashboardPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return null;
  return <Navigate to={dashboardPathFor(user.accountType)} replace />;
}

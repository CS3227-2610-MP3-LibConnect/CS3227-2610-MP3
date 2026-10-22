import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';
import { dashboardPathFor } from './auth/dashboard-routing.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ManagerLibrarianAccountsPage } from './pages/ManagerLibrarianAccountsPage.js';
import { LibrarianCatalogInventoryPage } from './pages/LibrarianCatalogInventoryPage.js';
import { LibrarianCirculationPage } from './pages/LibrarianCirculationPage.js';
import { LibrarianReservationsFinesPage } from './pages/LibrarianReservationsFinesPage.js';
import { LibrarianMemberSupportPage } from './pages/LibrarianMemberSupportPage.js';
import { LibrarianAssistantPage } from './pages/LibrarianAssistantPage.js';

function DashboardPage() {
  const { user, logout } = useAuth();
  if (!user) return null;
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
        {user.accountType === 'LIBRARIAN' && <p><Link className="text-button" to="/librarian/catalog">Catalog &amp; inventory</Link> <Link className="text-button" to="/librarian/circulation">Loans &amp; reviews</Link> <Link className="text-button" to="/librarian/reservations-fines">Reservations &amp; fines</Link> <Link className="text-button" to="/librarian/members">Member accounts</Link> <Link className="text-button" to="/librarian/assistant">Review assistant</Link>{user.isManager === true && <> <Link className="text-button" to="/librarian/manager/accounts">Manage librarian accounts</Link></>}</p>}
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
      <Route path="/librarian/dashboard" element={<ProtectedRoute accountType="LIBRARIAN"><DashboardPage /></ProtectedRoute>} />
      <Route path="/librarian/catalog" element={<ProtectedRoute accountType="LIBRARIAN"><LibrarianCatalogInventoryPage /></ProtectedRoute>} />
      <Route path="/librarian/circulation" element={<ProtectedRoute accountType="LIBRARIAN"><LibrarianCirculationPage /></ProtectedRoute>} />
      <Route path="/librarian/reservations-fines" element={<ProtectedRoute accountType="LIBRARIAN"><LibrarianReservationsFinesPage /></ProtectedRoute>} />
      <Route path="/librarian/members" element={<ProtectedRoute accountType="LIBRARIAN"><LibrarianMemberSupportPage /></ProtectedRoute>} />
      <Route path="/librarian/assistant" element={<ProtectedRoute accountType="LIBRARIAN"><LibrarianAssistantPage /></ProtectedRoute>} />
      <Route path="/librarian/manager/accounts" element={<ProtectedRoute accountType="LIBRARIAN" managerOnly><ManagerLibrarianAccountsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return null;
  return <Navigate to={dashboardPathFor(user.accountType)} replace />;
}

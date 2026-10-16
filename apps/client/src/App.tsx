import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';

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
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

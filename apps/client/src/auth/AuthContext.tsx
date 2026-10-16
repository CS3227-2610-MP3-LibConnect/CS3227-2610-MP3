import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../api/base.js';

export type AccountType = 'MEMBER' | 'LIBRARIAN';

export interface AuthUser {
  userId: string;
  name: string;
  email: string;
  accountType: AccountType;
  accountStatus: 'ACTIVE' | 'INACTIVE';
  memberId?: string;
  employeeId?: string;
  isManager?: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login(input: { accountType: AccountType; email: string; password: string }): Promise<AuthUser>;
  register(input: Record<string, string>): Promise<AuthUser>;
  logout(): Promise<void>;
}

interface SessionResponse {
  authenticated: boolean;
  user?: AuthUser;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<SessionResponse>('/auth/session');
      setUser(result.authenticated ? result.user ?? null : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const handleUnauthorized = () => setUser(null);
    window.addEventListener('libconnect:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('libconnect:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(async (input: { accountType: AccountType; email: string; password: string }) => {
    const result = await apiRequest<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (input: Record<string, string>) => {
    const result = await apiRequest<{ user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

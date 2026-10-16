import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/base.js';
export const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await apiRequest('/auth/session');
            setUser(result.authenticated ? result.user ?? null : null);
        }
        catch {
            setUser(null);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => {
        const handleUnauthorized = () => setUser(null);
        window.addEventListener('libconnect:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('libconnect:unauthorized', handleUnauthorized);
    }, []);
    const login = useCallback(async (input) => {
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(input),
        });
        setUser(result.user);
    }, []);
    const register = useCallback(async (input) => {
        const result = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(input),
        });
        return result.user;
    }, []);
    const logout = useCallback(async () => {
        try {
            await apiRequest('/auth/logout', { method: 'POST' });
        }
        finally {
            setUser(null);
        }
    }, []);
    const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context)
        throw new Error('useAuth must be used inside AuthProvider.');
    return context;
}
//# sourceMappingURL=AuthContext.js.map
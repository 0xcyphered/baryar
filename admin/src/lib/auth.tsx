import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { apiGet, apiPost, setToken, clearToken, getToken } from './api';

interface PublicUser {
  id: string;
  phone: string;
  name: string;
  email: string;
  nationalId: string;
  roles: string[];
  status: string;
  phoneVerifiedAt: string | null;
}

interface AuthState {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setLoading(false);
      return;
    }
    setToken(t);
    apiGet<{ user: PublicUser }>('/api/auth/me')
      .then(({ user: u }) => {
        setUser(u);
        setTokenState(t);
      })
      .catch(() => {
        clearToken();
        setTokenState(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (phone: string, code: string) => {
    const { token: t, user: u } = await apiPost<{ token: string; user: PublicUser }>(
      '/api/auth/verify-otp',
      { phone, code },
    );
    setToken(t);
    setTokenState(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export type { PublicUser };

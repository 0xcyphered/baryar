import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { UserProfile } from '../types';
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken as storeToken,
} from '../services/apiClient';
import { getMe, requestOtp, updateMe, verifyOtp as apiVerifyOtp } from '../services/authApi';

const USER_KEY = 'auth_user';
const USER_KEY_EXP = 'auth_user_exp';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  /** Request an OTP code for the given phone. */
  signIn: (phone: string) => Promise<void>;
  /** Verify the OTP and log in. */
  verifyOtp: (phone: string, code: string) => Promise<void>;
  /** Log out: clear stored token + user, reset state. */
  signOut: () => Promise<void>;
  /** PATCH /api/auth/me and refresh cached user. */
  updateProfile: (fields: { name?: string; email?: string; nationalId?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: read stored token + user, validate with /me in background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedToken = await getAuthToken();
        if (!storedToken || cancelled) {
          if (!cancelled) setIsLoading(false);
          return;
        }

        setToken(storedToken);

        // Try cached user first for instant render.
        const cachedUserJson = await SecureStore.getItemAsync(USER_KEY);
        if (cachedUserJson && !cancelled) {
          setUser(JSON.parse(cachedUserJson));
          setIsLoading(false);
        }

        // Validate with backend.
        const freshUser = await getMe();
        if (cancelled) return;

        if (freshUser) {
          setUser(freshUser);
          await SecureStore.setItemAsync(USER_KEY, JSON.stringify(freshUser));
          await SecureStore.setItemAsync(USER_KEY_EXP, Date.now().toString());
        } else {
          // Token invalid — clear everything.
          setUser(null);
          setToken(null);
          await clearAuthToken();
          await SecureStore.deleteItemAsync(USER_KEY);
        }
      } catch {
        // Network error on cold start — keep cached state if any,
        // don't force logout on flaky connection.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (phone: string) => {
    await requestOtp(phone);
  }, []);

  const verifyOtpFn = useCallback(async (phone: string, code: string) => {
    const { token: newToken, user: newUser } = await apiVerifyOtp(phone, code);
    setToken(newToken);
    setUser(newUser);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(newUser));
    await SecureStore.setItemAsync(USER_KEY_EXP, Date.now().toString());
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setToken(null);
    await clearAuthToken();
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(USER_KEY_EXP);
  }, []);

  const updateProfileFn = useCallback(async (fields: { name?: string; email?: string; nationalId?: string }) => {
    const updated = await updateMe(fields);
    setUser(updated);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updated));
    await SecureStore.setItemAsync(USER_KEY_EXP, Date.now().toString());
  }, []);

  const value: AuthState = {
    user,
    token,
    isLoading,
    signIn,
    verifyOtp: verifyOtpFn,
    signOut,
    updateProfile: updateProfileFn,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

# Plan 023: Mobile auth + API client (OTP screens, secure token storage, auth state)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e540072..HEAD -- mobile/App.tsx mobile/package.json mobile/src/types.ts mobile/src/theme.ts mobile/tsconfig.json mobile/app.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/014-phone-otp-auth.md (DONE — backend auth API exists)
- **Category**: direction
- **Planned at**: commit `e540072`, 2026-09-04

## Why this matters

The mobile Expo app (`mobile/`) is a single-screen map demo with no auth,
no API client, and no token storage. Backend auth endpoints exist at
`/api/auth/request-otp`, `/api/auth/verify-otp`, and `/api/auth/me`
(014 DONE), but no mobile surface calls them. The cargo-owner flow (024)
and driver flow (025) both need a logged-in user with a stored JWT before
they can hit any cargo or driver API. This plan adds the auth plumbing:
OTP request → verify → JWT storage → authenticated API client → logout.

## Current state

Repo layout at plan time (`e540072` on `main`):

```
mapapp/
  backend/src/routes/auth.js    ← request-otp, verify-otp, GET /me
  backend/src/middleware/auth.js ← Bearer JWT → req.user
  backend/src/services/otpService.js ← requestOtp, verifyOtp
  mobile/
    App.tsx                     ← single-screen map (no navigation, no auth)
    index.ts                    ← registerRootComponent(App)
    package.json                ← Expo 57, React Native 0.86.3, no nav, no secure-store
    src/
      types.ts                  ← Waypoint, SearchResult, SegmentDistance, MapMode
      theme.ts                  ← COLORS, TEHRAN
      components/               ← MapCanvas, SearchBar, WaypointsSheet
      hooks/useUserLocation.ts
      utils/                    ← distance, geocoding, haptics, persian, routing
```

`mobile/App.tsx` today — the entire app entry (350 lines). Key excerpt:
```tsx
import { StatusBar } from 'expo-status-bar';
import {
  Vazirmatn_400Regular,
  Vazirmatn_500Medium,
  Vazirmatn_700Bold,
  useFonts,
} from '@expo-google-fonts/vazirmatn';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type BottomSheet from '@gorhom/bottom-sheet';
import { hapticLight, hapticMedium, hapticWarning } from './src/utils/haptics';
import type { MapMode, SegmentDistance, Waypoint } from './src/types';
import { computeSegments, totalRoutedDistance, totalStraightDistance } from './src/utils/distance';
import { formatDistance, toPersianNumber } from './src/utils/persian';
import { LOCATION_UNAVAILABLE_MESSAGE, useUserLocation } from './src/hooks/useUserLocation';
import MapCanvas, { type MapCanvasHandle } from './src/components/MapCanvas';
import SearchBar from './src/components/SearchBar';
import WaypointsSheet from './src/components/WaypointsSheet';
import { COLORS } from './src/theme';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

let waypointCounter = 0;

function AppRoot() {
  // ... map logic (waypoints, segments, mode, location) ...
  return (
    <View style={styles.container}>
      <MapCanvas ... />
      <SearchBar ... />
      {/* mode chips, toast, FABs, waypoints bottom sheet */}
      <WaypointsSheet ... />
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Vazirmatn_400Regular, Vazirmatn_500Medium, Vazirmatn_700Bold });
  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppRoot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

`mobile/package.json` dependencies today: `@expo-google-fonts/vazirmatn`,
`@expo/vector-icons`, `@gorhom/bottom-sheet`, `@maplibre/maplibre-react-native`,
`@turf/distance`, `@turf/helpers`, `expo`, `expo-dev-client`, `expo-font`,
`expo-haptics`, `expo-location`, `expo-status-bar`, `maplibre-gl`, `react`,
`react-dom`, `react-native`, `react-native-gesture-handler`,
`react-native-reanimated`, `react-native-safe-area-context`, `react-native-web`.
**No** `expo-secure-store`, `@react-navigation/native`, `@react-navigation/native-stack`,
`react-native-screens`, or `react-native-pager-view`.

`mobile/src/theme.ts`:
```ts
export const COLORS = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  gray: '#9ca3af',
  grayLight: '#f1f5f9',
  bg: '#e8e4e0',
  white: '#ffffff',
  textDark: '#1f2937',
  textMid: '#4b5563',
} as const;

export const TEHRAN: [number, number] = [51.389, 35.6892];
```

`mobile/tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true }
}
```

Backend auth API contract (from 014 — `backend/src/routes/auth.js`):

```
POST /api/auth/request-otp   { phone: string }     → 200 { ok: true }
POST /api/auth/verify-otp    { phone, code: string } → 200 { token, user }
GET  /api/auth/me            Authorization: Bearer  → 200 { user }
```

`publicUser` shape from auth routes:
```json
{
  "id": "<ObjectId>",
  "phone": "+989...",
  "name": "",
  "email": "",
  "roles": ["cargo_owner"],
  "status": "active",
  "phoneVerifiedAt": "<ISO>"
}
```

V6 bullets this plan covers (`resources/features-roadmap.md`):
```
Phase 1 §1
*   **User registration**: Allows new users to register on the platform
*   **User login**: Provides secure sign-in functionality for registered users
```

## Commands you will need

Run from the `mobile/` directory unless stated otherwise.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat e540072..HEAD -- mobile/App.tsx mobile/package.json mobile/src/types.ts mobile/src/theme.ts mobile/tsconfig.json mobile/app.json` | empty |
| Install deps | `cd mobile && npm install` | exit 0 |
| TypeScript check | `cd mobile && npx tsc --noEmit` | exit 0, no errors |
| Syntax check (key files) | `cd mobile && npx tsc --noEmit src/services/apiClient.ts src/services/authApi.ts src/context/AuthContext.tsx src/screens/OtpRequestScreen.tsx src/screens/OtpVerifyScreen.tsx src/screens/ProfileScreen.tsx` | exit 0 |
| Verify secure-store import | `cd mobile && node -e "try { require('expo-secure-store'); console.log('ok') } catch(e) { console.error('MISSING'); process.exit(1) }"` | `ok` |
| Verify navigation imports | `cd mobile && node -e "require('@react-navigation/native'); require('@react-navigation/native-stack'); console.log('ok')"` | `ok` |
| Verify file existence | `ls mobile/src/services/apiClient.ts mobile/src/services/authApi.ts mobile/src/context/AuthContext.tsx mobile/src/screens/OtpRequestScreen.tsx mobile/src/screens/OtpVerifyScreen.tsx mobile/src/screens/ProfileScreen.tsx mobile/src/config.ts` | all files exist |
| Verify exports | `cd mobile && npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you should create or modify):

- `mobile/package.json` — add `expo-secure-store`, `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`
- `mobile/src/config.ts` (new) — API base URL, constants
- `mobile/src/services/apiClient.ts` (new) — typed fetch wrapper with JWT injection + auto-401
- `mobile/src/services/authApi.ts` (new) — requestOtp, verifyOtp, getMe
- `mobile/src/context/AuthContext.tsx` (new) — auth state provider + hook
- `mobile/src/screens/OtpRequestScreen.tsx` (new) — phone input → request OTP
- `mobile/src/screens/OtpVerifyScreen.tsx` (new) — code input → verify → login
- `mobile/src/screens/ProfileScreen.tsx` (new) — show user info + logout button
- `mobile/App.tsx` (modify) — wrap in NavigationContainer + AuthProvider, add auth stack vs main screen conditional routing
- `mobile/src/types.ts` (modify) — add `UserProfile` type
- `plans/README.md` (modify) — status row for 023

**Out of scope** (do NOT touch, even though they look related):

- `mobile/src/components/MapCanvas.tsx` / `MapCanvas.native.tsx` / `MapCanvas.web.tsx` — no changes to the map
- `mobile/src/components/SearchBar.tsx` / `WaypointsSheet.tsx` — no changes to map UI
- `mobile/src/hooks/useUserLocation.ts` — unchanged
- `mobile/src/utils/*` — all utility files unchanged
- `mobile/src/theme.ts` — colors already sufficient
- `mobile/app.json` — no new plugins needed (expo-secure-store and react-navigation are JS-only)
- `backend/**` — no backend changes
- `admin/**` — no admin changes
- Cargo/driver/offers/shipments screens — plan 024 and 025
- Profile PATCH (update name/email) — deferred to a later slice
- Push notifications — Phase 2
- Tabs, drawer navigation, or any non-auth navigation — the app is a single map screen after login

## Git workflow

- Branch: stay on `main` (operator override — no branch creation)
- Commit style: `feat(023): add mobile auth screens, API client, and token storage`
- Final commit: `chore(023): mark plan DONE in index`
- Do NOT push.

## Product / design decisions (locked for this plan)

These are not open questions for the executor. Implement them as written.

1. **Phone is the identity.** The OTP request screen accepts an Iranian phone number. No email login, no social login, no password.
2. **Single-screen auth flow.** Two screens: (1) phone input + "send code" button, (2) 6-digit code input + "verify" button. Simple and focused. No "forgot password", no "resend code" button on the verify screen (the user can go back to request screen to resend after cooldown).
3. **Token storage: `expo-secure-store`.** JWT token stored under key `auth_token`. User profile stored under key `auth_user` as JSON string (avoids a /me call on every cold start, but /me is still the source of truth — see decision 8).
4. **Auth state lives in React Context.** `AuthContext` exposes `{ user, token, isLoading, signIn(phone), verifyOtp(phone, code), signOut() }`. On mount, it reads SecureStore; if a token exists, it calls `/api/auth/me` to validate and refresh user data. While that call is in-flight, `isLoading` is true.
5. **API base URL from config.** `mobile/src/config.ts` exports `API_BASE` defaulting to `http://10.0.2.2:4000` (Android emulator localhost alias). This is a dev-time default. A later plan adds environment-based config for production builds.
6. **API client auto-injects Bearer token.** `apiClient.ts` exports a `apiFetch(path, options)` function that prepends `API_BASE`, sets `Content-Type: application/json` and `Authorization: Bearer <token>` from SecureStore, and throws on non-2xx with the parsed error body. On 401, it clears the token and triggers logout (AuthContext exposes a `_clearToken` for this). No retry logic, no refresh tokens.
7. **RTL layout.** Auth screens use RTL and Vazirmatn font, matching the existing app. The phone input shows a `+98` prefix hint but accepts any format (normalization is on the backend).
8. **On app launch with stored token:** read token + user from SecureStore, immediately render the map screen with stored user data (no splash wait), then fire a background `GET /api/auth/me` to validate. If /me returns 401, clear the token and show the auth screens. This gives instant load while still validating the session.
9. **Error display.** OTP screens show inline error messages below the input field (red text), matching the toast style in the existing app. No alert boxes, no modal errors. Rate limit (429) shows a cooldown message.
10. **No cargo/driver screens.** After login, the user sees the existing map screen. A small "profile" FAB or menu item opens the ProfileScreen. No tabs, no drawer — keep it minimal.
11. **UserProfile type** added to `types.ts`:
    ```ts
    export interface UserProfile {
      id: string;
      phone: string;
      name: string;
      email: string;
      roles: string[];
      status: string;
      phoneVerifiedAt: string | null;
    }
    ```
12. **Navigation structure.** `@react-navigation/native-stack` with a root `Stack.Navigator`. When `user` is null, show `OtpRequest` and `OtpVerify` screens. When `user` is set, show the main `AppRoot` (map) screen and `ProfileScreen`. The navigator is `screenOptions={{ headerShown: false }}` to keep the full-screen map layout. Auth screens provide their own header/title.

## Steps

### Step 1: Confirm the tree and install dependencies

```bash
cd mobile
ls App.tsx src/types.ts src/theme.ts package.json tsconfig.json
```

Verify these exist. Then install new deps:

```bash
cd mobile
npm install expo-secure-store @react-navigation/native @react-navigation/native-stack react-native-screens
```

**Verify**: `cd mobile && node -e "require('expo-secure-store'); require('@react-navigation/native'); require('@react-navigation/native-stack'); console.log('ok')"` → `ok`

### Step 2: Add UserProfile type to types.ts

Add to the bottom of `mobile/src/types.ts`:

```ts
export interface UserProfile {
  id: string;
  phone: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
  phoneVerifiedAt: string | null;
}
```

**Verify**: `cd mobile && npx tsc --noEmit src/types.ts` → exit 0

### Step 3: Create config.ts

Create `mobile/src/config.ts`:

```ts
/**
 * Runtime configuration.
 * Default API_BASE points to the Android emulator's localhost alias.
 * iOS simulator uses http://localhost:4000.
 * Production builds override via environment variables (future plan).
 */

import { Platform } from 'react-native';

const DEV_API_BASE =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:4000'
    : 'http://localhost:4000';

export const API_BASE = DEV_API_BASE;
```

**Verify**: `cd mobile && node -c src/config.ts` should pass (this is TS, use `npx tsc --noEmit`):
`cd mobile && npx tsc --noEmit src/config.ts` → exit 0

### Step 4: Create the typed API client

Create `mobile/src/services/apiClient.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../config';

const TOKEN_KEY = 'auth_token';

export interface ApiError {
  error: string;
  message?: string;
}

/**
 * Low-level fetch wrapper for the Baryar API.
 * Automatically prepends API_BASE, sets JSON headers,
 * and injects the stored JWT Bearer token.
 *
 * On 401, clears the stored token (the caller/AuthContext
 * will react to the missing token and show auth screens).
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
    const err: ApiError = body && body.error
      ? body
      : { error: 'unknown_error' };
    throw err;
  }

  return body as T;
}

/**
 * Set the auth token in secure storage.
 */
export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/**
 * Clear the auth token from secure storage.
 */
export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/**
 * Read the raw token (or null).
 */
export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
```

**Verify**: `cd mobile && npx tsc --noEmit src/services/apiClient.ts` → exit 0

### Step 5: Create auth API service

Create `mobile/src/services/authApi.ts`:

```ts
import { apiFetch, setAuthToken } from './apiClient';
import type { UserProfile } from '../types';

interface RequestOtpResponse {
  ok: true;
}

interface VerifyOtpResponse {
  token: string;
  user: UserProfile;
}

interface MeResponse {
  user: UserProfile;
}

/**
 * Request an OTP code for the given phone number.
 * The phone is normalized on the backend.
 */
export async function requestOtp(phone: string): Promise<void> {
  await apiFetch<RequestOtpResponse>('/api/auth/request-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/**
 * Verify the OTP code. On success, stores the JWT
 * and returns the user profile.
 */
export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ token: string; user: UserProfile }> {
  const res = await apiFetch<VerifyOtpResponse>('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
  await setAuthToken(res.token);
  return { token: res.token, user: res.user };
}

/**
 * Fetch the current user profile using the stored JWT.
 * Returns null if the token is invalid/expired (401).
 */
export async function getMe(): Promise<UserProfile | null> {
  try {
    const res = await apiFetch<MeResponse>('/api/auth/me');
    return res.user;
  } catch (err) {
    if (err && typeof err === 'object' && 'error' in err) {
      return null;
    }
    throw err;
  }
}
```

**Verify**: `cd mobile && npx tsc --noEmit src/services/authApi.ts` → exit 0

### Step 6: Create AuthContext

Create `mobile/src/context/AuthContext.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { UserProfile } from '../types';
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken as storeToken,
} from '../services/apiClient';
import { getMe, requestOtp, verifyOtp as apiVerifyOtp } from '../services/authApi';

const USER_KEY = 'auth_user';

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
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

const USER_KEY_EXP = 'auth_user_exp';
const STALE_MS = 5 * 60 * 1000; // 5 minutes

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

  const value: AuthState = {
    user,
    token,
    isLoading,
    signIn,
    verifyOtp: verifyOtpFn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

**Verify**: `cd mobile && npx tsc --noEmit src/context/AuthContext.tsx` → exit 0

### Step 7: Create OtpRequestScreen

Create `mobile/src/screens/OtpRequestScreen.tsx`:

```tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme';

interface Props {
  /** Navigate to the verify screen after OTP is sent. */
  onSent: (phone: string) => void;
}

export default function OtpRequestScreen({ onSent }: Props) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const handleSend = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError('شماره تلفن را وارد کنید');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(trimmed);
      onSent(trimmed);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? (err as { error: string }).error
          : 'خطای سرور';
      if (msg === 'invalid_phone') {
        setError('شماره تلفن نامعتبر است');
      } else if (msg === 'otp_cooldown') {
        setError('لطفاً چند ثانیه صبر کنید');
      } else if (msg === 'rate_limited') {
        setError('تعداد درخواست‌ها زیاد است، لطفاً بعداً تلاش کنید');
      } else {
        setError('خطا در ارسال کد');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="phone-portrait-outline" size={48} color={COLORS.blue} />
      </View>

      <Text style={styles.title}>ورود به بازیار</Text>
      <Text style={styles.subtitle}>
        شماره تلفن خود را وارد کنید تا کد تأیید دریافت کنید
      </Text>

      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="09121234567"
        placeholderTextColor={COLORS.gray}
        keyboardType="phone-pad"
        maxLength={16}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSend}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSend}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <Text style={styles.buttonText}>ارسال کد</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    textAlign: 'center',
    direction: 'ltr',
    marginBottom: 8,
  },
  error: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.red,
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.white,
  },
});
```

**Verify**: `cd mobile && npx tsc --noEmit src/screens/OtpRequestScreen.tsx` → exit 0

### Step 8: Create OtpVerifyScreen

Create `mobile/src/screens/OtpVerifyScreen.tsx`:

```tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme';

interface Props {
  phone: string;
  onBack: () => void;
}

export default function OtpVerifyScreen({ phone, onBack }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const { verifyOtp } = useAuth();

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 4) {
      setError('کد تأیید را وارد کنید');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(phone, trimmed);
      // AuthContext state change will re-render the app into the main screen.
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? (err as { error: string }).error
          : 'خطای سرور';
      if (msg === 'otp_invalid') {
        setError('کد وارد شده صحیح نیست');
      } else if (msg === 'otp_locked') {
        setError('تعداد تلاش‌ها بیش از حد مجاز است');
      } else if (msg === 'account_blocked') {
        setError('حساب شما مسدود شده است');
      } else {
        setError('خطا در تأیید کد');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
      </Pressable>

      <View style={styles.iconWrap}>
        <Ionicons name="keypad-outline" size={48} color={COLORS.blue} />
      </View>

      <Text style={styles.title}>کد تأیید</Text>
      <Text style={styles.subtitle}>
        کد ۶ رقمی ارسال شده به{'\n'}
        <Text style={styles.phone}>{phone}</Text>
      </Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="------"
        placeholderTextColor={COLORS.gray}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleVerify}
        textAlign="center"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <Text style={styles.buttonText}>تأیید</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  phone: {
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    direction: 'ltr',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    letterSpacing: 8,
    marginBottom: 8,
  },
  error: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.red,
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.white,
  },
});
```

**Verify**: `cd mobile && npx tsc --noEmit src/screens/OtpVerifyScreen.tsx` → exit 0

### Step 9: Create ProfileScreen

Create `mobile/src/screens/ProfileScreen.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme';

interface Props {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: Props) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>پروفایل</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={COLORS.white} />
        </View>
        <Text style={styles.userName}>{user?.name || 'کاربر جدید'}</Text>
        <Text style={styles.userPhone} style={{ direction: 'ltr' }}>
          {user?.phone || ''}
        </Text>
      </View>

      {/* Info cards */}
      <View style={styles.infoSection}>
        <InfoRow icon="call-outline" label="تلفن" value={user?.phone || '-'} />
        <InfoRow
          icon="checkmark-circle-outline"
          label="وضعیت"
          value={user?.status === 'active' ? 'فعال' : user?.status || '-'}
          valueColor={user?.status === 'active' ? COLORS.green : COLORS.red}
        />
        <InfoRow
          icon="shield-checkmark-outline"
          label="نقش"
          value={
            user?.roles?.includes('driver')
              ? 'راننده'
              : user?.roles?.includes('admin')
              ? 'مدیر'
              : 'صاحب بار'
          }
        />
        {user?.email ? (
          <InfoRow icon="mail-outline" label="ایمیل" value={user.email} />
        ) : null}
      </View>

      {/* Logout */}
      <Pressable style={styles.logoutButton} onPress={signOut}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
        <Text style={styles.logoutText}>خروج از حساب</Text>
      </Pressable>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={infoStyles.row}>
      <Ionicons name={icon as any} size={20} color={COLORS.textMid} />
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={[infoStyles.value, valueColor ? { color: valueColor } : undefined]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 18,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
  },
  infoSection: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 24,
  },
  logoutButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.red,
  },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    flex: 1,
  },
  value: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    direction: 'ltr',
  },
});
```

**NOTE**: There is a TypeScript error in the ProfileScreen above — the second `style` prop on the `<Text>` for the phone number. Fix this during implementation: change `<Text style={styles.userPhone} style={{ direction: 'ltr' }}>` to `<Text style={[styles.userPhone, { direction: 'ltr' }]}>`.

**Verify**: `cd mobile && npx tsc --noEmit src/screens/ProfileScreen.tsx` → exit 0

### Step 10: Modify App.tsx to wire navigation + auth

The goal: wrap the existing `AppRoot` in `NavigationContainer` + `AuthProvider`, and add conditional routing based on auth state. The existing map logic stays in `AppRoot` unchanged.

Changes to `mobile/App.tsx`:

1. **New imports** at the top:
   ```tsx
   import { NavigationContainer } from '@react-navigation/native';
   import { createNativeStackNavigator } from '@react-navigation/native-stack';
   import { AuthProvider, useAuth } from './src/context/AuthContext';
   import OtpRequestScreen from './src/screens/OtpRequestScreen';
   import OtpVerifyScreen from './src/screens/OtpVerifyScreen';
   import ProfileScreen from './src/screens/ProfileScreen';
   ```

2. **Rename the current `AppRoot`** to `MapScreen` (or keep it `AppRoot` but it becomes one screen in the nav stack). The simplest approach: keep `AppRoot` as the map screen, add a small `Navigator` component that handles auth routing.

3. **Add a `Navigator` component** between `AuthProvider` and the rest:
   ```tsx
   type AuthStackParamList = {
     OtpRequest: undefined;
     OtpVerify: { phone: string };
   };

   type MainStackParamList = {
     Map: undefined;
     Profile: undefined;
   };

   function AppNavigator() {
     const { user, isLoading } = useAuth();
     const AuthStack = createNativeStackNavigator<AuthStackParamList>();
     const MainStack = createNativeStackNavigator<MainStackParamList>();

     if (isLoading) {
       return (
         <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
           <ActivityIndicator size="large" color={COLORS.blue} />
         </View>
       );
     }

     if (!user) {
       return (
         <AuthStack.Navigator screenOptions={{ headerShown: false }}>
           <AuthStack.Screen name="OtpRequest" component={OtpRequestScreen} />
           <AuthStack.Screen name="OtpVerify">
             {({ navigation, route }) => (
               <OtpVerifyScreen
                 phone={route.params.phone}
                 onBack={() => navigation.goBack()}
               />
             )}
           </AuthStack.Screen>
         </AuthStack.Navigator>
       );
     }

     return (
       <MainStack.Navigator screenOptions={{ headerShown: false }}>
         <MainStack.Screen name="Map" component={AppRoot} />
         <MainStack.Screen name="Profile">
           {({ navigation }) => (
             <ProfileScreen onBack={() => navigation.goBack()} />
           )}
         </MainStack.Screen>
       </MainStack.Navigator>
     );
   }
   ```

4. **Update the exported `App`** component:
   ```tsx
   export default function App() {
     const [fontsLoaded] = useFonts({
       Vazirmatn_400Regular,
       Vazirmatn_500Medium,
       Vazirmatn_700Bold,
     });

     if (!fontsLoaded) {
       return null;
     }

     return (
       <GestureHandlerRootView style={{ flex: 1 }}>
         <SafeAreaProvider>
           <NavigationContainer>
             <AuthProvider>
               <AppNavigator />
             </AuthProvider>
           </NavigationContainer>
         </SafeAreaProvider>
       </GestureHandlerRootView>
     );
   }
   ```

5. **OtpRequestScreen navigation**: The `onSent` prop navigates to OtpVerify. Wire it in the AuthStack screen definition (use a render prop or a wrapper component as shown above).

6. **Profile access from map**: Add a small profile button (person icon) to the FAB column in `AppRoot`, positioned below the GPS FAB. On press, navigate to Profile screen. This requires passing `navigation` or using `useNavigation()` hook inside `AppRoot`. The simplest approach: import `useNativeNavigation` in `AppRoot` and add a FAB that calls `navigation.navigate('Profile')`.

**Verify**: `cd mobile && npx tsc --noEmit` → exit 0

### Step 11: Final verification

Run full TypeScript check:
```bash
cd mobile && npx tsc --noEmit
```

Verify all new files exist:
```bash
ls -la mobile/src/config.ts mobile/src/services/apiClient.ts mobile/src/services/authApi.ts mobile/src/context/AuthContext.tsx mobile/src/screens/OtpRequestScreen.tsx mobile/src/screens/OtpVerifyScreen.tsx mobile/src/screens/ProfileScreen.tsx
```

Verify the auth context is imported in App.tsx:
```bash
grep -n "AuthProvider\|AppNavigator\|NavigationContainer" mobile/App.tsx
```

Expected: 3+ matches showing the auth wiring in App.tsx.

Verify no accidental backend changes:
```bash
git status --short backend/
```

Expected: empty.

### Step 12: Update plans/README.md

Add a row to the status table:
```
| 023  | Mobile auth + API client (OTP screens, secure storage, auth state) | P1 | M | 014 | DONE (executed by pipeline) |
```

Update the queue row for 023 by appending "(→ 023)" to the 023 line (but keep the original text intact since it's already marked).

Commit:
```bash
cd /home/cyphered/projects/mapapp
git add mobile/App.tsx mobile/package.json mobile/src/types.ts mobile/src/config.ts mobile/src/services/apiClient.ts mobile/src/services/authApi.ts mobile/src/context/AuthContext.tsx mobile/src/screens/OtpRequestScreen.tsx mobile/src/screens/OtpVerifyScreen.tsx mobile/src/screens/ProfileScreen.tsx plans/README.md
git commit -m "feat(023): add mobile auth screens, API client, and token storage"
```

**Verify**: `git log --oneline -1` → shows the commit with `feat(023):` prefix.

## Test plan

This plan does not add Jest tests — the mobile app has no test infrastructure.
Tests are deferred to plan 026 (the full test + debug pass).

Verification is via TypeScript compilation (`npx tsc --noEmit`) and
structural checks (file existence, imports, exports).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd mobile && npx tsc --noEmit` exits 0
- [ ] `ls mobile/src/config.ts mobile/src/services/apiClient.ts mobile/src/services/authApi.ts mobile/src/context/AuthContext.tsx mobile/src/screens/OtpRequestScreen.tsx mobile/src/screens/OtpVerifyScreen.tsx mobile/src/screens/ProfileScreen.tsx` — all 7 files exist
- [ ] `grep -c "AuthProvider" mobile/App.tsx` → at least 1
- [ ] `grep -c "NavigationContainer" mobile/App.tsx` → at least 1
- [ ] `grep -c "useAuth" mobile/src/screens/OtpRequestScreen.tsx` → at least 1
- [ ] `grep -c "useAuth" mobile/src/screens/OtpVerifyScreen.tsx` → at least 1
- [ ] `grep -c "useAuth" mobile/src/screens/ProfileScreen.tsx` → at least 1
- [ ] `grep -c "expo-secure-store" mobile/src/services/apiClient.ts` → at least 1
- [ ] `git status --short mobile/` → clean (no uncommitted changes)
- [ ] `plans/README.md` status row for 023 shows DONE
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (the codebase has drifted since this plan was written).
- `npx tsc --noEmit` fails with errors in files outside the in-scope list
  that cannot be fixed with a one-line change.
- `expo-secure-store` or `@react-navigation/native` fail to install
  (npm error, peer dependency conflict, or Expo SDK incompatibility).
- The backend auth endpoints (`/api/auth/request-otp`, `/api/auth/verify-otp`,
  `/api/auth/me`) are missing or changed from the 014 contract described above.
- The `OtpRequestScreen` `onSent` prop navigation pattern doesn't compile
  (native stack screen render props can be tricky — use a wrapper component
  if needed instead of inline render props).

## Maintenance notes

- **API base URL**: `mobile/src/config.ts` hardcodes the dev URL. A future plan
  should add `.env` support or a build-time config for production URLs.
- **Token refresh**: This plan stores a 7-day JWT with no refresh mechanism.
  When the token expires, the `/me` call returns 401, the client clears
  the token, and the user sees the auth screens again. Acceptable for Phase 1.
- **SecureStore limits**: expo-secure-store has a ~2KB value limit. The
  `UserProfile` JSON is well within this. If the user object grows (e.g.,
  adding avatar URLs or preferences), this constraint should be revisited.
- **Navigation**: The app uses a simple stack navigator. When cargo/driver
  screens are added (024, 025), they will be added as new screens in the
  MainStack. No tabs or drawers are planned for Phase 1.
- **RTL phone input**: The phone `<TextInput>` uses `direction: 'ltr'` so the
  number displays left-to-right even in an RTL app. The rest of the UI is RTL.
- **Error messages**: All user-facing strings are in Persian (Farsi).
  A future internationalization plan could extract them, but for Phase 1
  hardcoded Persian is correct per the product scope (Iran-first).

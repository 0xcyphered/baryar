# Plan 020: Admin webapp shell — phone OTP login, app layout, typed API client, auth guards

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9bccfe5..HEAD -- backend/src/app.js backend/src/routes/auth.js backend/src/middleware/auth.js backend/src/index.js backend/.env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates: `backend/src/routes/auth.js`
> still exports `POST /request-otp`, `POST /verify-otp`, `GET /me` with the
> shapes shown below; `backend/src/routes/admin.js` still has 17 routes under
> `router.use(auth, requireAdmin)`. Do not STOP just because unrelated later
> commits exist.

## Operator overrides (cron pipeline — these SUPERSEDE parts of this plan)

The executor for this plan is the unattended Baryar build pipeline, whose
operator rules replace conflicting defaults below:

1. **GIT POLICY**: Stay on the current branch (`main`). No branch creation, no
   checkout/switch, no worktree, no push. Commits ARE allowed and expected:
   commit the in-scope files with `feat(020): add admin webapp shell` (repo
   style), plus a final `chore(020): mark plan DONE in index` commit when the
   row is flipped. Never commit `.env` files or secrets. `.pipeline.lock` is
   gitignored. If git identity or a hook fails, leave changes uncommitted and
   note it in the report instead of fighting git.
2. **TESTS DEFERRED to plan 026**: never run Jest/`npm test`, never start dev
   servers or the API process (nothing long-running may survive the run).
   Allowed verification: `node --check`, `npx tsc --noEmit`, `npm ls`, grep
   checks, and the pure-node verify commands in this plan. The "Test plan"
   section is therefore DEFERRED — do not create test files in this plan.
3. `npm install` is allowed only inside `admin/` and only for dependencies
   this plan names.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/019-admin-backend-api.md (DONE — `/api/admin/*` endpoints exist), plans/014-phone-otp-auth.md (DONE — `/api/auth/*` OTP endpoints exist)
- **Category**: direction
- **Planned at**: commit `9bccfe5`, 2026-09-04

## Why this matters

The backend API (plans 014–019) is complete but has no admin-facing UI.
Plans 021 (admin pages) and 022 (verification/settings pages) build actual
data screens, but they need a shell app to live inside: authentication flow,
layout chrome, routing, and a typed API client that every page imports.

This plan creates `admin/` as an independent Vite + React 19 + TypeScript
app — completely separate from `webapp/` (the Iran Map demo, which must not
be touched). The shell delivers:
- Phone OTP login screen (calls the same `/api/auth` endpoints the mobile
  app will use)
- JWT bearer token stored in localStorage
- App layout with sidebar navigation (placeholder links for pages added in
  021 and 022)
- Typed fetch-based API client with automatic `Authorization: Bearer` header
- Auth guard that redirects unauthenticated visitors to login

Without this shell, plans 021 and 022 have nowhere to render their content.

## Current state

Repo layout at plan time (`9bccfe5` on `main`):

```
mapapp/
  backend/
    src/
      app.js              ← 8 routers mounted before /api 404 catch-all
      routes/auth.js      ← POST /request-otp, POST /verify-otp, GET /me
      routes/admin.js     ← 17 admin routes, all auth+requireAdmin gated
      middleware/auth.js   ← Bearer JWT → req.user
      middleware/adminGuard.js ← requireAdmin
    .env.example
  webapp/                  ← Iran Map demo (DO NOT touch)
    package.json           ← Vite + React 19 + TS + Tailwind 4 + oxlint
    vite.config.ts
    index.html
    src/
  mobile/                  ← Expo map (not wired)
  resources/
  plans/
```

### Backend auth endpoints (the admin app consumes these)

`POST /api/auth/request-otp` — body `{ phone: string }` → `200 { ok: true }`
`POST /api/auth/verify-otp` — body `{ phone: string, code: string }` → `200 { token: string, user: { id, phone, name, email, roles, status, phoneVerifiedAt } }`
`GET /api/auth/me` — header `Authorization: Bearer <token>` → `200 { user: { id, phone, name, email, roles, status, phoneVerifiedAt } }`

### Backend admin endpoints (plans 021/022 will consume these)

All under `/api/admin`, all require `Authorization: Bearer <token>` where
the user has `roles` containing `'admin'`.

```
GET    /api/admin/users              → { users: [...], count }
GET    /api/admin/users/:id          → { user }
PATCH  /api/admin/users/:id          → { user }
POST   /api/admin/users/:id/block    → { user }
POST   /api/admin/users/:id/unblock  → { user }
GET    /api/admin/drivers            → { drivers: [...], count }
GET    /api/admin/drivers/:userId    → { user, profile, vehicles, documents }
POST   /api/admin/drivers/:userId/verify → { profile }
GET    /api/admin/cargo              → { cargo: [...], count }
GET    /api/admin/cargo/:id          → { cargo }
PATCH  /api/admin/cargo/:id          → { cargo }
POST   /api/admin/cargo/:id/cancel   → { cargo }
GET    /api/admin/overview           → { overview }
GET    /api/admin/documents          → { documents: [...], count }
POST   /api/admin/documents/:id/verify → { document }
GET    /api/admin/settings           → { settings }
PUT    /api/admin/settings           → { settings }
```

### Conventions from the existing `webapp/` (match these)

- **Package manager**: npm (no pnpm/yarn in this repo)
- **Framework**: React 19, Vite 8, TypeScript ~6.0
- **Styling**: Tailwind CSS 4 via `@tailwindcss/vite` plugin (import `'tailwindcss'` in CSS)
- **Linting**: oxlint (not ESLint). Config: `.oxlintrc.json`
- **Language direction**: RTL, Vazirmatn font, Farsi labels
- **TypeScript config**: target `es2023`, `module: "esnext"`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `noEmit: true`, `verbatimModuleSyntax: true`
- **Icons**: `lucide-react`
- **No router in webapp** — but the admin app NEEDS one (sidebar nav). Use `react-router-dom` v7.

### Example `webapp/package.json` (adapt for admin)

```json
{
  "name": "baryar-admin",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  }
}
```

## Commands you will need

Run from the **repo root** unless a step says `cd admin`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Deps installed | `cd admin && npm ls react react-dom react-router-dom --depth=0` | all three listed, no `UNMET` |
| TS compiles | `cd admin && npx tsc --noEmit` | exit 0, no errors |
| API client exists | `grep -n "export.*function\|export.*const" admin/src/lib/api.ts` | at least `apiGet`, `apiPost`, `apiPatch`, `apiPut` exported |
| Auth context exists | `grep -n "export.*function\|export.*const" admin/src/lib/auth.tsx` | at least `AuthProvider`, `useAuth` exported |
| Login page exists | `grep -n "request-otp\|verify-otp" admin/src/pages/LoginPage.tsx` | both endpoints referenced |
| Sidebar exists | `grep -n "Users\|Cargo\|Drivers\|Settings\|Documents" admin/src/components/Sidebar.tsx` | all five nav labels present |
| ProtectedRoute exists | `grep -n "Navigate\|useAuth" admin/src/components/ProtectedRoute.tsx` | both present |
| No webapp changes | `git diff --name-only webapp/` | empty |
| Mount count | `grep -c "app.use('/api" backend/src/app.js` | `9` (unchanged — we do not touch the backend) |

## Scope

**In scope** (the only files you should create or modify):

- `admin/package.json` (new)
- `admin/package-lock.json` (from `npm install`)
- `admin/tsconfig.json` (new — project references to `tsconfig.app.json` + `tsconfig.node.json`)
- `admin/tsconfig.app.json` (new)
- `admin/tsconfig.node.json` (new)
- `admin/vite.config.ts` (new — proxy `/api` to `localhost:4000`)
- `admin/index.html` (new — RTL + Vazirmatn + title "Baryar Admin")
- `admin/.oxlintrc.json` (new — empty `{}` is fine)
- `admin/src/main.tsx` (new — React root with AuthProvider + BrowserRouter)
- `admin/src/index.css` (new — Tailwind import + base RTL styles)
- `admin/src/lib/api.ts` (new — typed fetch wrapper)
- `admin/src/lib/auth.tsx` (new — AuthContext with OTP login/logout/me)
- `admin/src/pages/LoginPage.tsx` (new — phone input → code input → redirect)
- `admin/src/pages/DashboardPage.tsx` (new — placeholder overview stub)
- `admin/src/components/Layout.tsx` (new — sidebar + content outlet)
- `admin/src/components/Sidebar.tsx` (new — nav links for all admin sections)
- `admin/src/components/ProtectedRoute.tsx` (new — auth guard)
- `admin/src/App.tsx` (new — routes: /login, / with protected layout)
- `plans/README.md` (modify — add 020 row as DONE)

**Out of scope** (do NOT touch, even though they look related):

- `webapp/**` — the Iran Map demo. Do not modify, rename, or touch.
- `backend/**` — the backend is complete. No new routes, models, or middleware.
- `mobile/**` — Expo mobile app is untouched.
- Actual admin data pages — those are plans 021 (users/cargo/trips) and 022 (verification/settings). This plan creates only the shell layout and placeholder routes.
- Test files — deferred to plan 026.
- Deployment config, Docker, CI/CD.
- Role-based access UI beyond the `admin` role check (Phase 2).
- User delete, company management, audit logs, notification dispatch.

## Git workflow

- **Branch: stay on `main` (operator override).**
- Commit style (from this repo): `feat(020): add admin webapp shell`
  Earlier examples: `feat(019): add admin backend API`, `chore(019): mark plan DONE in index`
- Two commits: (1) implementation files, (2) index row flip.
- Do NOT push.

## Product / design decisions (locked for this plan)

These are not open questions for the executor. Implement them as written.

1. **Separate app directory.** The admin app lives in `admin/` at the repo
   root — NOT inside `webapp/`. They are two independent Vite apps. The
   `webapp/` map demo is untouched.

2. **JWT stored in `localStorage`.** Simple for admin desktop use. Key:
   `baryar_admin_token`. The auth context reads it on mount and calls
   `GET /api/auth/me` to validate. If the token is expired or the user is
   blocked, clear localStorage and redirect to login.

3. **Phone OTP login flow.**
   - Step 1: User enters phone number (Iranian mobile, Farsi UI). Click
     "ارسال کد" (Send Code). Calls `POST /api/auth/request-otp` with
     `{ phone }`. Shows a success toast "کد تایید ارسال شد" and switches
     to the code input view.
   - Step 2: User enters 6-digit code. Click "ورود" (Login). Calls
     `POST /api/auth/verify-otp` with `{ phone, code }`. On success:
     stores `token` in localStorage, sets auth context, navigates to `/`.
   - Error display: show the `error` field from the JSON response below the
     form. Map common errors: `invalid_phone` → "شماره تلفن نامعتبر",
     `otp_cooldown` → "لطفاً صبر کنید", `otp_invalid` → "کد نادرست",
     `otp_locked` → "قفل شده — بعداً تلاش کنید", `account_blocked` →
     "حساب مسدود شده".
   - Rate limit / cooldown: disable the "Send Code" button for 60 seconds
     after a successful request-otp call.

4. **Admin-only login gate.** After login, check `user.roles.includes('admin')`.
   If false, show an error "فقط مدیران اجازه ورود دارند" (Only admins may
   log in), clear the token, and stay on the login page.

5. **Vite dev proxy.** `vite.config.ts` proxies `/api` to
   `http://localhost:4000` so the admin app can talk to the backend in
   development without CORS issues. Production would use a reverse proxy.

6. **Sidebar layout.** The admin shell has a fixed left sidebar (240px wide)
   with these nav items (each a `react-router-dom` `<NavLink>`):
   - 📊 داشبورد (Dashboard) → `/` (placeholder — shows the overview stub)
   - 👥 کاربران (Users) → `/users` (placeholder — "Coming in plan 021")
   - 🚛 رانندگان (Drivers) → `/drivers` (placeholder — "Coming in plan 021")
   - 📦 بار (Cargo) → `/cargo` (placeholder — "Coming in plan 021")
   - 📄 اسناد (Documents) → `/documents` (placeholder — "Coming in plan 022")
   - ⚙️ تنظیمات (Settings) → `/settings` (placeholder — "Coming in plan 022")

   Active link gets a blue left border + blue text. Sidebar has a top logo
   area "بَريار | Baryar Admin". The content area fills the remaining width.
   Sidebar is collapsible on mobile (< 768px) via a hamburger toggle.

7. **DashboardPage placeholder.** The `/` route shows the overview stats
   from `GET /api/admin/overview`. If the call fails (e.g. non-admin JWT),
   show an error state. The overview shape from plan 019:
   ```js
   {
     users: { total, drivers, cargoOwners, admins, blocked },
     cargo: { total, draft, open, matched, cancelled, completed },
     offers: { pending, accepted, rejected, withdrawn },
     shipments: { active, completed, cancelled },
   }
   ```
   Render each section as a stat card grid. No complex charts — just
   number cards with labels. This gives the shell a real page to render
   rather than a blank placeholder.

8. **Typed API client** (`admin/src/lib/api.ts`). Exports:
   ```ts
   async function apiGet<T>(path: string): Promise<T>
   async function apiPost<T>(path: string, body?: unknown): Promise<T>
   async function apiPatch<T>(path: string, body?: unknown): Promise<T>
   async function apiPut<T>(path: string, body?: unknown): Promise<T>
   ```
   All read `localStorage.getItem('baryar_admin_token')` for the Bearer
   header. If the response is 401, clear the token and redirect to `/login`
   (use `window.location.href = '/login'` — simplest approach, no router
   dependency). Never throw `err.message` — throw `{ error: string }` parsed
   from the JSON body.

9. **Auth context** (`admin/src/lib/auth.tsx`). Exports `AuthProvider` and
   `useAuth()`. The context holds:
   ```ts
   { user: PublicUser | null, token: string | null, login: (phone, code) => Promise<void>, logout: () => void, loading: boolean }
   ```
   On mount: read token from localStorage → call `GET /api/auth/me` → if
   200, set user; if 401/403, clear token. `loading` is true until this
   check completes. `login` calls verify-otp, stores token, calls me.
   `logout` clears localStorage and resets state.

10. **Tech stack (no extras).** Only these dependencies in `admin/package.json`:
    - `react`, `react-dom` (19.x — match webapp version)
    - `react-router-dom` (^7.x)
    - `lucide-react` (icons — match webapp)
    - `@tailwindcss/vite`, `tailwindcss` (4.x — match webapp)
    - Dev: `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`,
      `@types/node`, `typescript`, `vite`, `oxlint`

11. **RTL everywhere.** `<html lang="fa" dir="rtl">`. Sidebar is on the
    right side (standard RTL). Content flows right-to-left. All labels in
    Farsi. Vazirmatn font loaded from Google Fonts.

## Steps

### Step 1: Scaffold the `admin/` project

Create the project structure with these files:

**`admin/package.json`**:
```json
{
  "name": "baryar-admin",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^1.38.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router-dom": "^7.6.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "@vitejs/plugin-react": "^6.1.0",
    "oxlint": "^1.79.0",
    "tailwindcss": "^4.3.3",
    "typescript": "~6.0.2",
    "vite": "^8.2.2"
  }
}
```

**`admin/tsconfig.json`**:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**`admin/tsconfig.app.json`**:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**`admin/tsconfig.node.json`**:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

**`admin/vite.config.ts`**:
```ts
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
```

**`admin/index.html`**:
```html
<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>بَريار | Baryar Admin</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**`admin/.oxlintrc.json`**:
```json
{}
```

**Verify**: `cd admin && ls package.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html .oxlintrc.json` → all 7 files listed.

### Step 2: Install dependencies

```bash
cd admin && npm install
```

**Verify**: `cd admin && npm ls react react-dom react-router-dom --depth=0` → all three listed, no `UNMET`.

### Step 3: Global CSS

Create `admin/src/index.css`:
```css
@import "tailwindcss";

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  font-family: 'Vazirmatn', 'Tahoma', sans-serif;
  direction: rtl;
}
```

**Verify**: `node -c admin/src/index.css` is not valid JS — check with `head -3 admin/src/index.css` → starts with `@import "tailwindcss";`.

### Step 4: Typed API client

Create `admin/src/lib/api.ts`:
```ts
const TOKEN_KEY = 'baryar_admin_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface ApiError {
  error: string;
  message?: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw { error: 'unauthorized' } satisfies ApiError;
  }
  const json = await res.json() as T & ApiError;
  if (!res.ok) {
    throw json as ApiError;
  }
  return json as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export { getToken, setToken, clearToken, TOKEN_KEY };
export type { ApiError };
```

**Verify**: `cd admin && npx tsc --noEmit` → exit 0 (this file alone should pass since we haven't written consuming files yet, but the full check comes at the end).

### Step 5: Auth context

Create `admin/src/lib/auth.tsx`:
```tsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { apiGet, apiPost, setToken, clearToken, getToken } from './api';

interface PublicUser {
  id: string;
  phone: string;
  name: string;
  email: string;
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
```

**Verify**: `grep -n "export.*function\|export.*const\|export.*type" admin/src/lib/auth.tsx` → shows `useAuth`, `AuthProvider`, `PublicUser`.

### Step 6: Login page

Create `admin/src/pages/LoginPage.tsx`:
```tsx
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiPost } from '../lib/api';
import { Send, LogIn, Loader2 } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_phone: 'شماره تلفن نامعتبر',
  otp_cooldown: 'لطفاً ۶۰ ثانیه صبر کنید',
  otp_invalid: 'کد نادرست است',
  otp_locked: 'قفل شده — بعداً تلاش کنید',
  account_blocked: 'حساب شما مسدود شده',
  forbidden: 'فقط مدیران اجازه ورود دارند',
  unauthorized: 'کد نادرست است',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [phase, setPhase] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);

  const handleSendCode = useCallback(async () => {
    setError('');
    setSending(true);
    try {
      await apiPost('/api/auth/request-otp', { phone });
      setPhase('code');
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      const e = err as { error?: string };
      setError(ERROR_MESSAGES[e.error ?? ''] || 'خطای سرور');
    } finally {
      setSending(false);
    }
  }, [phone]);

  const handleLogin = useCallback(async () => {
    setError('');
    setLogging(true);
    try {
      await login(phone, code);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const e = err as { error?: string };
      setError(ERROR_MESSAGES[e.error ?? ''] || 'خطای سرور');
    } finally {
      setLogging(false);
    }
  }, [phone, code, login, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg border border-gray-200">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800">بَريار</h1>
          <p className="mt-1 text-sm text-gray-500">ورود مدیریت</p>
        </div>

        {phase === 'phone' ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                شماره موبایل
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09121234567"
                dir="ltr"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-left text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSendCode}
              disabled={sending || !phone}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              ارسال کد تایید
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                کد تایید ۶ رقمی
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="۱۲۳۴۵۶"
                dir="ltr"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-lg tracking-[0.3em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleLogin}
              disabled={logging || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {logging ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              ورود
            </button>
            <button
              onClick={() => { setPhase('phone'); setCode(''); setError(''); }}
              disabled={cooldown > 0}
              className="w-full text-center text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              {cooldown > 0 ? `ارسال مجدد کد (${cooldown}s)` : 'تغییر شماره / ارسال مجدد'}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Verify**: `grep -n "request-otp\|verify-otp" admin/src/pages/LoginPage.tsx` → both endpoints referenced.

### Step 7: Sidebar component

Create `admin/src/components/Sidebar.tsx`:
```tsx
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../lib/auth';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'داشبورد', end: true },
  { to: '/users', icon: Users, label: 'کاربران' },
  { to: '/drivers', icon: Truck, label: 'رانندگان' },
  { to: '/cargo', icon: Package, label: 'بار' },
  { to: '/documents', icon: FileText, label: 'اسناد' },
  { to: '/settings', icon: Settings, label: 'تنظیمات' },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();

  return (
    <aside
      className={`flex h-full flex-col border-l border-gray-200 bg-white transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
        {!collapsed && (
          <span className="text-lg font-bold text-gray-800">بَريار</span>
        )}
        <button
          onClick={onToggle}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={collapsed ? 'باز کردن منو' : 'بستن منو'}
        >
          ☰
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-r-2 border-blue-600 bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`
            }
          >
            <item.icon size={18} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-3 py-3">
        {!collapsed && user && (
          <p className="mb-2 truncate text-xs text-gray-400">{user.phone}</p>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50"
        >
          <LogOut size={18} />
          {!collapsed && <span>خروج</span>}
        </button>
      </div>
    </aside>
  );
}
```

**Verify**: `grep -n "Users\|Cargo\|Drivers\|Settings\|Documents" admin/src/components/Sidebar.tsx` → all five nav labels present.

### Step 8: ProtectedRoute component

Create `admin/src/components/ProtectedRoute.tsx`:
```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.roles.includes('admin')) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
          <p className="text-lg font-medium text-red-600">فقط مدیران اجازه ورود دارند</p>
          <button
            onClick={() => { localStorage.removeItem('baryar_admin_token'); window.location.href = '/login'; }}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            بازگشت به صفحه ورود
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

**Verify**: `grep -n "Navigate\|useAuth" admin/src/components/ProtectedRoute.tsx` → both present.

### Step 9: Dashboard page (overview stub)

Create `admin/src/pages/DashboardPage.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import { Users, Truck, Package, FileText, AlertCircle } from 'lucide-react';

interface Overview {
  users: { total: number; drivers: number; cargoOwners: number; admins: number; blocked: number };
  cargo: { total: number; draft: number; open: number; matched: number; cancelled: number; completed: number };
  offers: { pending: number; accepted: number; rejected: number; withdrawn: number };
  shipments: { active: number; completed: number; cancelled: number };
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
        <Icon size={20} className="text-blue-600" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<{ overview: Overview }>('/api/admin/overview')
      .then(({ overview: o }) => setOverview(o))
      .catch(() => setError('خطا در دریافت اطلاعات'));
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  if (!overview) {
    return <div className="text-sm text-gray-400">در حال بارگذاری...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">داشبورد</h2>

      <section>
        <h3 className="mb-3 text-sm font-medium text-gray-500">کاربران</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="مجموع کاربران" value={overview.users.total} icon={Users} />
          <StatCard label="رانندگان" value={overview.users.drivers} icon={Truck} />
          <StatCard label="صاحبان بار" value={overview.users.cargoOwners} icon={Package} />
          <StatCard label="مسدود شده" value={overview.users.blocked} icon={AlertCircle} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-gray-500">بار</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="مجموع" value={overview.cargo.total} icon={Package} />
          <StatCard label="باز" value={overview.cargo.open} icon={Package} />
          <StatCard label="تخصیص‌یافته" value={overview.cargo.matched} icon={Package} />
          <StatCard label="تکمیل‌شده" value={overview.cargo.completed} icon={Package} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-gray-500">سفرها</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="فعال" value={overview.shipments.active} icon={Truck} />
          <StatCard label="تکمیل‌شده" value={overview.shipments.completed} icon={Truck} />
          <StatCard label="لغوشده" value={overview.shipments.cancelled} icon={AlertCircle} />
        </div>
      </section>
    </div>
  );
}
```

**Verify**: `grep -c "StatCard" admin/src/pages/DashboardPage.tsx` → at least 7 (1 definition + 6+ usages).

### Step 10: Layout component

Create `admin/src/components/Layout.tsx`:
```tsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50" dir="rtl">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

**Verify**: `grep -n "Outlet" admin/src/components/Layout.tsx` → present.

### Step 11: App routing

Create `admin/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500">این بخش در پلن‌های بعدی اضافه خواهد شد.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<Placeholder title="کاربران" />} />
            <Route path="drivers" element={<Placeholder title="رانندگان" />} />
            <Route path="cargo" element={<Placeholder title="بار" />} />
            <Route path="documents" element={<Placeholder title="اسناد" />} />
            <Route path="settings" element={<Placeholder title="تنظیمات" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

**Verify**: `grep -n "Route" admin/src/App.tsx | wc -l` → at least 10 (route declarations).

### Step 12: Entry point

Create `admin/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Verify**: `head -4 admin/src/main.tsx` → shows StrictMode import, createRoot import, index.css import, App import.

### Step 13: TypeScript check

```bash
cd admin && npx tsc --noEmit
```

**Verify**: exit 0, no errors. If there are type errors, fix them before continuing.

### Step 14: Final verification

Run the full verification suite:

```bash
# All files exist
ls admin/package.json admin/index.html admin/vite.config.ts admin/tsconfig.json admin/tsconfig.app.json admin/tsconfig.node.json admin/.oxlintrc.json admin/src/main.tsx admin/src/App.tsx admin/src/index.css admin/src/lib/api.ts admin/src/lib/auth.tsx admin/src/pages/LoginPage.tsx admin/src/pages/DashboardPage.tsx admin/src/components/Layout.tsx admin/src/components/Sidebar.tsx admin/src/components/ProtectedRoute.tsx

# TypeScript compiles
cd admin && npx tsc --noEmit

# API client exports
grep -n "export.*function\|export.*const" admin/src/lib/api.ts

# Auth context exports
grep -n "export.*function\|export.*const\|export.*type" admin/src/lib/auth.tsx

# Login page references OTP endpoints
grep -n "request-otp\|verify-otp" admin/src/pages/LoginPage.tsx

# Sidebar has all nav items
grep -n "داشبورد\|کاربران\|رانندگان\|بار\|اسناد\|تنظیمات" admin/src/components/Sidebar.tsx

# ProtectedRoute uses Navigate + useAuth
grep -n "Navigate\|useAuth" admin/src/components/ProtectedRoute.tsx

# No webapp changes
git diff --name-only webapp/

# Backend unchanged
grep -c "app.use('/api" backend/src/app.js
```

### Step 15: Commit

```bash
git add admin/ plans/README.md
git commit -m "feat(020): add admin webapp shell"
```

Then update the row in `plans/README.md` to DONE:
```bash
git add plans/README.md
git commit -m "chore(020): mark plan DONE in index"
```

## Test plan

Tests for the admin webapp are DEFERRED to plan 026. Do not create test
files in this plan.

When 026 runs, it should cover:
- Login flow: phone input → request-otp → code input → verify-otp → redirect
- Auth guard: unauthenticated user redirected to /login
- Auth guard: non-admin user shown "admin only" message
- API client: 401 triggers logout + redirect
- Sidebar: navigation links render correctly

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd admin && npx tsc --noEmit` exits 0
- [ ] `admin/package.json` exists with `react`, `react-dom`, `react-router-dom`, `lucide-react`, `tailwindcss`, `@tailwindcss/vite`
- [ ] `admin/src/lib/api.ts` exports `apiGet`, `apiPost`, `apiPatch`, `apiPut`
- [ ] `admin/src/lib/auth.tsx` exports `AuthProvider`, `useAuth`
- [ ] `admin/src/pages/LoginPage.tsx` references both `request-otp` and `verify-otp`
- [ ] `admin/src/components/Sidebar.tsx` contains all six nav labels (داشبورد, کاربران, رانندگان, بار, اسناد, تنظیمات)
- [ ] `admin/src/components/ProtectedRoute.tsx` uses both `Navigate` and `useAuth`
- [ ] `admin/src/App.tsx` has routes for `/login`, `/` (dashboard), `/users`, `/drivers`, `/cargo`, `/documents`, `/settings`
- [ ] No files under `webapp/` are modified (`git diff --name-only webapp/` is empty)
- [ ] `backend/src/app.js` still has exactly 9 `app.use('/api` lines (unchanged)
- [ ] `plans/README.md` status row for 020 says "DONE (executed by pipeline)"

## STOP conditions

Stop and report back (do not improvise) if:

- `webapp/` has been accidentally modified — undo the changes.
- The backend `/api/auth` or `/api/admin` endpoints have changed shape since the excerpts in this plan — the login page and API client will not work.
- `react-router-dom` v7 is not installable or has breaking API differences from what is written above.
- `npx tsc --noEmit` fails after two fix attempts.

## Maintenance notes

- Plans 021 and 022 replace the `<Placeholder>` routes in `App.tsx` with real page components. They will also add any new nav items to `Sidebar.tsx` if needed.
- The Vite dev server runs on port 5174 (5173 is the webapp). If both are running, they work independently.
- The API client (`lib/api.ts`) handles 401 globally — any future page that calls the API gets automatic logout on token expiry.
- JWT expiry is 7 days (set by plan 014). There is no refresh token — the user must re-login after expiry. This is acceptable for an admin tool used daily.
- If the backend is not running, the login page will show network errors. The admin app depends on the backend at `localhost:4000` (via Vite proxy in dev).

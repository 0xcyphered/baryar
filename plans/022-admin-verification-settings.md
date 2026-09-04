# Plan 022: Admin document verification queue + system settings pages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8a37ba3..HEAD -- admin/src/App.tsx admin/src/pages/DocumentsPage.tsx admin/src/pages/SettingsPage.tsx plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/020-admin-webapp-shell.md (DONE), plans/021-admin-pages.md (DONE)
- **Category**: direction
- **Planned at**: commit `8a37ba3`, 2026-09-04

## Why this matters

The admin webapp (020) and data pages (021) landed, but the sidebar links for
"اسناد" (documents) and "تنظیمات" (settings) currently render a generic
`<Placeholder>` that just says "این بخش در پلن‌های بعدی اضافه خواهد شد." The
backend APIs for both already exist from 019:

- `GET /api/admin/documents` + `POST /api/admin/documents/:id/verify`
- `GET /api/admin/settings` + `PUT /api/admin/settings`

This plan replaces both placeholders with functional pages so admins can
approve/reject driver documents and configure platform settings. This completes
the admin webapp surface for Phase 1 §5.

## Current state

### `admin/src/App.tsx` — routing (lines 39–40)

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import DriversPage from './pages/DriversPage';
import CargoPage from './pages/CargoPage';
import TripsPage from './pages/TripsPage';

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
            <Route path="users" element={<UsersPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="cargo" element={<CargoPage />} />
            <Route path="trips" element={<TripsPage />} />
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

The `Placeholder` component is a 5-line inline component. After this plan it
should be **deleted** (both documents and settings get real pages).

### Backend endpoints (already implemented in 019, no changes needed)

`GET /api/admin/documents?status=pending|approved|rejected` →
```json
{
  "documents": [
    {
      "id": "...",
      "userId": "...",
      "vehicleId": null,
      "kind": "driving_license",
      "storageKey": "",
      "originalName": "license.pdf",
      "mimeType": "application/pdf",
      "verificationStatus": "pending",
      "reviewedAt": null,
      "rejectionReason": "",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "count": 3
}
```

`POST /api/admin/documents/:id/verify` body: `{ decision: "approved" | "rejected", reason?: "..." }`
→ `{ document: { ... } }`

`GET /api/admin/settings` →
```json
{
  "settings": {
    "platformName": "...",
    "supportPhone": "...",
    "defaultCurrency": "IRR",
    "maxActiveCargoPerOwner": 20,
    "maintenanceMode": false,
    "updatedAt": "..."
  }
}
```

`PUT /api/admin/settings` body: partial update of any `settings` fields.
→ `{ settings: { ... } }`

### Document model fields (for the `kind` badge)

```js
const KINDS = [
  'driving_license',    // گواهینامه رانندگی
  'vehicle_registration', // بیمه‌نامه / سند وسیله
  'safety_card',        // کارت معاینه فنی
  'national_id',        // کارت ملی
  'professional_card',  // کارت هوشمند
  'other',              // سایر
];
```

### Existing page patterns (from UsersPage, DriversPage, CargoPage)

- TypeScript functional components with `useState`/`useEffect`/`useCallback`
- RTL layout, Tailwind CSS classes, Vazirmatn font
- Error display: `<AlertCircle size={16} />` + red bg div
- Loading: `<div className="text-sm text-gray-400">در حال بارگذاری...</div>`
- Tables: `<table className="w-full text-left text-sm">` with bg-gray-50 thead
- Status badges: `rounded-full px-2 py-0.5 text-xs font-medium` + color bg/text
- Modal/inline forms: `<div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">`
- All API calls via `apiGet`/`apiPost`/`apiPatch`/`apiPut` from `../lib/api`
- Confirm dialogs: `window.confirm()`
- Farsi labels throughout

## Commands you will need

Run from the **repo root** unless a step says `cd admin`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 8a37ba3..HEAD -- admin/src/App.tsx admin/src/pages/DocumentsPage.tsx admin/src/pages/SettingsPage.tsx plans/README.md` | empty, or only unrelated later commits |
| Confirm placeholders exist | `grep -n "Placeholder" admin/src/App.tsx` | lines 13, 39, 40 |
| Confirm backend endpoints | `grep -n "documents\\|settings" backend/src/routes/admin.js` | matches for GET/POST documents, GET/PUT settings |
| Typecheck | `cd admin && npx tsc --noEmit` | exit 0, no errors |
| Lint | `cd admin && npm run lint` | exit 0 |

No backend changes required. No `npm install` needed in `admin/` (no new dependencies).

## Scope

**In scope** (the only files you should create or modify):

- `admin/src/App.tsx` (replace `<Placeholder>` routes with real page imports, delete the `Placeholder` function)
- `admin/src/pages/DocumentsPage.tsx` (new file — document verification queue)
- `admin/src/pages/SettingsPage.tsx` (new file — system settings form)
- `plans/README.md` (update status row for 022)

**Out of scope** (do NOT touch, even though they look related):

- `backend/**` — all backend endpoints already exist from 019. Do not modify any backend file.
- `admin/src/components/Sidebar.tsx` — already has `/documents` and `/settings` nav items.
- `admin/src/components/Layout.tsx`, `ProtectedRoute.tsx`, `auth.tsx`, `api.ts` — no changes needed.
- `admin/src/pages/UsersPage.tsx`, `DriversPage.tsx`, `CargoPage.tsx`, `TripsPage.tsx`, `DashboardPage.tsx`, `LoginPage.tsx` — already complete.
- `mobile/**`, `webapp/**` — not in scope.
- Adding file upload/download for documents — object store is Phase 2. Documents in this plan show metadata only (originalName, kind, status). No preview/download buttons.
- Company/fleet credential verification — Phase 2. Only driver documents.
- Custom RBAC / audit logs / activity trails — Phase 2.
- No new npm dependencies. Use only `lucide-react`, `react-router-dom`, and the existing `../lib/api`.

## Git workflow

- Branch: stay on `main` (no branch creation).
- Commit message style: `feat(022): add admin document verification and settings pages`
- Final commit: `chore(022): mark plan DONE in index`
- Do NOT push.

## Product / design decisions (locked for this plan)

These are not open questions for the executor. Implement them as written.

1. **Documents page** is a filtered table of all documents. Filter by `verificationStatus` (pending/approved/rejected). "Pending" should be the default filter. Each row shows: kind (with Farsi label + color badge), original filename, user ID (truncated), status badge, created date, and action buttons (approve ✓ / reject ✗ for pending documents only). Clicking reject opens an inline reason input (required — backend rejects with empty reason). On approve/reject, call `POST /api/admin/documents/:id/verify` with `{ decision, reason? }`, then re-fetch.

2. **Settings page** is a form with one editable field per settings key: `platformName` (text input), `supportPhone` (text input), `defaultCurrency` (text input, default "IRR"), `maxActiveCargoPerOwner` (number input, min 0), `maintenanceMode` (toggle/checkbox). On load, `GET /api/admin/settings` populates the form. A save button calls `PUT /api/admin/settings` with all fields. Show success/error feedback.

3. **Document kind labels** (Farsi):
   - `driving_license` → `گواهینامه رانندگی`
   - `vehicle_registration` → `سند وسیله نقلیه`
   - `safety_card` → `کارت معاینه فنی`
   - `national_id` → `کارت ملی`
   - `professional_card` → `کارت هوشمند`
   - `other` → `سایر`

4. **Document status badges**:
   - `pending` → `در انتظار` (bg-yellow-100 text-yellow-700)
   - `approved` → `تأیید شده` (bg-green-100 text-green-700)
   - `rejected` → `رد شده` (bg-red-100 text-red-700)

5. **File upload UI is NOT included** — documents are metadata-only stubs in Phase 1. The `storageKey` will be empty string until Phase 2 adds an object store. Show the `originalName` if non-empty, otherwise show "—".

6. **Maintenance mode toggle** on the settings page should include a brief warning in Farsi: "حالت تعمیر و نگهداری: در این حالت کاربران عادی امکان استفاده از پلتفرم را نخواهند داشت."

## Steps

### Step 1: Confirm the current tree and plan prerequisites

```bash
cd /home/cyphered/projects/mapapp
grep -n "Placeholder" admin/src/App.tsx
grep -n "documents\|settings" backend/src/routes/admin.js | head -10
```

**Verify**: `Placeholder` appears on lines referencing the documents and settings routes (39, 40 in App.tsx). Backend has `GET /documents`, `POST /documents/:id/verify`, `GET /settings`, `PUT /settings`.

If `admin/src/App.tsx` doesn't exist or has no `Placeholder`, STOP — the codebase has drifted.

### Step 2: Create DocumentsPage.tsx

Create `admin/src/pages/DocumentsPage.tsx`.

Key implementation details:
- Import `apiGet`, `apiPost` from `../lib/api`
- Import `AlertCircle`, `Check`, `X`, `FileText` from `lucide-react`
- Default filter: `statusFilter = 'pending'`
- Table columns: نوع (kind), فایل (filename), کاربر (userId — first 8 chars + ...), وضعیت (status badge), تاریخ (createdAt), عملیات (actions)
- For pending documents: approve button (green Check icon), reject button (red X icon)
- On reject: show an inline reason textarea below the row or in a modal-like overlay. The reason is **required** for rejection.
- After approve/reject, call `apiPost('/api/admin/documents/${id}/verify', { decision, reason })` and then re-fetch.
- Confirm with `window.confirm()` before approve. For reject, the inline reason input serves as the confirmation gate (must type something, then click confirm).
- Empty state: "سندی یافت نشد" (no documents found)

Pattern to follow: `admin/src/pages/DriversPage.tsx` for the table layout, `admin/src/pages/UsersPage.tsx` for inline action forms.

**Verify**: `cd admin && node -e "import('./src/pages/DocumentsPage.tsx').then(() => console.log('import ok')).catch(e => { console.error(e.message); process.exit(1); })"` — this may not work for .tsx; use the tsc check in Step 4 instead.

### Step 3: Create SettingsPage.tsx

Create `admin/src/pages/SettingsPage.tsx`.

Key implementation details:
- Import `useState`, `useEffect`, `useCallback` from React
- Import `apiGet`, `apiPut` from `../lib/api`
- Import `AlertCircle`, `Check` from `lucide-react`
- On mount: `GET /api/admin/settings` → populate form state
- Form fields (each with a Farsi label):
  - `platformName` — `<input type="text">`, label: "نام پلتفرم"
  - `supportPhone` — `<input type="tel">`, label: "تلفن پشتیبانی"
  - `defaultCurrency` — `<input type="text">`, label: "واحد پول پیش‌فرض"
  - `maxActiveCargoPerOwner` — `<input type="number" min="0">`, label: "حداکثر بار فعال هر مالک"
  - `maintenanceMode` — `<input type="checkbox">`, label: "حالت تعمیر و نگهداری"
- Below the maintenance checkbox, show: `<p className="text-xs text-gray-500">حالت تعمیر و نگهداری: در این حالت کاربران عادی امکان استفاده از پلتفرم را نخواهند داشت.</p>`
- Save button: calls `PUT /api/admin/settings` with the full settings object, shows success feedback ("تنظیمات ذخیره شد") or error.
- Layout: a card-like form container (`rounded-lg border border-gray-200 bg-white p-6 space-y-4`)
- After successful save, re-fetch to confirm the persisted values.

Pattern to follow: `admin/src/pages/UsersPage.tsx` inline edit form for the form pattern, `admin/src/pages/DashboardPage.tsx` for the load-then-display pattern.

### Step 4: Update App.tsx — replace Placeholder routes, delete Placeholder

Edit `admin/src/App.tsx`:

1. Add imports for the new pages:
   ```tsx
   import DocumentsPage from './pages/DocumentsPage';
   import SettingsPage from './pages/SettingsPage';
   ```

2. Replace the two Placeholder routes:
   - `<Route path="documents" element={<Placeholder title="اسناد" />} />` → `<Route path="documents" element={<DocumentsPage />} />`
   - `<Route path="settings" element={<Placeholder title="تنظیمات" />} />` → `<Route path="settings" element={<SettingsPage />} />`

3. Delete the `Placeholder` function (lines 12–19) — it's no longer used.

**Verify**: `grep -c "Placeholder" admin/src/App.tsx` → `0` (no remaining references).

### Step 5: Verify

```bash
cd admin && npx tsc --noEmit
```

**Verify**: exit 0, no errors.

```bash
cd admin && npm run lint
```

**Verify**: exit 0.

Also verify that the Sidebar still has the `/documents` and `/settings` nav items (unchanged — just confirming they match):

```bash
grep -n "documents\|settings" admin/src/components/Sidebar.tsx
```

**Verify**: shows `/documents` and `/settings` entries.

Confirm the new files exist and the old Placeholder is gone:

```bash
ls -la admin/src/pages/DocumentsPage.tsx admin/src/pages/SettingsPage.tsx
grep -rn "Placeholder" admin/src/
```

**Verify**: both files exist; no remaining `Placeholder` references anywhere.

## Test plan

This plan does not add backend tests (no backend changes). The admin webapp has no test suite yet — verification is via `tsc --noEmit` (type safety) and `npm run lint` (code quality). Full test coverage is deferred to plan 026.

Manual verification (for the human reviewer):
1. `cd admin && npm run dev` → open the admin panel
2. Navigate to /documents — should show the document list filtered to "pending"
3. If documents exist: approve one, reject one with a reason, verify the status updates
4. Navigate to /settings — should show the settings form with current values
5. Change platformName, click save, confirm the value persists

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd admin && npx tsc --noEmit` exits 0
- [ ] `cd admin && npm run lint` exits 0
- [ ] `grep -c "Placeholder" admin/src/App.tsx` returns `0`
- [ ] `ls admin/src/pages/DocumentsPage.tsx admin/src/pages/SettingsPage.tsx` — both exist
- [ ] `grep -n "apiGet\|apiPost\|apiPut" admin/src/pages/DocumentsPage.tsx` — shows API calls to `/api/admin/documents`
- [ ] `grep -n "apiGet\|apiPut" admin/src/pages/SettingsPage.tsx` — shows API calls to `/api/admin/settings`
- [ ] `grep -n "DocumentsPage\|SettingsPage" admin/src/App.tsx` — shows route imports
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `admin/src/App.tsx` doesn't match the current state excerpts (codebase has drifted).
- Backend endpoints `GET /api/admin/documents` or `GET /api/admin/settings` return errors — they should work since 019 is DONE.
- `npx tsc --noEmit` fails with errors in files outside the in-scope list — fix trivial issues (unused imports) but report if the error is non-trivial.
- You need to install new npm dependencies — this plan adds none.

## Maintenance notes

- **Document file upload**: When Phase 2 adds an object store, `DocumentsPage` will need a download/preview link using `storageKey`. The `originalName` is already shown, so the UI extension is straightforward.
- **Settings schema extension**: If new settings fields are added to `SystemSettings` model later, the `SettingsPage` form should be extended accordingly. The `PUT` endpoint already accepts partial updates via `SETTINGS_FIELDS` allowlist.
- **Company credential verification**: Phase 2 will add company/fleet verification. The document page may need a second tab or filter for company documents. The current `kind` enum does not include company document types — that's a backend schema change in Phase 2.
- **RBAC refinement**: Currently all admins have full access to all admin endpoints. Phase 2 may introduce granular permissions — the settings page would be a natural place to add permission management UI.

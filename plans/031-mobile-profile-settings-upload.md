# Plan 031: Mobile profile edit, public settings, and real document upload (clients for 027 + 030)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Expo warning (AGENTS.md)**: Expo HAS changed. Before writing any
> expo-document-picker / expo-file-system / expo-sharing code, read the
> versioned docs at https://docs.expo.dev/versions/v57.0.0/ and use the SDK 57
> API shapes. If an API in this plan does not match the v57 docs, the docs win.
>
> **Precondition**: plans 027 (PATCH /api/auth/me + GET /api/settings) and 030
> (POST /api/driver/documents/upload + GET /api/driver/documents/:id/file)
> must be DONE in `plans/README.md` first. If they are TODO, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/027-user-profile-public-settings.md (DONE required), plans/030-document-file-upload.md (DONE required)
- **Category**: client follow-up (mobile)
- **Planned at**: commit `114fa9a`, 2026-09-05

## Why this matters

Backend plans 027 and 030 shipped real APIs the mobile app cannot use yet:

- `PATCH /api/auth/me` — ProfileScreen (`mobile/src/screens/ProfileScreen.tsx`)
  is read-only; the user cannot edit name/email/nationalId.
- `GET /api/settings` — support phone / platform name are not shown anywhere.
- `POST /api/driver/documents/upload` (multipart) — DriverDocumentsScreen
  still asks the user to type `storageKey` / `mimeType` as raw text
  (`mobile/src/screens/DriverDocumentsScreen.tsx` form fields
  `formStorageKey`, `formOriginalName`, `formMimeType`), which 030 made
  meaningless (server generates the key; client `storageKey` is dropped).
- `GET /api/driver/documents/:id/file` — a driver cannot view their own
  uploaded document.

## Current state

`mobile/src/types.ts:31-39` — `UserProfile` has **no** `nationalId` (027 now
returns it):

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

`mobile/src/services/apiClient.ts:19-50` — `apiFetch` always sets
`Content-Type: application/json`, which **breaks multipart** (the boundary is
never generated). There is no upload path:

```ts
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
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  // ...401 clears token; errors thrown as ApiError { error, message? }
}
```

`mobile/src/services/driverApi.ts:50-62` — JSON-only document create:

```ts
export async function createDocument(body: {
  kind: string;
  vehicleId?: string | null;
  storageKey?: string;
  originalName?: string;
  mimeType?: string;
}): Promise<DriverDocument> {
  const res = await apiFetch<DocumentResponse>('/api/driver/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.document;
}
```

`mobile/src/context/AuthContext.tsx` — `AuthState` exposes
`{ user, token, isLoading, signIn, verifyOtp, signOut }`. There is **no**
profile-update action. Cached user JSON lives under SecureStore key
`auth_user` (constant `USER_KEY`, line 11).

`mobile/src/screens/DriverDocumentsScreen.tsx` — add-form state (lines 36-42):
`formKind`, `formVehicleId`, `formStorageKey`, `formOriginalName`,
`formMimeType`, `submitting`. `handleAdd` (lines 71-89) calls `createDocument`
with those text fields.

Backend contract after 027/030 (already implemented — verify with the drift
commands below):

- `PATCH /api/auth/me` `{ name?, email?, nationalId? }` → 200
  `{ user: { ..., nationalId } }`; 400 `validation_error`; 401 `unauthorized`.
- `GET /api/settings` → 200 `{ settings: { platformName, supportPhone,
  defaultCurrency } }` (unauthenticated).
- `POST /api/driver/documents/upload` — multipart, field name **`file`**,
  text fields `kind` (required) + `vehicleId` (optional) → 201
  `{ document: DriverDocument }`; 400 `invalid_file_type` /
  `validation_error`; 413 `file_too_large` (max 5 MiB); allowed mimes:
  image/jpeg, image/png, image/webp, application/pdf.
- `GET /api/driver/documents/:id/file` → file bytes (404 `not_found` when
  the doc has no file — old JSON stubs).

## Product rules (do not invent others)

- Upload replaces the metadata form. **Do not keep** the storageKey /
  mimeType text inputs — they no longer do anything (030 drops client
  storageKey).
- Email lowercasing is server-side; send what the user typed.
- The driver's own document download goes through the authenticated
  endpoint with the Bearer header — never open the raw URL without the
  header (it 401s).
- Public settings are used for a small support block on ProfileScreen
  (support phone tel link). No new screens for settings.

## Commands you will need

Run from repo root unless a step says `cd mobile`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend drift check | `git log --oneline --grep="027\|030" | head -5` | `feat(027)…` and `feat(030)…` commits exist |
| Backend endpoint check | `grep -n "router.patch('/me'" backend/src/routes/auth.js && grep -n "documents/upload" backend/src/routes/driver.js` | one hit each |
| Install packages | `cd mobile && npx expo install expo-document-picker expo-file-system expo-sharing` | deps added at SDK 57 versions |
| Typecheck | `cd mobile && npx tsc --noEmit` | exit 0 |
| Lint | `cd mobile && npm run lint` | exit 0 |

Zero non-Expo packages. Do not add axios / react-query.

## Scope

**In scope** (the only files you should create or modify):

- `mobile/package.json` (three expo packages, via `npx expo install`)
- `mobile/src/types.ts` (`nationalId` on UserProfile; `PublicPlatformSettings`)
- `mobile/src/services/apiClient.ts` (multipart option)
- `mobile/src/services/authApi.ts` (`updateMe`)
- `mobile/src/services/settingsApi.ts` (new)
- `mobile/src/services/driverApi.ts` (`uploadDocument`)
- `mobile/src/context/AuthContext.tsx` (`updateProfile`)
- `mobile/src/screens/ProfileScreen.tsx` (edit mode + support block)
- `mobile/src/screens/DriverDocumentsScreen.tsx` (picker + upload + view)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `admin/` — the admin document preview is plan 033.
- Navigation param lists in `mobile/App.tsx` — no new screens.
- `mobile/src/screens/NotificationsScreen.tsx` — plan 032.
- Backend files — 027/030 are DONE; do not edit `backend/`.
- The JSON `POST /documents` stub path in driverApi (`createDocument`) —
  keep the function; it is still a valid backend endpoint. Only the screen
  stops using it.

## Git workflow

- Stay on the current branch. Do not push.
- Commits: `feat(031): mobile profile edit, settings and document upload`
  then `chore(031): mark plan DONE in index`.

## Steps

### Step 1: Install Expo packages

```bash
cd mobile && npx expo install expo-document-picker expo-file-system expo-sharing
```

Read the v57 docs pages for all three before Step 7.

**Verify**: `cd mobile && node -e "const p=require('./package.json'); console.log(['expo-document-picker','expo-file-system','expo-sharing'].map(k=>!!p.dependencies[k]).join(','))"` → `true,true,true`.

### Step 2: Types — `mobile/src/types.ts`

1. Add to `UserProfile`:

```ts
  nationalId: string;
```

2. Add a new interface (file end):

```ts
/** Public platform settings from GET /api/settings (027). Unauthenticated. */
export interface PublicPlatformSettings {
  platformName: string;
  supportPhone: string;
  defaultCurrency: string;
}
```

**Verify**: `cd mobile && npx tsc --noEmit` — expect errors ONLY where
`UserProfile` is constructed literally (AuthContext has none — it stores
server responses). If a screen hard-codes a full `UserProfile` literal, add
`nationalId: ''` there.

### Step 3: Multipart support — `mobile/src/services/apiClient.ts`

Extend `apiFetch` with a `multipart` flag. When true, do **not** set
`Content-Type` at all (RN fetch generates the boundary):

```ts
interface ApiFetchOptions extends RequestInit {
  /** true = body is FormData; do not set Content-Type (boundary is auto). */
  multipart?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const headers: Record<string, string> = {
    ...(options.multipart ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const { multipart: _multipart, ...fetchOptions } = options;
  const res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  // ...rest unchanged (401 handling + ApiError throw)
}
```

**Verify**: `cd mobile && npx tsc --noEmit` → exit 0.

### Step 4: API services

`mobile/src/services/authApi.ts` — add:

```ts
interface UpdateMeBody {
  name?: string;
  email?: string;
  nationalId?: string;
}

/** PATCH /api/auth/me (027). Returns the updated profile. */
export async function updateMe(body: UpdateMeBody): Promise<UserProfile> {
  const res = await apiFetch<MeResponse>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.user;
}
```

New `mobile/src/services/settingsApi.ts`:

```ts
import { apiFetch } from './apiClient';
import type { PublicPlatformSettings } from '../types';

/** GET /api/settings (027). Public — token attached if present, not required. */
export async function getPublicSettings(): Promise<PublicPlatformSettings> {
  const res = await apiFetch<{ settings: PublicPlatformSettings }>('/api/settings');
  return res.settings;
}
```

`mobile/src/services/driverApi.ts` — add (keep `createDocument`):

```ts
/** Multipart upload (030). Field name on the server is `file`. */
export async function uploadDocument(input: {
  kind: string;
  vehicleId?: string | null;
  uri: string;
  name: string;
  mimeType: string;
}): Promise<DriverDocument> {
  const form = new FormData();
  form.append('kind', input.kind);
  if (input.vehicleId) form.append('vehicleId', input.vehicleId);
  // RN FormData file part shape — NOT a File/Blob.
  form.append('file', {
    uri: input.uri,
    name: input.name || 'document',
    type: input.mimeType || 'application/octet-stream',
  } as unknown as Blob);
  const res = await apiFetch<DocumentResponse>('/api/driver/documents/upload', {
    method: 'POST',
    body: form,
    multipart: true,
  });
  return res.document;
}
```

**Verify**: `cd mobile && npx tsc --noEmit` → exit 0.

### Step 5: AuthContext — `updateProfile`

In `mobile/src/context/AuthContext.tsx`:

1. Import `updateMe` alongside the existing authApi imports.
2. Add to `AuthState`:

```ts
  /** PATCH /api/auth/me and refresh cached user. */
  updateProfile: (fields: { name?: string; email?: string; nationalId?: string }) => Promise<void>;
```

3. Implementation inside `AuthProvider` (pattern-match `verifyOtpFn`):

```ts
const updateProfileFn = useCallback(async (fields: { name?: string; email?: string; nationalId?: string }) => {
  const updated = await updateMe(fields);
  setUser(updated);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updated));
  await SecureStore.setItemAsync(USER_KEY_EXP, Date.now().toString());
}, []);
```

4. Add `updateProfile: updateProfileFn` to `value`.

**Verify**: `cd mobile && npx tsc --noEmit` → exit 0.

### Step 6: ProfileScreen — edit mode + support block

`mobile/src/screens/ProfileScreen.tsx`. Keep the existing read layout;
add:

1. Edit state: `editing`, `name`, `email`, `nationalId`, `saving`,
   `saveError`. "ویرایش پروفایل" button (below the info card) toggles
   `editing` and seeds the three fields from `user`.
2. Edit mode renders three labeled `TextInput`s (نام، ایمیل، کد ملی) styled
   like the existing inputs (Vazirmatn fonts, `COLORS.grayLight` background,
   `borderRadius: 12`) plus ذخیره / انصراف buttons. Save calls
   `updateProfile({ name, email, nationalId })`; on `ApiError` show
   `saveError`; on success exit edit mode. Empty string clears the field —
   that is allowed by the backend.
3. Support block at the bottom (above logout): load
   `getPublicSettings()` once (`useEffect`); if `supportPhone` is non-empty,
   render a row with `call-outline` icon + `پشتیبانی` + the number, wrapped
   in `Pressable` → `Linking.openURL('tel:' + supportPhone)`. Hide the row
   when the phone is empty or the request fails (silent catch).

**Verify**: `cd mobile && npx tsc --noEmit` && `npm run lint` → exit 0.

### Step 7: DriverDocumentsScreen — real upload + view

`mobile/src/screens/DriverDocumentsScreen.tsx`:

1. **Remove** `formStorageKey` / `formOriginalName` / `formMimeType` state
   and their TextInputs. Add `pickedFile` state
   `{ uri, name, mimeType } | null`.
2. "انتخاب فایل" button →
   `DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf], copyToCacheDirectory: true })`
   (check the exact v57 result shape in the docs). On success store
   `assets[0]` as `pickedFile` and show its `name` next to the button.
3. `handleAdd` now **requires** `pickedFile` (Alert if missing) and calls
   `uploadDocument({ kind: formKind, vehicleId: formVehicleId || null, ...pickedFile })`.
   Map failure codes to Persian: `invalid_file_type` → «فرمت فایل مجاز نیست»
   (jpg/png/webp/pdf), `file_too_large` → «حجم فایل بیش از ۵ مگابایت است»,
   else «ثبت سند با خطا مواجه شد».
4. Row action **مشاهده** (icon `eye-outline`) on every document: download to
   cache with the auth header, then share/open:

```ts
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getAuthToken } from '../services/apiClient';

const openDocument = async (doc: DriverDocument) => {
  try {
    const token = await getAuthToken();
    const fileUri = FileSystem.cacheDirectory + `doc-${doc.id}`;
    await FileSystem.downloadAsync(
      `${API_BASE}/api/driver/documents/${doc.id}/file`,
      fileUri,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: doc.mimeType || 'application/octet-stream' });
    }
  } catch {
    Alert.alert('خطا', 'فایلی برای این سند موجود نیست');
  }
};
```

   (If the v57 docs expose these APIs under a different import path — e.g.
   `expo-file-system/legacy` — follow the docs.) Old JSON stubs have no file
   → server 404s → the catch shows the Alert. That is the intended UX.

**Verify**: `cd mobile && npx tsc --noEmit` && `npm run lint` → exit 0.
`grep -n "formStorageKey" mobile/src/screens/DriverDocumentsScreen.tsx` → no hits.

## Test plan

The repo has **no mobile test infra** (rejected in `plans/README.md` —
"Test infrastructure" note). Verification is typecheck + lint + manual:

- Manual: edit name/email/nationalId on ProfileScreen → re-enter screen →
  values persist (GET /me reflects PATCH).
- Manual: pick a 6MB PDF → 413 alert; pick a .txt → 400 alert; pick a small
  jpg → 201, row appears, مشاهده opens the share sheet with the image.
- Manual: support row hidden when supportPhone empty.

## Done criteria

- [ ] `cd mobile && npx tsc --noEmit` exits 0
- [ ] `cd mobile && npm run lint` exits 0
- [ ] `grep -n "nationalId" mobile/src/types.ts` → one hit (UserProfile)
- [ ] `grep -n "documents/upload" mobile/src/services/driverApi.ts` → one hit
- [ ] `grep -n "multipart" mobile/src/services/apiClient.ts` → present
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row for 031 updated

## STOP conditions

- Plans 027 / 030 are not DONE in `plans/README.md`.
- `npx expo install` fails (offline) — do not hand-edit versions.
- The v57 API of document-picker / file-system / sharing does not match
  this plan's snippets and the migration is bigger than the step — report.
- `tsc --noEmit` fails for reasons outside the touched files.
- You are about to edit `backend/`, `admin/`, or `mobile/App.tsx` navigation.

## Maintenance notes

- When 032 lands, notification navigation may target CargoDetail — this
  plan does not touch navigation.
- Admin gets the same file via `GET /api/admin/documents/:id/file` (033);
  the mobile download path is driver-scoped and stays separate.
- `createDocument` (JSON stub) stays exported for potential admin/debug use;
  if a later plan confirms nothing uses it, remove it then.

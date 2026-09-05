# Plan 033: Admin document file preview + maintenance banner (clients for 030 + 029)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Precondition**: plan 030 (`GET /api/admin/documents/:id/file`) and 029
> (maintenance 503 middleware) must be DONE. If either is TODO, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/030-document-file-upload.md (DONE required), plans/029-notifications-settings-enforcement.md (DONE required)
- **Category**: client follow-up (admin)
- **Planned at**: commit `114fa9a`, 2026-09-05

## Why this matters

Plan 030 gives admins `GET /api/admin/documents/:id/file` — real bytes for a
document under review. The admin DocumentsPage shows only `originalName`
text; a verifier cannot see the license they are approving. Plan 029's
maintenance mode returns 503 on all non-admin writes — the admin panel is
the tool that flips the flag, and nothing surfaces the current mode or a
confirmation step; an admin can also get silently confused when a mutation
409/503s without a readable message.

## Current state

`admin/src/pages/DocumentsPage.tsx` — table columns: نوع / فایل / کاربر /
وضعیت / تاریخ / عملیات. The فایل column (lines 168-177) renders text only:

```tsx
                    <td className="px-4 py-3 text-gray-700">
                      {doc.originalName ? (
                        <span className="flex items-center gap-1">
                          <FileText size={14} className="text-gray-400" />
                          {doc.originalName}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
```

Approve/reject actions exist (lines ~193-210). There is a `<>` fragment
inside `.map()` without a key (line 157) — fix in passing.

`admin/src/lib/api.ts` — `apiGet`/`apiPost`/`apiPatch`/`apiPut` all return
parsed JSON and `throw` `ApiError { error }`. There is **no** helper for
blob/binary responses (the file endpoint streams bytes with auth via the
same Bearer header):

```ts
export async function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}
```

`admin/src/pages/SettingsPage.tsx` — settings form edits
`maintenanceMode` (boolean) among other fields; on save it PUTs
`/api/admin/settings`. No confirmation on the maintenance toggle.

`admin/src/lib/auth.tsx` — `PublicUser` lacks `nationalId` (027 now returns
it on /me). Not load-bearing for admin UI; extend the interface only.

## Product rules (do not invent others)

- Preview opens the file **in a new tab** with the auth header applied via
  a fetched Blob URL — never `window.open` the raw endpoint (no header →
  401).
- Old JSON-stub documents (no `storageKey` file) → 404 → show «فایلی
  موجود نیست» inline, not a browser error tab.
- Maintenance toggle asks `confirm()` in Persian before saving
  `maintenanceMode: true`. Do not build a custom modal for this.
- A 503 `{ error: 'maintenance' }` from any admin mutation keeps the
  standard error path (admins bypass 503 anyway per 029 — this is
  belt-and-braces; no special UI).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend drift check | `grep -n "documents/:id/file" backend/src/routes/admin.js && grep -n "maintenance" backend/src/middleware/maintenance.js` | one hit each |
| Typecheck | `cd admin && npx tsc -b --clean >/dev/null; npx tsc -b` | exit 0 (or `npm run build` which runs `tsc -b && vite build`) |
| Lint | `cd admin && npm run lint` | exit 0 |
| Build | `cd admin && npm run build` | exit 0, dist emitted |

Zero new packages.

## Scope

**In scope**:

- `admin/src/lib/api.ts` (add `apiGetBlob`)
- `admin/src/pages/DocumentsPage.tsx` (preview button + fragment key fix)
- `admin/src/pages/SettingsPage.tsx` (maintenance confirm + mode badge)
- `admin/src/lib/auth.tsx` (`nationalId` on PublicUser — optional, cosmetic)
- `plans/README.md` (status row)

**Out of scope**:

- `mobile/` and `backend/` files.
- Thumbnails / PDF.js rendering — new-tab preview is enough for Phase 1.
- The maintenance **503 global error banner** on every page (over-engineering
  for Phase 1; admin bypasses 503).
- Pagination, filters refactor, or the shared-types extraction (034).

## Git workflow

- Stay on the current branch. Do not push.
- Commits: `feat(033): admin document preview and maintenance guard`
  then `chore(033): mark plan DONE in index`.

## Steps

### Step 1: Blob helper — `admin/src/lib/api.ts`

```ts
/** Fetch a binary endpoint with the auth header; returns an object URL. */
export async function apiGetBlobUrl(path: string): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw { error: 'unauthorized' } satisfies ApiError;
  }
  if (!res.ok) {
    throw { error: 'not_found' } satisfies ApiError;
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
```

Callers own the revocation: document it in the JSDoc —
`URL.revokeObjectURL(url)` after the tab opens (browsers keep the tab
functional once loaded; revoke on a `setTimeout(…, 60_000)`).

**Verify**: `cd admin && npx tsc -b` → exit 0.

### Step 2: DocumentsPage — preview + fragment fix

`admin/src/pages/DocumentsPage.tsx`:

1. Import `apiGetBlobUrl` and an eye icon (`Eye` from `lucide-react`).
2. Add state `previewError: string | null` and handler:

```tsx
  const handlePreview = async (doc: { id: string; originalName: string }) => {
    try {
      const url = await apiGetBlobUrl(`/api/admin/documents/${doc.id}/file`);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPreviewError(null);
    } catch {
      setPreviewError('فایلی برای این سند موجود نیست');
      setTimeout(() => setPreviewError(null), 4000);
    }
  };
```

3. فایل column: when `doc.originalName` exists render the text **inside a
   button** (or make the cell a `<button>`) that calls
   `handlePreview(doc)`; add an `Eye` icon button in the عملیات column
   alongside approve/reject for the same purpose — pick **one** primary
   placement (recommend: clickable فایل cell + eye stays redundant →
   choose cell-only). Show `previewError` as a dismissible red banner
   above the table (same styling as the existing error banner, but do not
   replace the whole table — banner + table both visible).
4. Replace the keyless `<>` at line 157 with
   `<React.Fragment key={doc.id}>` wrapping the row(s).

**Verify**: `cd admin && npx tsc -b && npm run lint` → exit 0.
`grep -n "apiGetBlobUrl" admin/src/pages/DocumentsPage.tsx` → present.

### Step 3: SettingsPage — maintenance confirm + badge

`admin/src/pages/SettingsPage.tsx`:

1. When the maintenance checkbox is being turned **on** (false → true),
   intercept: `window.confirm('با فعال‌سازی حالت تعمیر، همه کاربران غیرمدیر از ثبت و ویرایش منع می‌شوند. ادامه؟')`
   — on cancel revert the checkbox state.
2. When maintenance is currently **on** (loaded settings), render a small
   yellow badge near the form title: «حالت تعمیر فعال است» with
   `bg-amber-100 text-amber-800` Tailwind classes.
3. Keep the save flow otherwise identical.

**Verify**: `cd admin && npx tsc -b && npm run lint` → exit 0.

### Step 4: auth.tsx — optional type touch-up

Add `nationalId: string;` to the `PublicUser` interface in
`admin/src/lib/auth.tsx` so `/me` responses are fully typed. No UI change.

**Verify**: `cd admin && npx tsc -b` → exit 0.

## Test plan

No admin test infra (verification gates are tsc + lint + build). Manual:

- Log in as admin → Documents → click a document that has a file → new tab
  shows the image/PDF. Click a JSON-stub document → red «فایلی موجود نیست»
  banner appears and disappears after 4s; table stays.
- Settings → check maintenance → confirm dialog; cancel → stays off;
  accept → save → badge appears. Flip off → save → badge gone.
- While maintenance is on: mobile app write attempts return 503 (verify
  with curl `POST /api/cargo` as a non-admin → 503 `{error:'maintenance'}`).

## Done criteria

- [ ] `cd admin && npm run build` exits 0 (includes tsc -b)
- [ ] `cd admin && npm run lint` exits 0
- [ ] `grep -n "apiGetBlobUrl" admin/src/lib/api.ts` → present
- [ ] `grep -n "React.Fragment key={doc.id}" admin/src/pages/DocumentsPage.tsx` → present; `grep -n "doc.id} className" admin/src/pages/DocumentsPage.tsx` shows the row inside it
- [ ] `grep -n "confirm(" admin/src/pages/SettingsPage.tsx` → present
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` status row for 033 updated

## STOP conditions

- Plans 030 / 029 not DONE.
- The file endpoint responds but the Blob preview is blocked by helmet/CSP
  on the **backend** (check response headers) — report; do not edit
  backend code, CSP loosening is an ops decision.
- `npm run build` fails on pre-existing errors outside the in-scope files.

## Maintenance notes

- When 034 (shared constants/types) lands, move any new label maps there.
- If an object store replaces local disk later, `apiGetBlobUrl` keeps
  working unchanged (same authenticated endpoint, different storage behind
  it).

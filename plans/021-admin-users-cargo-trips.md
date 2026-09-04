# Plan 021: Add admin users, cargo, drivers, and trips pages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f19cb47..HEAD -- admin/src/App.tsx admin/src/components/Sidebar.tsx admin/src/pages/DashboardPage.tsx admin/src/lib/api.ts admin/src/lib/auth.tsx backend/src/routes/admin.js backend/src/services/adminService.js plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/020-admin-webapp-shell.md (DONE — admin shell, API client, auth context exist)
- **Category**: direction
- **Planned at**: commit `f19cb47`, 2026-09-04

## Why this matters

Plan 020 shipped the admin webapp shell (OTP login, layout, sidebar, API client, route guards) with placeholder pages. The backend admin API (019) already exposes endpoints for users, drivers, cargo, documents, settings, and overview — but none of these have corresponding frontend screens. Without data pages the admin panel is a shell that shows only dashboard counters.

V6 Phase 1 §5 requires: registered user management, driver management, cargo database management, transport requests overview, and active trip monitoring. Plan 021 builds the first three categories of admin data pages (users, drivers, cargo) plus an active-trips monitor. Document verification and settings are deferred to plan 022.

The backend admin API (019) lacks a shipments list endpoint, which is needed for the "active trips monitor" page. This plan adds that small backend extension (`GET /api/admin/shipments`) so the trips page works end-to-end.

## Current state

### Admin webapp shell (plan 020)

`admin/src/App.tsx` — routes with Placeholder components:
```tsx
<Route path="users" element={<Placeholder title="کاربران" />} />
<Route path="drivers" element={<Placeholder title="رانندگان" />} />
<Route path="cargo" element={<Placeholder title="بار" />} />
<Route path="documents" element={<Placeholder title="اسناد" />} />
<Route path="settings" element={<Placeholder title="تنظیمات" />} />
```

`admin/src/components/Sidebar.tsx` — nav items (no trips entry):
```tsx
const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'داشبورد', end: true },
  { to: '/users', icon: Users, label: 'کاربران' },
  { to: '/drivers', icon: Truck, label: 'رانندگان' },
  { to: '/cargo', icon: Package, label: 'بار' },
  { to: '/documents', icon: FileText, label: 'اسناد' },
  { to: '/settings', icon: Settings, label: 'تنظیمات' },
];
```

`admin/src/pages/DashboardPage.tsx` — existing data page pattern (use `apiGet` + `useState` + `useEffect` + loading/error states + Tailwind + lucide-react icons + Persian labels).

`admin/src/lib/api.ts` — exports `apiGet`, `apiPost`, `apiPatch`, `apiPut`, `ApiError`.

`admin/src/lib/auth.tsx` — exports `useAuth`, `AuthProvider`, `PublicUser` type.

`admin/package.json` — dependencies: `react`, `react-dom`, `react-router-dom`, `lucide-react`. Dev: `vite`, `typescript`, `tailwindcss`, `oxlint`, `@tailwindcss/vite`, `@vitejs/plugin-react`.

`admin/tsconfig.app.json` — `noUnusedLocals: true`, `noUnusedParameters: true`, `verbatimModuleSyntax: true`, `jsx: react-jsx`.

### Backend admin API (plan 019)

`backend/src/routes/admin.js` — all routes under `router.use(auth, requireAdmin)`. Existing endpoints:
- `GET /users` (query: status, role) → `{ users, count }`
- `GET /users/:id` → `{ user }`
- `PATCH /users/:id` → `{ user }`
- `POST /users/:id/block` → `{ user }`
- `POST /users/:id/unblock` → `{ user }`
- `GET /drivers` → `{ drivers, count }` (each: `{ user, profile, vehicleCount }`)
- `GET /drivers/:userId` → `{ user, profile, vehicles, documents }`
- `POST /drivers/:userId/verify` → `{ profile }`
- `GET /cargo` (query: status, ownerUserId) → `{ cargo, count }`
- `GET /cargo/:id` → `{ cargo }`
- `PATCH /cargo/:id` → `{ cargo }`
- `POST /cargo/:id/cancel` → `{ cargo }`
- `GET /overview` → `{ overview }`
- `GET /documents` (query: status) → `{ documents, count }`
- `POST /documents/:id/verify` → `{ document }`
- `GET /settings` / `PUT /settings`
- **No `GET /shipments`** — this plan adds it

`backend/src/services/adminService.js` — exports: `publicAdminUser`, `listUsers`, `getUser`, `updateUser`, `setUserStatus`, `listDrivers`, `getDriverDetail`, `verifyDriverProfile`, `listCargoAdmin`, `getCargoAdmin`, `updateCargoAdmin`, `cancelCargoAdmin`, `overview`, `listDocuments`, `verifyDocument`, `ensureAdminBootstrap`.

`backend/src/models/User.js` — ROLES: `['cargo_owner', 'driver', 'admin']`, STATUSES: `['active', 'blocked', 'deleted']`.

`backend/src/models/Shipment.js` — STATUSES: `['assigned', 'loading', 'in_transit', 'at_customs', 'delivered', 'completed', 'cancelled']`. Fields: `cargoId`, `offerId`, `ownerUserId`, `driverUserId`, `vehicleId`, `status`, `pickupAt`, `deliveredAt`.

`backend/src/models/Cargo.js` — STATUSES: `['draft', 'open', 'matched', 'cancelled', 'completed']`.

### V6 bullets this plan covers (resources/features-roadmap.md)

Phase 1 §5:
```
*   Registered user management: view, edit, block, or delete platform users
*   Registered driver management: manage driver accounts
*   Cargo database management: oversee, edit, and cancel platform cargo postings
*   Transport requests overview: monitoring of all pending and active shipping requests
*   Active trip monitoring: tracks all active logistics journeys
```

### Roadmap items this plan does NOT implement

- Document verification queue (plan 022)
- System settings form (plan 022)
- Role-based access control UI (plan 022 or deferred)
- Company credential verification (Phase 2)
- Platform base data management (Phase 2)

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat f19cb47..HEAD -- admin/src/App.tsx admin/src/components/Sidebar.tsx admin/src/pages/DashboardPage.tsx admin/src/lib/api.ts admin/src/lib/auth.tsx backend/src/routes/admin.js backend/src/services/adminService.js plans/README.md` | empty (or only unrelated later commits) |
| Backend syntax | `cd backend && node -c src/services/adminService.js && node -c src/routes/admin.js` | exit 0 |
| Frontend typecheck | `cd admin && npx tsc -b` | exit 0 |
| Frontend build | `cd admin && npx vite build` | exit 0 |

## Scope

**In scope** (the only files you should create or modify):

- `backend/src/services/adminService.js` (add `listShipmentsAdmin` function + export)
- `backend/src/routes/admin.js` (add `GET /shipments` route)
- `admin/src/pages/UsersPage.tsx` (new)
- `admin/src/pages/DriversPage.tsx` (new)
- `admin/src/pages/CargoPage.tsx` (new)
- `admin/src/pages/TripsPage.tsx` (new)
- `admin/src/App.tsx` (replace Placeholder imports with real page components)
- `admin/src/components/Sidebar.tsx` (add trips nav item)
- `plans/README.md` (add 021 row, update queue)

**Out of scope** (do NOT touch, even though they look related):

- `admin/src/pages/LoginPage.tsx` — working as-is from 020
- `admin/src/pages/DashboardPage.tsx` — working as-is from 020
- `admin/src/components/ProtectedRoute.tsx` — working as-is from 020
- `admin/src/lib/api.ts` — no changes needed; `apiGet`/`apiPatch`/`apiPost` cover all needs
- `admin/src/lib/auth.tsx` — no changes needed
- `admin/src/components/Layout.tsx` — no changes needed
- `backend/src/services/cargoService.js` — do not modify; import `EDITABLE_FIELDS` only if needed
- `backend/src/routes/cargo.js` / `driver.js` / `offers.js` / `shipments.js` / `notifications.js` — owner/driver routes, do not touch
- `backend/src/models/*` — no model changes
- Document verification pages (022)
- Settings pages (022)
- Mobile app (`mobile/`)
- Any new npm dependencies
- `admin/vite.config.ts` — proxy already handles `/api`

## Git workflow

- Branch: stay on `main` (no branch creation per pipeline operator rules)
- Commit style: `feat(021): add admin users, cargo, drivers, and trips pages` + `chore(021): mark plan DONE in index`
- Do NOT push or open a PR.

## Product / design decisions (locked for this plan)

1. **All page labels in Persian (Farsi).** Match the existing sidebar labels: کاربران, رانندگان, بار, سفرها. Table headers and buttons also in Persian.
2. **Table-first layout.** Each page is a filter bar + data table + action buttons. No card views, no side panels. This matches the admin panel convention and keeps the implementation simple.
3. **No new npm dependencies.** All pages use `react`, `react-router-dom`, `lucide-react`, and Tailwind CSS (already installed). No table library, no form library, no dialog library.
4. **Users page includes block/unblock + edit.** Edit allows changing `name`, `email`, `nationalId` only (matches `adminService.updateUser` field allowlist). Clicking a user row shows an inline edit form below the table (not a modal — no dialog library available).
5. **Cargo page includes cancel + edit.** Edit allows changing `title`, `description`, `pickupAt`, `deliverBy` (simple scalar fields). Dimensions/origin/destination editing is deferred — those require a map picker. Clicking a cargo row shows detail fields + an edit form.
6. **Drivers page is read-only.** Driver profile verification is in plan 022. This page shows the list with profile status and vehicle count — for admin awareness.
7. **Trips page is read-only.** Admin monitors active shipments but does not modify them. The page shows shipment status with cargo title, owner name, and driver name (enriched by a new backend endpoint).
8. **"Transport requests overview" = cargo page filtered to open/matched.** No separate page — the cargo page's status filter serves this purpose.
9. **Backend shipments endpoint returns enriched data.** User names and cargo title are resolved server-side (not by the frontend making N calls). Pattern follows `listDrivers` (batch-fetch, build lookup maps).
10. **Use `window.confirm()` for destructive actions.** Block, unblock, cancel, and edit-save all get a native browser confirmation. No custom dialog component.

## Steps

### Step 1: Confirm the tree and verify drift

```bash
cd /home/cyphered/projects/mapapp
git diff --stat f19cb47..HEAD -- admin/src/App.tsx admin/src/components/Sidebar.tsx admin/src/pages/DashboardPage.tsx admin/src/lib/api.ts admin/src/lib/auth.tsx backend/src/routes/admin.js backend/src/services/adminService.js plans/README.md
```

**Verify**: output is empty (or only unrelated changes). If in-scope files changed, re-read them and compare against the "Current state" excerpts before proceeding.

Verify the admin shell exists:
```bash
ls admin/src/App.tsx admin/src/components/Sidebar.tsx admin/src/pages/DashboardPage.tsx admin/src/lib/api.ts
```

Verify the backend admin routes exist:
```bash
ls backend/src/routes/admin.js backend/src/services/adminService.js
```

If any file is missing, STOP and report.

### Step 2: Add backend shipments list endpoint

**File: `backend/src/services/adminService.js`**

Add the `listShipmentsAdmin` function at the bottom, before `module.exports`. Pattern follows `listDrivers` (batch-fetch related entities, build lookup maps, avoid N+1):

```js
async function listShipmentsAdmin({ status } = {}) {
  const query = {};
  if (status !== undefined) {
    if (!Shipment.STATUSES.includes(status)) fail('validation_error');
    query.status = status;
  }
  const shipments = await Shipment.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
  if (shipments.length === 0) return { shipments: [], count: 0 };

  const cargoIds = [...new Set(shipments.map((s) => s.cargoId))];
  const userIds = [...new Set(
    shipments.flatMap((s) => [s.ownerUserId.toString(), s.driverUserId.toString()])
  )];

  const [users, cargos] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('phone name').lean(),
    Cargo.find({ _id: { $in: cargoIds } }).select('title transportMode').lean(),
  ]);

  const userMap = {};
  for (const u of users) userMap[u._id.toString()] = u;
  const cargoMap = {};
  for (const c of cargos) cargoMap[c._id.toString()] = c;

  const enriched = shipments.map((s) => {
    const owner = userMap[s.ownerUserId.toString()] || {};
    const driver = userMap[s.driverUserId.toString()] || {};
    const cargo = cargoMap[s.cargoId.toString()] || {};
    return {
      id: s._id.toString(),
      cargoId: s.cargoId.toString(),
      cargoTitle: cargo.title || '',
      cargoMode: cargo.transportMode || '',
      ownerName: owner.name || owner.phone || '',
      driverName: driver.name || driver.phone || '',
      status: s.status,
      pickupAt: s.pickupAt,
      deliveredAt: s.deliveredAt,
      createdAt: s.createdAt,
    };
  });

  return { shipments: enriched, count: enriched.length };
}
```

Add `listShipmentsAdmin` to the `module.exports` object.

**File: `backend/src/routes/admin.js`**

Add the route after the Documents section and before the Settings section:

```js
// --- Shipments ---

router.get('/shipments', async (req, res) => {
  try {
    const result = await adminService.listShipmentsAdmin({
      status: req.query.status,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendAdminError(res, err);
  }
});
```

**Verify**:
```bash
cd backend && node -c src/services/adminService.js && node -c src/routes/admin.js
```
Expected: exit 0.

```bash
cd backend && grep -n "listShipmentsAdmin" src/services/adminService.js src/routes/admin.js
```
Expected: at least 2 lines (function definition + export, route handler).

### Step 3: Create UsersPage

**File: `admin/src/pages/UsersPage.tsx`** (new)

Follow the DashboardPage pattern: `useState` + `useEffect` + `apiGet` + `apiPost`/`apiPatch`. Persian labels. Tailwind styling. lucide-react icons.

Structure:
- **Filter bar**: status dropdown (all/active/blocked), role dropdown (all/cargo_owner/driver/admin). On change, refetch.
- **Table**: columns — Phone, Name, Email, Roles, Status, Created (formatted date), Actions (block/unblock + edit).
- **Inline edit form**: when "edit" is clicked on a row, show a form below the table with fields: name, email, nationalId. Submit calls `apiPatch('/api/admin/users/:id', { name, email, nationalId })`, then refresh.
- **Block/Unblock**: calls `apiPost('/api/admin/users/:id/block')` or `apiPost('/api/admin/users/:id/unblock')`, confirms with `window.confirm()`, refreshes list.
- **Loading/error states**: same as DashboardPage.

TypeScript interfaces:
```ts
interface AdminUser {
  id: string;
  phone: string;
  name: string;
  email: string;
  nationalId: string;
  roles: string[];
  status: string;
  phoneVerifiedAt: string | null;
  createdAt: string;
}
```

Backend data shape from `GET /api/admin/users`:
```ts
{ users: AdminUser[], count: number }
```

Key implementation details:
- Persian labels: فیلتر وضعیت (status filter), فیلتر نقش (role filter), شماره (phone), نام (name), ایمیل (email), نقش‌ها (roles), وضعیت (status), تاریخ ایجاد (created date), عملیات (actions), مسدود کردن (block), رفع مسدودی (unblock), ویرایش (edit), ذخیره (save), انصراف (cancel).
- Role badge colors: `admin` → blue, `driver` → green, `cargo_owner` → gray.
- Status badge: `active` → green, `blocked` → red.
- Date formatting: `new Date(dateStr).toLocaleDateString('fa-IR')` for Persian calendar.
- Inline edit form: name input, email input, nationalId input. Pre-populated from current row data. Cancel clears the form.

**Verify**:
```bash
cd admin && npx tsc -b
```
Expected: exit 0, no errors.

### Step 4: Create DriversPage

**File: `admin/src/pages/DriversPage.tsx`** (new)

Structure:
- **Table**: columns — Name, Phone, Profile Status, Vehicles, Created.
- **Read-only**: no edit/verify actions (plan 022).
- **Profile status badge**: `pending` → yellow, `approved` → green, `rejected` → red, none → gray ("ثبت‌نام نشده").
- **No filters needed** — drivers list is typically small. If desired, a status filter on profile verification status can be added but is not required for this plan.

TypeScript interfaces:
```ts
interface DriverEntry {
  user: {
    id: string;
    phone: string;
    name: string;
    email: string;
    roles: string[];
    status: string;
    createdAt: string;
  };
  profile: {
    verificationStatus: string;
    licenseNumber: string;
  } | null;
  vehicleCount: number;
}
```

Backend data shape from `GET /api/admin/drivers`:
```ts
{ drivers: DriverEntry[], count: number }
```

Implementation: `apiGet` + `useState` + `useEffect`. Persian labels: رانندگان (drivers), وضعیت پروفایل (profile status), تعداد وسایل نقلیه (vehicle count). Use `Truck` icon for vehicle count.

**Verify**:
```bash
cd admin && npx tsc -b
```
Expected: exit 0.

### Step 5: Create CargoPage

**File: `admin/src/pages/CargoPage.tsx`** (new)

Structure:
- **Filter bar**: status dropdown (all/draft/open/matched/cancelled/completed). On change, refetch.
- **Table**: columns — Title, Owner ID, Mode, Status, Pickup, Deliver By, Created, Actions.
- **Click row → detail section**: below the table, show all cargo fields (title, description, transportMode, origin place name/address, destination place name/address, dimensions, specialCharacteristics, pickupAt, deliverBy, status).
- **Edit button** (only for draft/open/matched status): shows inline edit form with title, description, pickupAt (datetime input), deliverBy (datetime input). Submit calls `apiPatch('/api/admin/cargo/:id', fields)`. Confirm with `window.confirm()`.
- **Cancel button** (only for draft/open/matched): calls `apiPost('/api/admin/cargo/:id/cancel')`. Confirm with `window.confirm('آیا از لغو این بار اطمینان دارید؟')`.

TypeScript interfaces:
```ts
interface AdminCargo {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  transportMode: string;
  origin: { placeName?: string; address?: string; location?: { coordinates: number[] } };
  destination: { placeName?: string; address?: string; location?: { coordinates: number[] } };
  dimensions: { weightKg: number; volumeM3: number; lengthCm: number; widthCm: number; heightCm: number };
  specialCharacteristics: string[];
  pickupAt: string | null;
  deliverBy: string | null;
  status: string;
  createdAt: string;
}
```

Backend data shape from `GET /api/admin/cargo`:
```ts
{ cargo: AdminCargo[], count: number }
```

Key implementation details:
- Transport mode badge colors: `land` → blue, `sea` → cyan, `air` → purple, `rail` → orange, `multimodal` → pink.
- Status badge: `draft` → gray, `open` → green, `matched` → blue, `cancelled` → red, `completed` → green (darker).
- Origin/destination: show `placeName` if present, else `address`, else coordinates.
- Dimensions: show as "W kg / V m³" compact format.
- Date inputs for pickupAt/deliverBy: use `<input type="datetime-local">` with value converted to `YYYY-MM-DDTHH:MM` format.

**Verify**:
```bash
cd admin && npx tsc -b
```
Expected: exit 0.

### Step 6: Create TripsPage

**File: `admin/src/pages/TripsPage.tsx`** (new)

Structure:
- **Filter bar**: status dropdown (all/assigned/loading/in_transit/at_customs/delivered/completed/cancelled).
- **Table**: columns — Cargo, Owner, Driver, Status, Pickup, Delivered, Created.
- **Read-only**: admin monitors but does not modify trips. No action buttons.
- **Status badge colors**: `assigned` → yellow, `loading` → blue, `in_transit` → green, `at_customs` → orange, `delivered` → cyan, `completed` → green (darker), `cancelled` → red.

TypeScript interfaces:
```ts
interface AdminShipment {
  id: string;
  cargoId: string;
  cargoTitle: string;
  cargoMode: string;
  ownerName: string;
  driverName: string;
  status: string;
  pickupAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}
```

Backend data shape from `GET /api/admin/shipments`:
```ts
{ shipments: AdminShipment[], count: number }
```

Persian labels: سفرها (trips), بار (cargo), مالک (owner), راننده (driver), وضعیت (status), بارگیری (pickup), تحویل (delivered), تاریخ ایجاد (created).

**Verify**:
```bash
cd admin && npx tsc -b
```
Expected: exit 0.

### Step 7: Update App.tsx — replace Placeholder with real pages

**File: `admin/src/App.tsx`**

Replace the `Placeholder` function and its usage. Remove the `Placeholder` component entirely. Add imports for the four new pages:

```tsx
import UsersPage from './pages/UsersPage';
import DriversPage from './pages/DriversPage';
import CargoPage from './pages/CargoPage';
import TripsPage from './pages/TripsPage';
```

Replace the route elements:
```tsx
<Route path="users" element={<UsersPage />} />
<Route path="drivers" element={<DriversPage />} />
<Route path="cargo" element={<CargoPage />} />
<Route path="trips" element={<TripsPage />} />
<Route path="documents" element={<Placeholder title="اسناد" />} />
<Route path="settings" element={<Placeholder title="تنظیمات" />} />
```

Wait — documents and settings still need the Placeholder. So keep the `Placeholder` component but remove it from the pages we're replacing. Actually, since documents and settings still use Placeholder, keep the component.

Revised approach: keep `Placeholder` component, replace the 4 routes:

```tsx
<Route path="users" element={<UsersPage />} />
<Route path="drivers" element={<DriversPage />} />
<Route path="cargo" element={<CargoPage />} />
<Route path="trips" element={<TripsPage />} />
```

**Verify**:
```bash
cd admin && npx tsc -b
```
Expected: exit 0.

### Step 8: Update Sidebar.tsx — add trips nav item

**File: `admin/src/components/Sidebar.tsx`**

Add import for `Route` icon from lucide-react:
```tsx
import { ..., Route } from 'lucide-react';
```

Add trips nav item to `NAV_ITEMS` after cargo:
```tsx
{ to: '/trips', icon: Route, label: 'سفرها' },
```

Final NAV_ITEMS order: Dashboard, Users, Drivers, Cargo, **Trips**, Documents, Settings.

**Verify**:
```bash
cd admin && npx tsc -b
```
Expected: exit 0.

### Step 9: Full typecheck and build

```bash
cd admin && npx tsc -b && npx vite build
```
Expected: exit 0 for both, no errors.

```bash
cd backend && node -c src/services/adminService.js && node -c src/routes/admin.js
```
Expected: exit 0.

### Step 10: Verify on disk

```bash
grep -rn "listShipmentsAdmin" backend/src/
```
Expected: matches in `adminService.js` (function + export) and `admin.js` (route call).

```bash
grep -rn "UsersPage\|DriversPage\|CargoPage\|TripsPage" admin/src/App.tsx
```
Expected: 4 import lines + 4 route usage lines.

```bash
grep -rn "trips\|سفرها" admin/src/components/Sidebar.tsx
```
Expected: the nav item entry.

```bash
ls admin/src/pages/UsersPage.tsx admin/src/pages/DriversPage.tsx admin/src/pages/CargoPage.tsx admin/src/pages/TripsPage.tsx
```
Expected: all 4 files exist.

## Test plan

This plan does not add Jest tests — the admin webapp has no test infrastructure (no vitest/jest configured), and backend tests for this plan are deferred to plan 026. Verification is via typecheck + build + syntax checks + grep.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && node -c src/services/adminService.js && node -c src/routes/admin.js` exits 0
- [ ] `cd admin && npx tsc -b` exits 0 with no errors
- [ ] `cd admin && npx vite build` exits 0
- [ ] `grep -rn "listShipmentsAdmin" backend/src/` returns matches in both `adminService.js` and `admin.js`
- [ ] All 4 new page files exist: `admin/src/pages/UsersPage.tsx`, `admin/src/pages/DriversPage.tsx`, `admin/src/pages/CargoPage.tsx`, `admin/src/pages/TripsPage.tsx`
- [ ] `admin/src/App.tsx` imports all 4 pages and routes them (no more Placeholder for users/drivers/cargo)
- [ ] `admin/src/components/Sidebar.tsx` has `/trips` nav item with label "سفرها"
- [ ] `plans/README.md` status row for 021 updated to "DONE (executed by pipeline)"
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- The admin shell files from 020 are missing or `App.tsx` still has `Placeholder` routes for ALL pages (020 was not executed).
- `backend/src/services/adminService.js` does not export `listCargoAdmin` or `listDrivers` (019 was not executed or drifted).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- `npx tsc -b` reports errors you cannot fix within the in-scope files (likely a drift in a shared type or dependency).

## Maintenance notes

- **Future changes will interact with this**: When plan 022 adds document verification and settings pages, those routes in `App.tsx` will replace the remaining `Placeholder` components. The `Placeholder` component in `App.tsx` can be removed once 022 is done.
- **Shipments endpoint**: The `listShipmentsAdmin` function enriches shipments with user names and cargo titles. If the dataset grows large, add pagination (cursor or offset). For Phase 1 MVP data volumes (< 100 records per query via `MAX_LIST`), the current approach is sufficient.
- **Edit forms**: The cargo edit form only covers scalar fields (title, description, timing). Editing dimensions or origin/destination will require a map component and nested form — defer to a future plan if needed.
- **No deletion**: The admin panel blocks users and cancels cargo but does not delete records. This matches the V6 design (status-based lifecycle, not hard delete). A future plan could add soft-delete if needed.

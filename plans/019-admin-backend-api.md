# Plan 019: Add admin-guarded backend API (users, drivers, cargo, documents, settings)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a214096..HEAD -- backend/src/app.js backend/src/index.js backend/src/routes/cargo.js backend/src/services/cargoService.js backend/src/services/notificationService.js backend/src/models/User.js backend/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates: `backend/src/models/User.js`
> still has `roles` enum `['cargo_owner','driver','admin']` + `status` enum
> `['active','blocked','deleted']`, `backend/src/app.js` still mounts 7 role
> routers before the `/api` catch-all, and no `admin` route/service exists in
> `backend/src/`. Do not STOP just because unrelated later commits exist.

## Operator overrides (cron pipeline — these SUPERSEDE parts of this plan)

The executor for this plan is the unattended Baryar build pipeline, whose
operator rules replace conflicting defaults below:

1. **GIT POLICY**: Stay on the current branch (`main`). No branch creation, no
   checkout/switch, no worktree, no push. Commits ARE allowed and expected:
   commit the in-scope files with `feat(019): add admin backend API` (repo
   style, e.g. `feat(018): add shipment lifecycle + notifications API`), plus
   a final `chore(019): mark plan DONE in index` commit when the row is
   flipped. Never commit `.env` files or secrets. `.pipeline.lock` is
   gitignored. If git identity or a hook fails, leave changes uncommitted and
   note it in the report instead of fighting git.
2. **TESTS DEFERRED to plan 026**: never run Jest/`npm test`, never start dev
   servers or the API process (nothing long-running may survive the run).
   Allowed verification: `node --check`, `npm ls`, grep checks, and the pure
   node verify script in this plan. The "Test plan" section is therefore
   DEFERRED — do not create test files in this plan.
3. `npm install` is allowed only inside `backend/` and only for dependencies
   this plan names (this plan names **none** — no new deps are needed).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/014-phone-otp-auth.md (DONE — Bearer JWT + auth middleware), plans/016-driver-onboarding-api.md (DONE — DriverProfile/Vehicle/Document + driver role)
- **Category**: direction
- **Planned at**: commit `a214096`, 2026-09-03

## Why this matters

V6 Phase 1 §5 (Web Administrator Panel) has no HTTP surface yet. The roadmap
bullets this plan implements (`resources/features-roadmap.md` lines 96–107):

```
### 5. Web Administrator Panel (پنل مدیریت تحت وب)
*   **Registered user management**: ... view, edit, block, or delete platform users [19].
*   **Registered driver management**: ... manage driver accounts [19].
*   **Cargo database management**: ... oversee, edit, and cancel platform cargo postings [19].
*   **Transport requests overview**: ... monitoring of all pending and active shipping requests [19].
*   **Active trip monitoring**: ... all active logistics journeys on the platform [19].
*   **Platform base data management**: ... manage base tables, zones, and static platform variables [19].
*   **Driver document verification**: ... verify and approve uploaded driver documents [19].
*   **System settings configuration**: ... modify global platform rules and constraints [19].
*   **Role-based access control (RBAC)**: ... custom admin roles and permissions [19].
```

The backend already has everything to build on: 014 gives Bearer JWT auth
(`backend/src/middleware/auth.js` → `req.user`), 015/016/017/018 built the
cargo/driver/offers/shipments surfaces — but there is **no admin router, no
admin service, no `SystemSettings` model**, and **nothing can grant the
`admin` role** (`verifyOtp` upserts `['cargo_owner']`; the driver route grants
`driver`). Plans 020–022 (admin webapp) are blocked without this API.

Roadmap §5 bullets this plan does **NOT** implement (and why):

- **Registered transport company management** / **Company credential
  verification** — `Company` model is Phase 2 (rejected in plans 011/013
  notes; no companies exist).
- **Platform base data management** beyond static variables — zones/base
  tables are a later slice; `SystemSettings` covers only global variables.
- **Full RBAC permission matrix** — Phase 2 §4. This plan implements the
  queue-row's RBAC definition: a single `admin` role enforced by a
  `requireAdmin` guard middleware. Custom roles are parked.
- **User delete** — roadmap names delete; queue row scopes 019 to
  block/unblock. `User.status = 'deleted'` exists but no endpoint sets it in
  this plan (a later slice may add soft-delete once cascade rules are decided).
- **Audit trail of admin actions** — Phase 2 §4. Admin identity IS recorded
  on document reviews (`reviewerUserId`) but no AuditLog collection.

## Current state

Repo layout at plan time (`a214096` on `main`):

```
backend/src/
  app.js                     ← 7 role routers mounted, then /api 404 catch-all
  index.js                   ← dotenv + connectDB + app.listen (bootstrap hook)
  middleware/auth.js         ← Bearer JWT → req.user (only middleware)
  routes/                    ← auth, cargo, driver, matching, offers, shipments, notifications
  services/                  ← otp, cargo, driver, matching, shipment, notification
  models/                    ← User, Cargo, Vehicle, DriverProfile, Document, Offer,
                               Shipment, ShipmentEvent, Notification, OtpChallenge, geoPoint
```

No admin code exists: `grep -rn "admin" backend/src backend/package.json`
returns only the `admin` role literal in `backend/src/models/User.js:3` and a
comment in `backend/src/services/shipmentService.js:19`.

`backend/src/app.js` today (mounts, lines 44–60):

```js
  app.use('/api/auth', authRoutes);

  app.use('/api/cargo', cargoRoutes);

  app.use('/api/driver', driverRoutes);

  app.use('/api/matching', matchingRoutes);

  app.use('/api/offers', offerRoutes);

  app.use('/api/shipments', shipmentRoutes);

  app.use('/api/notifications', notificationRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
```

Header requires (lines 6–12) follow the same pattern:

```js
const authRoutes = require('./routes/auth');
const cargoRoutes = require('./routes/cargo');
const driverRoutes = require('./routes/driver');
const matchingRoutes = require('./routes/matching');
const offerRoutes = require('./routes/offers');
const shipmentRoutes = require('./routes/shipments');
const notificationRoutes = require('./routes/notifications');
```

`backend/src/index.js` (full file — the bootstrap hook point):

```js
require('dotenv').config();
const { createApp } = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB();
  const app = createApp();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`baryar-api listening on ${PORT}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
```

`backend/src/middleware/auth.js` — the ONLY middleware; verify it is
unchanged (admin guard composes with it, does not modify it):

```js
async function auth(req, res, next) {
  ...
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = user;
  return next();
}

module.exports = { auth };
```

`backend/src/models/User.js` — identity fields the admin API reads/writes:

```js
const ROLES = ['cargo_owner', 'driver', 'admin'];
const STATUSES = ['active', 'blocked', 'deleted'];
// phone (unique), name, email, nationalId, roles[], status, phoneVerifiedAt
userSchema.statics.ROLES = ROLES;
userSchema.statics.STATUSES = STATUSES;
```

`backend/src/models/DriverProfile.js` (full shape):

```js
const VERIFICATION = ['pending', 'approved', 'rejected'];
// userId (unique ref User), licenseNumber, professionalCardNumber,
// verificationStatus (default 'pending'), verifiedAt, rejectionReason
// indexes: { userId: 1 } unique, { verificationStatus: 1 }
```

`backend/src/models/Document.js` — the verification target (has admin fields
already, all settable only from this plan):

```js
const VERIFICATION = ['pending', 'approved', 'rejected'];
// userId (ref User), vehicleId (nullable ref Vehicle), kind (enum KINDS),
// storageKey/originalName/mimeType (metadata only — plan 016), 
// verificationStatus (default 'pending'), reviewedAt (default null),
// reviewerUserId (nullable ref User), rejectionReason (default '')
// indexes: { userId: 1, kind: 1 }, { verificationStatus: 1 }
```

`backend/src/models/Vehicle.js`: `driverProfileId`, `ownerUserId`,
`vehicleType`, unique `plate`, capacities, `status` ('active'/'inactive').

`backend/src/models/Cargo.js`: `ownerUserId`, `title`, `description`,
`transportMode`, `origin`/`destination` (placeSchema), `dimensions`,
`specialCharacteristics[]`, `pickupAt`, `deliverBy`, `status` enum
`['draft','open','matched','cancelled','completed']`.

`backend/src/models/Shipment.js`: `cargoId` (unique index), `offerId`,
`ownerUserId`, `driverUserId`, `vehicleId`, `status` enum
`['assigned','loading','in_transit','at_customs','delivered','completed','cancelled']`,
`pickupAt`, `deliveredAt`.

`backend/src/models/Notification.js`: `TYPES = ['shipment_assigned',
'shipment_status']`, `userId`, `shipmentId`, `cargoId`, `title`, `body`,
`readAt`. The existing `notificationService.notifyShipment({ userId, type,
shipment, cargo })` accepts any `type` in that enum and never throws — this
plan reuses it for cancellation notices (type `shipment_status`).

`backend/src/services/cargoService.js` — the editable-field allowlist to
reuse (do NOT duplicate it in admin code):

```js
const EDITABLE_FIELDS = [
  'title', 'description', 'transportMode', 'origin', 'destination',
  'dimensions', 'specialCharacteristics', 'pickupAt', 'deliverBy',
];
```

`backend/src/services/cargoService.js` exports (line 114–122):
`publicCargo, createCargo, listCargo, updateCargo, deleteCargo, publishCargo,
cancelCargo`. `EDITABLE_FIELDS` is **not exported** — this plan adds it to the
exports (one line, see Step 3).

Conventions to match (exemplars, all read by the advisor):

- Router shape: `backend/src/routes/driver.js` — `router.use(auth)`, role
  gate as a small local middleware (`requireDriver` → `403 { error:
  'forbidden' }`), per-route vs router-wide gating, `sendXxxError(res, err)`
  helper mapping `err.code` → HTTP status with a `map` object, unknown codes
  → `500 { error: 'server_error' }` (never `err.message`), ValidationError →
  `400 { error: 'validation_error' }`.
- Service shape: `backend/src/services/cargoService.js` / `shipmentService.js`
  — `fail(code)` tagged-Error helper, `assertId(id, code)` 24-hex check,
  `publicX()` projection returning `id: doc._id.toString()` (never a schema
  field named `id`), `MAX_LIST = 100`, allowlist-based field picking.
- Style: CommonJS, 2-space indent. Mixed quote style exists in the tree
  (single in cargo/auth files, double in shipment/notification files) — pick
  one per file and stay consistent within the file.
- Error JSON is `{ error: '<snake_case>' }` only.

Dependencies (`backend/package.json`): express 4, mongoose 8, jsonwebtoken,
bcryptjs, express-rate-limit present. **No new dependency is needed for this
plan.** Tests (Jest + supertest + mongodb-memory-server) exist but are
DEFERRED to plan 026 per operator override.

`backend/.env.example` today (do NOT add secrets; one new line is added):

```
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/baryar
NODE_ENV=development
# JWT_SECRET is required to issue/verify auth tokens (fail closed when missing).
JWT_SECRET=change-me
# OTP_FIXED_CODE is a dev/test convenience code. Ignored when NODE_ENV=production.
OTP_FIXED_CODE=123456
```

## Commands you will need

Run from the repo root unless a step says `cd backend`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Deps present | `cd backend && npm ls express mongoose --depth=0` | both listed, no `UNMET` |
| No admin code yet (start) | `grep -rn "requireAdmin\|SystemSettings\|routes/admin" backend/src` | no matches (before Step 1) |
| Syntax check each new/modified file | `node --check backend/src/middleware/adminGuard.js && node --check backend/src/services/adminService.js && node --check backend/src/services/settingsService.js && node --check backend/src/models/SystemSettings.js && node --check backend/src/routes/admin.js && node --check backend/src/app.js && node --check backend/src/index.js && node --check backend/src/services/cargoService.js` | exit 0, no output |
| App + schema boot check (no DB needed) | `cd backend && node tmp-verify-019.js` | prints `ok` |
| Admin route count | `grep -c "router\.\(get\|post\|patch\|put\)" backend/src/routes/admin.js` | `17` |
| Mount count | `grep -c "app.use('/api" backend/src/app.js` | `9` |
| Mount order | `grep -n "app.use('/api/admin'\|app.use('/api'," backend/src/app.js` | admin line number < catch-all line number |
| Allowlist reuse | `grep -c "EDITABLE_FIELDS" backend/src/services/adminService.js` | `2` (import + use) |

Notes on the counts, derived mechanically from the planned file text: the
admin router contains exactly 17 route-registration lines (GET /users,
GET /users/:id, PATCH /users/:id, POST /users/:id/block,
POST /users/:id/unblock, GET /drivers, GET /drivers/:userId,
POST /drivers/:userId/verify, GET /cargo, GET /cargo/:id, PATCH /cargo/:id,
POST /cargo/:id/cancel, GET /overview, GET /documents,
POST /documents/:id/verify, GET /settings, PUT /settings). Its
`router.use(auth, requireAdmin);` line and
`module.exports = router;` line contain no `router.<verb>` token.
`app.use('/api` appears 9 times in the planned app.js: 7 existing role
routers + `/api/admin` + the `/api` catch-all. If your written file's
`grep -c` differs from the number derived here, re-simulate the grep against
your file text; do not adjust the number to match your file.

(TESTS DEFERRED to plan 026 — Jest suites for these endpoints are written
there. Do not create test files in 019. Do not run `npm test`.)

## Scope

**In scope** (the only files you should create or modify):

- `backend/src/middleware/adminGuard.js` (new — `requireAdmin`)
- `backend/src/models/SystemSettings.js` (new)
- `backend/src/services/adminService.js` (new)
- `backend/src/services/settingsService.js` (new)
- `backend/src/routes/admin.js` (new)
- `backend/src/services/cargoService.js` (modify — export `EDITABLE_FIELDS` only, one line)
- `backend/src/app.js` (modify — require + mount `/api/admin` before the catch-all)
- `backend/src/index.js` (modify — call `adminService.ensureAdminBootstrap()` after `connectDB()`)
- `backend/.env.example` (modify — add `ADMIN_BOOTSTRAP_PHONES=` with a comment)
- `plans/README.md` (status row for 019 + queue-row marker + dependency note)

**Out of scope** (do NOT touch, even though they look related):

- `backend/src/middleware/auth.js` — do not modify; `requireAdmin` runs
  *after* `auth` and reads `req.user.roles`.
- `backend/src/routes/auth.js`, `backend/src/services/otpService.js`,
  `backend/src/models/OtpChallenge.js` — auth flow is frozen.
- `backend/src/routes/cargo.js`, `driver.js`, `matching.js`, `offers.js`,
  `shipments.js`, `notifications.js` and their services (except the one-line
  `cargoService.js` export). Owner/driver self-service surfaces do not change.
- `backend/src/models/**` except the new `SystemSettings.js`. No field is
  added to User, Cargo, Document, DriverProfile, Vehicle, Offer, Shipment,
  ShipmentEvent, Notification.
- Any object/file storage for documents (documents remain metadata-only).
- `mobile/**`, `webapp/**` — no admin UI here (that is plans 020–022).
- Company/fleet models, ratings, payments, push, SMS, AuditLog collection.
- CORS lock-down, cookies, rate limiting on admin routes (JWT-only guard is
  the protection; admin routes are not public-facing).
- Custom admin role matrices / permissions per sub-panel (Phase 2 §4).
- User delete endpoint, user role editing, admin user creation via API.
- Enforcement of `SystemSettings` values in business logic (settings are
  stored/served only; wiring them into matching/cargo flows is a later slice).

## Git workflow

- **Branch: stay on `main` (operator override — ignore any `advisor/…` branch
  language elsewhere in this skill/plan).**
- Commit style (from this repo): `feat(019): add admin backend API`
  Earlier examples: `feat(018): add shipment lifecycle + notifications API`,
  `chore(018): mark plan DONE in index`
- Two commits: (1) implementation files, (2) index row flip. The plan file +
  README row from the planning run are already committed by the planning run.
- Do NOT push.

## Product / design decisions (locked for this plan)

These are not open questions for the executor. Implement them as written.

1. **Admin identity is the `admin` role.** A user is an admin iff
   `Array.isArray(req.user.roles) && req.user.roles.includes('admin')`.
   Non-admins (including drivers/owners) get `403 { error: 'forbidden' }` on
   every admin route. `auth` runs first (`router.use(auth, requireAdmin)`), so
   blocked/deleted users already fail with `401 unauthorized` before the role
   check.
2. **Nothing in Phase 1 issues admin JWTs through the app.** Admins are
   seeded by phone via the `ADMIN_BOOTSTRAP_PHONES` env var (comma-separated
   Iranian mobile numbers, e.g. `09121234567,+989123456789`). At bootstrap
   (`src/index.js`, after `connectDB()`), for each phone that normalizes via
   the existing `normalizeIranPhone` (`backend/src/utils/phone.js`):
   - `User.findOneAndUpdate({ phone }, { $setOnInsert: { phone, roles:
     ['admin'], phoneVerifiedAt: new Date() }, $addToSet: { roles: 'admin' },
     $set: { status: 'active' } }, { upsert: true, new: true,
     runValidators: true })` — grants `admin` idempotently, never removes
     other roles, never un-blocks a blocked user (blocked admins stay
     blocked; `auth` middleware enforces that at request time).
   - Phones that fail normalization are skipped with one console line
     (`admin bootstrap skipped invalid phone: <raw value>`); an empty env
     var means "no bootstrap". Bootstrap errors are caught, logged, and
     NEVER crash `main()` (admin seeding failure must not take down the API).
   - Do not log the seeded phones in production shape; log count only when
     `NODE_ENV === 'production'` (e.g. `admin bootstrap: 2 phones`).
   - This env var is not a secret, but keep it out of committed files except
     `.env.example` (empty default).
3. **Guard placement**: `backend/src/middleware/adminGuard.js` exports
   `requireAdmin` (mirrors `requireDriver` in `routes/driver.js` but checks
   `admin`). The admin router calls `router.use(auth, requireAdmin)` once at
   the top — all 17 endpoints are admin-only.
4. **Route map (all under `/api/admin`, all auth+admin gated):**

   | Method | Path | Purpose | Success |
   |--------|------|---------|---------|
   | GET | `/users` | list users; `?status=` (User.STATUSES) and/or `?role=` (User.ROLES) filters | `200 { users: [...], count }` |
   | GET | `/users/:id` | one user | `200 { user }` |
   | PATCH | `/users/:id` | edit allowlist `name`, `email`, `nationalId` only | `200 { user }` |
   | POST | `/users/:id/block` | `status='blocked'` | `200 { user }` |
   | POST | `/users/:id/unblock` | `status='active'` (only from `blocked`; `deleted` stays terminal) | `200 { user }` |
   | GET | `/drivers` | users holding `driver` role + their DriverProfile + `vehicleCount` | `200 { drivers: [...], count }` |
   | GET | `/drivers/:userId` | user + profile + vehicles + documents | `200 { user, profile, vehicles, documents }` |
   | POST | `/drivers/:userId/verify` | DriverProfile verification decision | `200 { profile }` |
   | GET | `/cargo` | all cargo; `?status=` (Cargo.STATUSES), `?ownerUserId=` | `200 { cargo: [...], count }` |
   | GET | `/cargo/:id` | one cargo (any owner) | `200 { cargo }` |
   | PATCH | `/cargo/:id` | edit `cargoService.EDITABLE_FIELDS` (draft/open/matched only) | `200 { cargo }` |
   | POST | `/cargo/:id/cancel` | cancel any draft/open/matched cargo | `200 { cargo }` |
   | GET | `/overview` | platform counters (see decision 8) | `200 { overview }` |
   | GET | `/documents` | document queue; `?status=` (pending/approved/rejected) | `200 { documents: [...], count }` |
   | POST | `/documents/:id/verify` | document decision | `200 { document }` |
   | GET | `/settings` | global settings | `200 { settings }` |
   | PUT | `/settings` | upsert global settings | `200 { settings }` |

5. **User edit allowlist is `name`, `email`, `nationalId` ONLY.** Never
   `phone`, `roles`, `status`, `phoneVerifiedAt` through PATCH (roles/status
   change only via the dedicated block/unblock actions; role changes are not
   an admin HTTP surface in this plan). Blocked/deleted users keep their
   records; `auth` middleware refuses them tokens (`401`).
6. **Self-protection**: an admin cannot block/unblock themselves →
   `403 { error: 'admin_self_action' }` (compare
   `String(target._id) === String(req.user._id)`).
7. **Verification decisions** (`decision` in body): value must be
   `'approved'` or `'rejected'`, else `400 { error: 'validation_error' }`.
   - Document: sets `verificationStatus`, `reviewedAt = new Date()`,
     `reviewerUserId = req.user._id`; `rejectionReason = body.reason` when
     rejected (empty string allowed but a `reason` MUST be provided —
     missing/empty reason on reject → `400 { error: 'validation_error' }`).
     Approve clears nothing else; re-review of an already-decided document is
     allowed (admin can correct).
   - Driver profile (`POST /drivers/:userId/verify`): profile must exist
     (`404 not_found`); sets `verificationStatus`, `verifiedAt` (now on
     approve, `null` stays untouched on reject), `rejectionReason`.
     No automatic privilege change (matching in 017 does not require an
     approved profile — that gate is a later slice if product asks).
8. **Overview shape** (counters only — no pagination):

   ```js
   {
     users: { total, drivers, cargoOwners, admins, blocked },
     cargo: { total, draft, open, matched, cancelled, completed },
     offers: { pending, accepted, rejected, withdrawn },
     shipments: {
       active,        // status in ['assigned','loading','in_transit','at_customs','delivered']
       completed,
       cancelled,
     },
   }
   ```

   Use `countDocuments` (8–10 cheap counts; no aggregation needed). This is
   the "transport requests overview" + "active trip monitoring" surface for
   021; a trips *list* endpoint is NOT in this plan.
9. **Admin cargo cancel cascade**: cancelling a cargo with status `matched`
   must also cancel its active shipment:
   `Shipment.updateOne({ cargoId, status: { $in: ['assigned','loading',
   'in_transit','at_customs','delivered'] } }, { status: 'cancelled' })`
   — then notify owner + driver via
   `notificationService.notifyShipment({ userId, type: 'shipment_status',
   shipment, cargo })` (never throws). Cancelling draft/open cargo touches
   no shipment (none can exist — shipments only exist for matched cargo).
   Shipment cancellation does NOT create a ShipmentEvent in this plan
   (ShipmentEvent creation is driver-flow surface; an admin-created
   `status_change` event type would need a new convention — parked, note it
   in Maintenance notes).
10. **`SystemSettings` model** (`backend/src/models/SystemSettings.js`),
    singleton-by-key pattern:

    ```js
    const SETTINGS_FIELDS = ['platformName', 'supportPhone', 'defaultCurrency', 'maxActiveCargoPerOwner', 'maintenanceMode'];
    // schema:
    // key:        String, default 'global', unique index (immutable identity)
    // platformName: String default ''   — display name of the platform
    // supportPhone: String default ''   — contact number shown in apps
    // defaultCurrency: String default 'IRR'
    // maxActiveCargoPerOwner: Number default 20, min 0
    // maintenanceMode: Boolean default false
    // statics: SETTINGS_FIELDS
    ```

    Plain unique index `{ key: 1 }`. No TTL, no timestamps needed — use
    `{ timestamps: true }` anyway to match every other model.
11. **Settings service** (`backend/src/services/settingsService.js`):
    - `getSettings()` → `SystemSettings.findOne({ key: 'global' })`; if
      null, return a detached defaults doc (do NOT upsert on read):
      `SystemSettings.findOneAndUpdate({ key: 'global' }, {}, { upsert:
      true, new: true, setDefaultsOnInsert: true })` is acceptable as the
      simplest correct read — use that.
    - `putSettings(body)` → allowlist `SystemSettings.SETTINGS_FIELDS`; type
      checks: strings for platformName/supportPhone/defaultCurrency,
      non-negative finite number for maxActiveCargoPerOwner, boolean for
      maintenanceMode; bad types → `400 { error: 'validation_error' }`.
      Then `findOneAndUpdate({ key: 'global' }, { $set: fields }, { upsert:
      true, new: true, runValidators: true })`.
    - `publicSettings(doc)` → `{ platformName, supportPhone, defaultCurrency,
      maxActiveCargoPerOwner, maintenanceMode, updatedAt }` (no `key`, no
      `id`, no `_id`).
12. **Admin service public projections** mirror existing `publicX()` helpers:
    - `publicAdminUser(user)`: `id, phone, name, email, nationalId, roles,
      status, phoneVerifiedAt, createdAt, updatedAt`.
    - Cargo reuses `cargoService.publicCargo` (admin sees the same shape —
      acceptable; ownerUserId is included).
    - Documents/vehicles reuse `driverService.publicDocument` /
      `driverService.publicVehicle` if they fit; otherwise local `publicX`
      mirrors with `id` string fields. Check `driverService.js` exports
      before writing new ones — do not duplicate what exists.
13. **Error map** for `sendAdminError` (routes/admin.js), derived from the
    codes the admin service throws:

    ```js
    const map = {
      invalid_user_id: 400,
      invalid_cargo_id: 400,
      invalid_document_id: 400,
      validation_error: 400,
      admin_self_action: 403,
      forbidden: 403,
      not_found: 404,
      invalid_status: 409,
    };
    ```

    Unknown codes → `500 { error: 'server_error' }`; Mongoose ValidationError
    → `400 { error: 'validation_error' }`; bad ObjectId casts are impossible
    because every id is asserted 24-hex before querying.
14. **Lists are capped at 100** (`MAX_LIST = 100`, sorted `createdAt: -1`)
    like every existing list endpoint. Pagination is a later slice (020/021
    webapp shows first page; add `?page=` later if needed).
15. 2-space indent, CommonJS, no TypeScript, no new npm dependencies.

## Steps

### Step 1: Pre-flight checks

```bash
git rev-parse --abbrev-ref HEAD                       # must print: main
grep -rn "requireAdmin\|SystemSettings\|routes/admin" backend/src   # must print nothing
cd backend && npm ls express mongoose --depth=0       # both listed, no UNMET
```

If an admin router/service already exists, STOP and report (plan already
executed or drifted).

### Step 2: Export `EDITABLE_FIELDS` from cargoService

In `backend/src/services/cargoService.js`, change the export block from:

```js
module.exports = {
  publicCargo,
  createCargo,
  listCargo,
  updateCargo,
  deleteCargo,
  publishCargo,
  cancelCargo,
};
```

to include `EDITABLE_FIELDS` (keep alphabetical-free original order; add it
as the first key):

```js
module.exports = {
  EDITABLE_FIELDS,
  publicCargo,
  createCargo,
  listCargo,
  updateCargo,
  deleteCargo,
  publishCargo,
  cancelCargo,
};
```

This is the ONLY change to that file. `require('../services/cargoService')`
in `routes/cargo.js` is unaffected by an extra export.

**Verify**: `node --check backend/src/services/cargoService.js` → exit 0.

### Step 3: SystemSettings model

Create `backend/src/models/SystemSettings.js` per decision 10 (match 011
model style: 2-space, `{ timestamps: true }`, statics, plain unique index on
`key`). No field named `id`.

**Verify**:

```bash
node --check backend/src/models/SystemSettings.js
cd backend && node -e "const M=require('./src/models/SystemSettings'); if (!M.schema.path('maintenanceMode')) process.exit(1); if (!M.SETTINGS_FIELDS || M.SETTINGS_FIELDS.length !== 5) process.exit(1); console.log('ok')"
```

→ `ok`.

### Step 4: adminGuard middleware

Create `backend/src/middleware/adminGuard.js`:

```js
function requireAdmin(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

module.exports = { requireAdmin };
```

**Verify**: `node --check backend/src/middleware/adminGuard.js` → exit 0.

### Step 5: adminService

Create `backend/src/services/adminService.js`. Conventions: copy `fail(code)`
and `assertId(id, code)` from `cargoService.js`/`shipmentService.js` (24-hex
regex). Functions:

- `listUsers({ status, role })` — validate against `User.STATUSES` /
  `User.ROLES` (bad values → `validation_error`); build query
  (`{ status }`, `{ roles: role }`); `User.find(query).sort({ createdAt:
  -1 }).limit(100)`.
- `getUser({ id })` — assert 24-hex (`invalid_user_id`), `User.findById`,
  null → `not_found`.
- `updateUser({ id, body })` — getUser; allowlist `['name', 'email',
  'nationalId']`; `Object.assign(user, picked); await user.save();`.
- `setUserStatus({ id, action, adminUserId })` — getUser; `admin_self_action`
  when `String(user._id) === String(adminUserId)`; `block` →
  `user.status = 'blocked'`; `unblock` → only if `user.status === 'blocked'`
  set `'active'`, else `invalid_status`; save; return user.
- `listDrivers()` — `User.find({ roles: 'driver' }).sort({ createdAt: -1
  }).limit(100)`; `DriverProfile.find({ userId: { $in: userIds } })`;
  `Vehicle.countDocuments` per driver (a loop over ≤100 ids is acceptable; no
  aggregation needed). Return array of `{ user, profile, vehicleCount }`
  (profile may be null for a role-granted user with no profile yet).
- `getDriverDetail({ userId })` — userId must be 24-hex
  (`invalid_user_id`); user must exist AND hold `driver` role (else
  `not_found` — do not leak role absence vs user absence); attach profile
  (nullable), `Vehicle.find({ ownerUserId: userId }).sort({ createdAt: -1
  })`, `Document.find({ userId }).sort({ createdAt: -1 }).limit(100)`.
- `verifyDriverProfile({ userId, decision, reason })` — validate decision
  (decision 7); load profile by userId (`404 not_found` if absent); set
  `verificationStatus`, on approve `verifiedAt = new Date()` and clear
  `rejectionReason = ''`, on reject `rejectionReason = reason || ''` and
  leave `verifiedAt` untouched; save; return profile.
- `listCargoAdmin({ status, ownerUserId })` — validate status against
  `Cargo.STATUSES`; ownerUserId if provided must be 24-hex
  (`invalid_user_id`); `Cargo.find(query).sort({ createdAt: -1 }).limit(100)`.
- `getCargoAdmin({ id })` — 24-hex check (`invalid_cargo_id`);
  `Cargo.findById`, null → `not_found`.
- `updateCargoAdmin({ id, body })` — getCargoAdmin; `invalid_status` unless
  `status` is `draft`, `open`, or `matched`; pick fields via
  `cargoService.EDITABLE_FIELDS` (imported from Step 2) with the same
  hasOwnProperty pattern as `cargoService.pickEditableFields`; reuse
  `cargoService` timing rule? No — write a local `assertTiming` copy only if
  `cargoService` does not export one (it does not; simplest is to skip
  deep-timing validation in admin edit and let Mongoose validators catch
  enums — but DO check `deliverBy >= pickupAt` when both present, mirroring
  `cargoService.assertTiming` inline, ~4 lines).
- `cancelCargoAdmin({ id })` — getCargoAdmin; `invalid_status` unless status
  in `['draft','open','matched']`; set `status = 'cancelled'`; save; if the
  previous status was `matched`, run the shipment cascade per decision 9
  (updateOne + notify both participants via `notifyShipment`, type
  `shipment_status`); return cargo.
- `overview()` — counters per decision 8 via `countDocuments`.
- `listDocuments({ status })` — validate status against
  `Document.VERIFICATION` (undefined → all); `Document.find(query).sort({
  createdAt: -1 }).limit(100)`.
- `verifyDocument({ id, decision, reason, reviewerUserId })` — 24-hex
  (`invalid_document_id`); `Document.findById` (null → `not_found`);
  decision rules per decision 7; save; return document.
- `ensureAdminBootstrap()` — per decision 2.
- `publicAdminUser(user)` — per decision 12.

**Verify**: `node --check backend/src/services/adminService.js` → exit 0.

### Step 6: settingsService

Create `backend/src/services/settingsService.js` per decision 11 (get /
put / publicSettings). Reuse the same `fail(code)` pattern; throw
`validation_error` for bad types.

**Verify**: `node --check backend/src/services/settingsService.js` → exit 0.

### Step 7: admin router

Create `backend/src/routes/admin.js`. Structure (mirror `routes/driver.js` +
`routes/cargo.js`):

```js
const express = require('express');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminGuard');
const adminService = require('../services/adminService');
const settingsService = require('../services/settingsService');
const cargoService = require('../services/cargoService');
const driverService = require('../services/driverService');

const router = express.Router();

function sendAdminError(res, err) { /* map per decision 13 */ }

router.use(auth, requireAdmin);

// 17 handlers exactly as the route map in decision 4.
// GET /settings + PUT /settings delegate to settingsService.
// Everything else delegates to adminService; responses wrap the publicX shapes:
//   users → { user }, list → { users, count }, etc.

module.exports = router;
```

Response envelopes (locked): single-resource keys `user`, `profile`,
`vehicle`(n/a here), `document`, `cargo`, `settings`, `overview`; list keys
plural with `count` — matching existing routers (`{ cargo, count }` in
cargo.js, `{ documents, count }` in driver.js).

**Verify**:

```bash
node --check backend/src/routes/admin.js
grep -c "router\.\(get\|post\|patch\|put\)" backend/src/routes/admin.js   # → 17
```

If the count is not 17, re-simulate the grep against your file text and fix
the FILE (not the number) — you missed or duplicated a route.

### Step 8: Mount in app.js + bootstrap in index.js

`backend/src/app.js`:

1. After `const notificationRoutes = require('./routes/notifications');`
   add: `const adminRoutes = require('./routes/admin');`
2. After the `app.use('/api/notifications', notificationRoutes);` line add:

```js
  app.use('/api/admin', adminRoutes);
```

(Admin mount MUST be before the `/api` catch-all. Order relative to the other
role routers does not matter — paths are disjoint — but keep it after
notifications to read as "newest last".)

`backend/src/index.js` — inside `main()`, immediately after
`await connectDB();` add:

```js
  try {
    await adminService.ensureAdminBootstrap();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`admin bootstrap failed: ${err.message}`);
  }
```

with `const adminService = require('./services/adminService');` added to the
requires. Bootstrap must never crash the server (decision 2).

`backend/.env.example` — append:

```
# Comma-separated Iranian phone numbers granted the admin role at boot (idempotent).
ADMIN_BOOTSTRAP_PHONES=
```

**Verify** (mount order + count):

```bash
grep -c "app.use('/api" backend/src/app.js                          # → 9
grep -n "app.use('/api/admin'" backend/src/app.js                    # admin line number
grep -n "app.use('/api'," backend/src/app.js                         # catch-all line number — MUST be greater
```

### Step 9: Boot verification script (pure node, no DB)

Create `backend/tmp-verify-019.js` (temporary; DELETE it in Step 10):

```js
// Boot-shape verification for plan 019 — no MongoDB required.
const { createApp } = require('./src/app');
const adminService = require('./src/services/adminService');
const settingsService = require('./src/services/settingsService');
const SystemSettings = require('./src/models/SystemSettings');
const cargoService = require('./src/services/cargoService');

const app = createApp();
if (typeof app !== 'function') throw new Error('app');
if (typeof adminService.listUsers !== 'function') throw new Error('listUsers');
if (typeof adminService.overview !== 'function') throw new Error('overview');
if (typeof adminService.ensureAdminBootstrap !== 'function') throw new Error('ensureAdminBootstrap');
if (typeof settingsService.getSettings !== 'function') throw new Error('getSettings');
if (typeof settingsService.putSettings !== 'function') throw new Error('putSettings');
if (cargoService.EDITABLE_FIELDS.length !== 9) throw new Error('EDITABLE_FIELDS');
if (SystemSettings.SETTINGS_FIELDS.length !== 5) throw new Error('SETTINGS_FIELDS');
console.log('ok');
```

Run: `cd backend && node tmp-verify-019.js` → `ok`.

### Step 10: Commit, flip index, clean up

1. `rm backend/tmp-verify-019.js`.
2. `git add backend/src/middleware/adminGuard.js backend/src/models/SystemSettings.js backend/src/services/adminService.js backend/src/services/settingsService.js backend/src/routes/admin.js backend/src/services/cargoService.js backend/src/app.js backend/src/index.js backend/.env.example`
   → commit `feat(019): add admin backend API`.
3. `plans/README.md`: set the 019 row to `DONE (executed by pipeline)` and
   append the implementation summary to the dependency note.
4. `git add plans/README.md` → commit `chore(019): mark plan DONE in index`.
5. Never push. If a commit fails (identity/hook), leave the tree dirty and
   report it.

## Test plan

**DEFERRED to plan 026** (operator override — Jest suites for admin
endpoints are written and run there; mongodb-memory-server setup is part of
026's scope). Do not create test files and do not run `npm test` in this
plan. 026's suite should cover, at minimum: non-admin → 403 on every route;
admin full happy paths; self-block rejection; unblock-from-deleted → 409;
reject-without-reason → 400; matched-cargo cancel cascade flips the
shipment; settings PUT round-trip; bootstrap idempotency.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --check` exits 0 for every new/modified `.js` file listed in Step 2/4–8
- [ ] `cd backend && node tmp-verify-019.js` prints `ok` (before deleting the script)
- [ ] `grep -c "router\.\(get\|post\|patch\|put\)" backend/src/routes/admin.js` → `17`
- [ ] `grep -c "app.use('/api" backend/src/app.js` → `9`, with the
      `/api/admin` mount line ABOVE the `/api` catch-all line
- [ ] `grep -c "EDITABLE_FIELDS" backend/src/services/adminService.js` → `2`
- [ ] `grep -rn "requireAdmin\|SystemSettings\|routes/admin" backend/src` shows
      only the new files + app.js/index.js wiring
- [ ] `npm ls` in backend shows no new/changed dependencies vs. recon
      (`express`, `mongoose` and the existing set only)
- [ ] No files outside the in-scope list are modified (`git status` — after
      excluding `.pipeline.lock`, which is gitignored)
- [ ] Two commits exist (`feat(019): …`, `chore(019): …`), no push
- [ ] `plans/README.md` status row for 019 reads `DONE (executed by pipeline)`

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the "Current state" locations doesn't match the excerpts
  (drift since `a214096`) — e.g. `auth` middleware no longer sets `req.user`,
  or `app.js` no longer has the 7-router + catch-all shape.
- An admin route/service/model already exists in `backend/src/` (plan already
  executed or a conflicting implementation landed).
- `cargoService.js` no longer contains `EDITABLE_FIELDS` exactly as excerpted.
- `User.ROLES` no longer contains `'admin'` or `User.STATUSES` no longer
  contains `'blocked'` (the 011 model changed).
- A step's verification fails twice after a reasonable fix attempt.
- The implementation appears to require touching an out-of-scope file
  (especially `middleware/auth.js`, `routes/auth.js`, or any model besides
  creating `SystemSettings.js`).
- `notificationService.notifyShipment` signature changed (decision 9 cascade
  depends on it).

## Maintenance notes

- **Settings enforcement is intentionally deferred**: `maxActiveCargoPerOwner`
  and `maintenanceMode` are stored/served only. A later plan (022 settings UI
  or a Phase 1.5 slice) wires them into `cargoService`/matching. Reviewers of
  that slice must add the read-side wiring, not new endpoints.
- **Shipment cancel cascade does not write a ShipmentEvent** (decision 9).
  If the mobile driver app later shows a cancelled trip without a matching
  event, that is why — an admin-surface event write would need a convention
  for `actorUserId`, which ShipmentEvent does not model. Defer to a dedicated
  slice rather than overloading `note`.
- **Admin bootstrapping is env-driven** (`ADMIN_BOOTSTRAP_PHONES`). If 020's
  admin login screen can't sign in, the first check is that the env var was
  set and the server restarted. A promote/demote admin-role HTTP surface is
  intentionally absent (roadmap RBAC matrix is Phase 2 §4).
- Plan 021/022 (admin webapp) will consume exactly these 17 endpoints —
  response envelope shapes are contractual; do not rename `users`/`cargo`/
  `documents`/`overview`/`settings` keys casually.
- 026's test pass must not need new models for these endpoints; if it wants
  isolated admin tests, set `ADMIN_BOOTSTRAP_PHONES=+989120000000` in the
  test env rather than manipulating roles directly.

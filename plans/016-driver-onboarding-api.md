# Plan 016: Add driver onboarding REST API — profile, vehicles, document stubs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0dee85d..HEAD -- backend/src/app.js backend/src/middleware/auth.js backend/src/models/DriverProfile.js backend/src/models/Vehicle.js backend/src/models/Document.js backend/src/models/User.js backend/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates: `backend/src/middleware/auth.js` exports `auth` (014 present), `backend/src/app.js` mounts `/api/auth` and `/api/cargo` **before** the `/api` 404 placeholder (014/015 present), `DriverProfile` has a unique index on `userId`, `Vehicle` has `VEHICLE_TYPES` + a unique `plate` index, and `Document` has `KINDS` with every doc always defaulting to `verificationStatus: 'pending'` (011 present). Do not STOP just because later commits exist.

## Operator overrides (from the pipeline prompt — these REPLACE conflicting parts of the improve skill and of this plan's Git workflow / test sections)

1. **GIT POLICY (COMMIT-ON-MAIN, locked 2026-09-03)**: stay on the current branch (`main`). No branch creation, no `checkout`/`switch`, no worktree, no push. Commits ARE allowed and expected: after finishing, `git add` exactly this plan's in-scope files (plus the `plans/README.md` row edit) and commit `feat(016): add driver onboarding API`, then a final `chore(016): mark plan DONE in index` commit when the row is flipped. Never commit `.env` files or secrets; `.pipeline.lock` is gitignored. If git identity or a hook fails, leave changes uncommitted and note it in the report instead of fighting git.
2. **TESTS DEFERRED**: never run `npm test` / Jest, never start dev servers or the API process (nothing long-running may survive the run). Allowed verification: `node --check` / `node -c` syntax checks, `npm ls` to confirm installed deps, grep/search checks, and this plan's pure-node verify one-liners. The Jest suite in Step 6 is **written now but executed in plan 026** ("deferred to plan 026") — do not treat a skipped test run as a STOP condition.
3. `npm install` is allowed only inside `backend/` and only for dependencies the plan explicitly names — this plan names **none** (zero new dependencies).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/014-phone-otp-auth.md (DONE — `auth` middleware + Bearer JWT exist; OTP verify upserts users with default role `['cargo_owner']`, so driver registration must grant the `driver` role itself). Does **not** depend on 015 (`/api/cargo` exists but is not consumed here) or 013 (`Cargo.transportMode` is not read here).
- **Category**: direction
- **Planned at**: commit `0dee85d`, 2026-09-03

## Why this matters

V6 Phase 1 §3 (Drivers Section) has no HTTP surface yet. This plan implements the **onboarding half** of §3:

- **Driver registration** — allows new truck drivers to register on the platform
- **Driver information completion** — allows drivers to complete their profiles and info
- **Registering vehicle specifications** — allows drivers to input vehicle type, plate, and load capacities
- **Managing vehicle specifications** — allows drivers to update or edit their truck parameters
- **Uploading vehicle licenses** — allows drivers to submit copies of truck registrations and safety cards
- **Uploading driver licenses** — allows drivers to submit digital copies of driving licenses
- **Submitting required documents** — allows drivers to upload national identity cards and professional cards

The 011 models already exist for all of this: `DriverProfile` (one per user — unique `userId` index — with `licenseNumber`, `professionalCardNumber`, `verificationStatus: pending|approved|rejected`), `Vehicle` (road asset: `vehicleType`, globally unique `plate`, `capacityWeightKg`/`capacityVolumeM3`, `year`, `status: active|inactive`), and `Document` (metadata-only stub: `kind`, optional `vehicleId`, `verificationStatus` always starting `pending`). 014 added JWT auth (`auth` middleware sets `req.user`). What is missing is the driver-scoped REST layer: upsert profile, vehicle CRUD, document stub create/list/delete.

Roadmap §3 items this plan does **not** implement:

- Viewing matching transport requests / receiving direct offers / managing proposals (§3 — needs 017)
- Accepting/rejecting requests, viewing cargo parameters and route destinations (§3 — needs 015+017)
- Managing active trip status, logging checkpoints (§3 — needs 018)
- Viewing past trip history (§3 — needs 018); **viewing earnings history is Phase 2** (payments parked)
- Document approve/reject (admin verification queue — plan 019)
- Real file upload / object storage (this plan stores metadata only — `storageKey` stays an optional string)
- SMS, payments, KYC, GPS streaming, ratings, companies/fleet (Phase 2 — parked)

## Current state

Repo layout at plan time (`0dee85d` on `main`):

```
backend/
  src/app.js                  ← helmet/cors/json + /health + /api/auth + /api/cargo mounts + /api 404 fallback
  src/middleware/auth.js      ← Bearer JWT → req.user (014)
  src/routes/auth.js          ← request-otp / verify-otp / me (014)
  src/routes/cargo.js         ← owner-scoped cargo CRUD (015) — pattern exemplar
  src/services/cargoService.js← 015 service — pattern exemplar
  src/models/DriverProfile.js ← the model this plan serves (one per user)
  src/models/Vehicle.js       ← road asset, unique plate
  src/models/Document.js      ← metadata-only verification stub
  src/models/User.js          ← roles: ['cargo_owner','driver','admin']
  test/__tests__/cargo.routes.test.js ← structural test exemplar (supertest + createApp)
  package.json                ← deps: bcryptjs cors dotenv express express-rate-limit helmet jsonwebtoken mongoose
```

`backend/src/models/DriverProfile.js` today (full file — 27 lines, unchanged by this plan):

```js
const mongoose = require('mongoose');

const VERIFICATION = ['pending', 'approved', 'rejected'];

const driverProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    licenseNumber: { type: String, default: '', trim: true },
    professionalCardNumber: { type: String, default: '', trim: true },
    verificationStatus: { type: String, enum: VERIFICATION, default: 'pending' },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

driverProfileSchema.index({ userId: 1 }, { unique: true });
driverProfileSchema.index({ verificationStatus: 1 });

driverProfileSchema.statics.VERIFICATION = VERIFICATION;

module.exports = mongoose.model('DriverProfile', driverProfileSchema, 'driver_profiles');
```

Note the collection name is `driver_profiles` (not the default `driverprofiles`).

`backend/src/models/Vehicle.js` today (full file — 35 lines, unchanged):

```js
const mongoose = require('mongoose');

const VEHICLE_TYPES = ['truck', 'trailer', 'van', 'reefer', 'tanker', 'other'];
const STATUSES = ['active', 'inactive'];

const vehicleSchema = new mongoose.Schema(
  {
    driverProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DriverProfile',
      required: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    vehicleType: { type: String, enum: VEHICLE_TYPES, default: 'truck' },
    plate: { type: String, required: true, trim: true, uppercase: true },
    capacityWeightKg: { type: Number, default: 0, min: 0 },
    capacityVolumeM3: { type: Number, default: 0, min: 0 },
    year: { type: Number, default: null },
    status: { type: String, enum: STATUSES, default: 'active' },
  },
  { timestamps: true }
);

vehicleSchema.index({ plate: 1 }, { unique: true });
vehicleSchema.index({ driverProfileId: 1 });
vehicleSchema.index({ ownerUserId: 1 });

vehicleSchema.statics.VEHICLE_TYPES = VEHICLE_TYPES;
vehicleSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Vehicle', vehicleSchema);
```

`plate` is **globally unique** (platform-wide registry key). `uppercase: true` only affects ASCII letters — Persian plate text is stored as given.

`backend/src/models/Document.js` today (full file — 47 lines, unchanged):

```js
const mongoose = require('mongoose');

const KINDS = [
  'driving_license',
  'vehicle_registration',
  'safety_card',
  'national_id',
  'professional_card',
  'other',
];
const VERIFICATION = ['pending', 'approved', 'rejected'];

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null,
    },
    kind: { type: String, enum: KINDS, required: true },
    storageKey: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    verificationStatus: { type: String, enum: VERIFICATION, default: 'pending' },
    reviewedAt: { type: Date, default: null },
    reviewerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, kind: 1 });
documentSchema.index({ verificationStatus: 1 });

documentSchema.statics.KINDS = KINDS;
documentSchema.statics.VERIFICATION = VERIFICATION;

module.exports = mongoose.model('Document', documentSchema);
```

There is **no file/binary field** — `storageKey`/`originalName`/`mimeType` are plain strings. This plan creates metadata stubs only.

`backend/src/models/User.js` — the roles this plan's gate reads (excerpt):

```js
const ROLES = ['cargo_owner', 'driver', 'admin'];
...
    roles: {
      type: [String],
      enum: ROLES,
      default: () => ['cargo_owner'],
```

`backend/src/services/otpService.js` (014, unchanged) — why `POST /profile` must grant the role (excerpt from `verifyOtp`):

```js
  if (!user) {
    user = await User.create({ phone, phoneVerifiedAt: now, roles: ['cargo_owner'] });
  } else if (!user.phoneVerifiedAt) {
```

Every user created through the OTP loop starts as `cargo_owner` only. **Nobody ever has the `driver` role until an endpoint grants it** — that endpoint is `POST /api/driver/profile` in this plan.

`backend/src/middleware/auth.js` (014, unchanged) — sets `req.user`, requires `status === 'active'`, exports `{ auth }`:

```js
async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'unauthorized' });
  // ... JWT_SECRET check → 500 server_misconfigured; jwt.verify → 401 ...
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = user;
  return next();
}
module.exports = { auth };
```

`backend/src/app.js` today (the `/api` section — mounts auth and cargo, then the 404 fallback):

```js
const authRoutes = require('./routes/auth');
const cargoRoutes = require('./routes/cargo');
// ...
  app.use('/api/auth', authRoutes);

  app.use('/api/cargo', cargoRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
```

`backend/src/routes/cargo.js` (015) — the conventions this plan copies (do not re-invent):

```js
const router = express.Router();

function requireCargoOwner(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('cargo_owner')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

function sendCargoError(res, err) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error' });
  }
  const code = err && err.code;
  const map = { /* code → status, unknown → 500 server_error */ };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

router.use(auth, requireCargoOwner);
// every async handler: try { ... } catch (err) { return sendCargoError(res, err); }
// serializers turn _id → id strings; list endpoints return { <plural>: [...], count }
```

`backend/test/__tests__/cargo.routes.test.js` (015) — the structural test exemplar this plan's suite copies:

```js
require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');

const PHONE_OWNER = '09121230001'; // canonical +989****0001
const canon = (phone) => `+98${phone[1]}****${phone.slice(-4)}`;
const FIXED_CODE = '123456';

describe('cargo draft CRUD', () => {
  const app = createApp();
  // beforeAll: JWT_SECRET='test-secret-do-not-use', OTP_FIXED_CODE='123456', NODE_ENV='test'
  // register(phone): request-otp → verify-otp → { token, userId } (user upserted as cargo_owner)
  // registerDriver(phone): User.create({ phone: canon(phone), roles: ['driver'] }) THEN the OTP loop
});
```

Phone canonicalization (`backend/src/utils/phone.js`) maps `09121230001` → `+989****0001`-style masked strings via the test's `canon()` helper — tests pre-seed users with the same masked form so `verifyOtp` finds them by phone.

`backend/package.json` — test config: `jest --runInBand --forceExit`, `testMatch: **/test/__tests__/**/*.test.js`, `testTimeout: 30000`, `globalSetup: ./test/globalSetup.js` (mongodb-memory-server). `backend/test/setup.js` clears **all collections after each test** (`afterEach` → `deleteMany({})`), so every test creates its own users/vehicles/documents. Note: the README says plan 026 fixes mongodb-memory-server on this WSL machine — the suite is written now, run later.

Dependencies today: `bcryptjs`, `cors`, `dotenv`, `express`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `mongoose`. **This plan needs zero new packages.**

V6 bullets this plan covers (`resources/features-roadmap.md`, Phase 1 §3, verbatim):

```
### 3. Drivers Section (بخش رانندگان)
*   **Driver registration**: Allows new truck drivers to register on the platform [16].
*   **Driver information completion**: Allows drivers to complete their profiles and info [16].
*   **Registering vehicle specifications**: Allows drivers to input vehicle type, plate, and load capacities [16].
*   **Managing vehicle specifications**: Allows drivers to update or edit their truck parameters [16].
*   **Uploading vehicle licenses**: Allows drivers to submit copies of truck registrations and safety cards [16].
*   **Uploading driver licenses**: Allows drivers to submit digital copies of driving licenses [16].
*   **Submitting required documents**: Allows drivers to upload national identity cards and professional cards [16].
```

"Uploading" is served here as **metadata stubs** — the Document model has no binary field and no object store exists yet; `storageKey` stays an optional string. Real uploads are a later plan.

## Commands you will need

Run from the **repo root** unless a step says `cd backend`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 0dee85d..HEAD -- backend/src/app.js backend/src/middleware/auth.js backend/src/models/DriverProfile.js backend/src/models/Vehicle.js backend/src/models/Document.js backend/src/models/User.js backend/package.json` | empty, or only unrelated later commits — re-read excerpts if not empty |
| Confirm 011 models | `cd backend && node -e "const P=require('./src/models/DriverProfile');const V=require('./src/models/Vehicle');const D=require('./src/models/Document');const U=require('./src/models/User');console.log(V.VEHICLE_TYPES.length, D.KINDS.length, P.schema.path('verificationStatus').enumValues.join(','), U.ROLES.join(','))"` | `6 6 pending,approved,rejected cargo_owner,driver,admin` |
| Confirm no driver routes yet | `grep -rln "driver" backend/src/routes backend/src/services` | no output |
| Confirm deps installed | `cd backend && npm ls express mongoose jsonwebtoken` | all listed, no `UNMET` |
| Syntax | `cd backend && node --check src/app.js && node --check src/services/driverService.js && node --check src/routes/driver.js && node --check test/__tests__/driver.routes.test.js` | exit 0 (run `node --check` per file) |
| App still boots | `cd backend && node -e "const {createApp}=require('./src/app'); const a=createApp(); console.log(typeof a.listen==='function'?'ok':'fail')"` | `ok` |
| Jest suite | `cd backend && npm test` | **DEFERRED to plan 026 — do not run (operator override)** |

Do **not** run `npm install` at the repo root (no root `package.json`). Do **not** run `npm install` inside `backend/` at all for this plan — nothing new is needed.

## Suggested executor toolkit

- Product checklist: `resources/features-roadmap.md` Phase 1 §3 (the seven bullets quoted above).
- Match the patterns in `backend/src/routes/cargo.js` + `backend/src/services/cargoService.js` (router shape, error mapper, async try/catch, serializers, not-found hiding, allowlist field picking). Copy patterns only from `$HOME/projects/v5/backend` if a middleware composition reference is needed — do **not** copy cookies, Redis, BullMQ, or billing.
- Mongoose notes: no schema field named `id` — serialize `_id` as `id` via a helper; `Model.create` for inserts; `doc.save()` runs validators on updates; duplicate-key errors arrive as `err.code === 11000`.

## Scope

**In scope** (the only files you should create or modify):

- `backend/src/services/driverService.js` (new — all profile/vehicle/document logic)
- `backend/src/routes/driver.js` (new — the REST layer + role gate)
- `backend/src/app.js` (mount `/api/driver` between the cargo mount and the `/api` 404 fallback — nothing else changes)
- `backend/test/__tests__/driver.routes.test.js` (new — **written now, executed in 026**)
- `plans/README.md` (status row for 016 + dependency note; queue row already marked `(→ 016)` when this plan was written)

**Out of scope** (do NOT touch, even though they look related):

- `backend/src/models/DriverProfile.js`, `Vehicle.js`, `Document.js`, `User.js`, and every other model — **no schema changes** (no new fields, no new enums, no index changes). `User.roles` already contains `driver`.
- `backend/src/middleware/auth.js`, `backend/src/routes/auth.js`, `backend/src/services/otpService.js` — 014 is done; do not refactor it. The role gate lives **inside `routes/driver.js`**, not in the middleware.
- `backend/src/routes/cargo.js`, `backend/src/services/cargoService.js` — 015 is done; do not touch it.
- `backend/package.json` / lockfile — zero new dependencies.
- No matching/offers (017), no shipments/events/notifications (018), no admin routes (019), no verification approve/reject (019), no role management UI.
- No file upload, no multipart handling, no object storage, no `storageKey` generation.
- `mobile/`, `webapp/`, `admin/` — nothing client-side exists for this yet.
- Cookies, CORS changes, `express-rate-limit` on these routes, JSON body-cap changes, `/health` changes.
- SMS, payments, KYC, GPS streaming (Phase 2).

## Git workflow (operator override replaces the branch instructions)

- **Stay on the current branch (`main`).** No branch creation, no checkout/switch, no worktree, no push.
- Commit style (from this repo): `feat(016): add driver onboarding API`, then `chore(016): mark plan DONE in index` after the README row flip.
- `git add` exactly the in-scope files + `plans/README.md`. Never `git add` `.env*` or `.pipeline.lock` (already gitignored).

## Product / design decisions (locked for this plan)

These are not open questions for the executor. Implement them as written.

1. **Identity comes from the token, never the body.** `userId`/`ownerUserId`/`driverProfileId` are always derived from `req.user._id` (or the driver's own profile). `grep req.body.userId` and `grep body.ownerUserId` must find nothing in the new files. The body cannot set `verificationStatus`, `verifiedAt`, `reviewerUserId`, `rejectionReason`, `status` (on vehicle **create**), or `driverProfileId`.
2. **Driver registration grants the role.** `POST /api/driver/profile` is reachable by **any active authenticated user** (no role gate) and does two things: `User.updateOne({ _id }, { $addToSet: { roles: 'driver' } })` (idempotent) and upserts the `DriverProfile`. This is the only path to the `driver` role in Phase 1. Self-service registration is intentional; verification is 019's job.
3. **Role gate placement.** `router.use(auth)` first; `POST /profile` is defined **before** `router.use(requireDriver)`, so only `POST /profile` is open. Every route defined after `router.use(requireDriver)` requires `req.user.roles` to include `'driver'`, else `403 { error: 'forbidden' }` — implemented as a `requireDriver(req, res, next)` helper **inside `routes/driver.js`** (do not edit `middleware/auth.js`). Users may hold both `cargo_owner` and `driver`; both route files stay independent.
4. **Profile is a singleton per user.** Unique index on `userId` (011). `POST /profile` returns `201` on first create, `200` on update of the existing profile. On an upsert race (`err.code === 11000` from the unique index), re-fetch and update instead of erroring. `GET /profile` with no profile yet → `404 not_found`.
5. **Endpoints** (all under `/api/driver`):

| Method + path | Role gate | Success | Purpose |
|---|---|---|---|
| `POST /api/driver/profile` | auth only | `201 { profile }` first time, `200 { profile }` on update | register / complete profile; grants `driver` role |
| `GET /api/driver/profile` | driver | `200 { profile }` | own profile |
| `POST /api/driver/vehicles` | driver | `201 { vehicle }` | register a vehicle (own profile must exist) |
| `GET /api/driver/vehicles` | driver | `200 { vehicles: [...], count }` | list own vehicles, newest first, cap 100 |
| `PATCH /api/driver/vehicles/:id` | driver | `200 { vehicle }` | update own vehicle (plate NOT editable) |
| `DELETE /api/driver/vehicles/:id` | driver | `200 { ok: true }` | hard-delete own vehicle |
| `POST /api/driver/documents` | driver | `201 { document }` | create a metadata stub, always `pending` |
| `GET /api/driver/documents` | driver | `200 { documents: [...], count }` | list own documents, newest first, optional `?kind=`, cap 100 |
| `DELETE /api/driver/documents/:id` | driver | `200 { ok: true }` | delete own document while still `pending` |

6. **Vehicles require a profile.** `POST /vehicles` needs the caller's `DriverProfile` for `driverProfileId`; if it does not exist → `400 { error: 'profile_required' }`. (Defensive — via HTTP the role gate already implies a profile exists, because only `POST /profile` grants the role. Keep the guard in the service anyway.)
7. **Plate conflicts are 409, not validation errors.** `plate` is globally unique (011 index). On `Vehicle.create` duplicate-key (`err.code === 11000`) → `409 { error: 'plate_in_use' }`. Everything else Mongoose rejects (missing plate, bad `vehicleType`, bad `status`, negative capacity, non-numeric year) → `400 validation_error`.
8. **Vehicle edit rules.** `PATCH /vehicles/:id` accepts exactly: `vehicleType`, `capacityWeightKg`, `capacityVolumeM3`, `year`, `status` (`active`/`inactive` — a driver can temporarily deactivate a truck). `plate` is **not editable** (it is the registry key; changing it = delete + re-register, which re-runs uniqueness). `driverProfileId`/`ownerUserId` never editable.
9. **Vehicle create is always `active`.** `POST /vehicles` ignores a body `status`; the model default `active` applies. Re-activation after `inactive` goes through PATCH.
10. **Document stubs are metadata-only and always start `pending`.** `POST /documents` accepts exactly: `kind` (required, must be in `Document.KINDS`), `vehicleId` (optional), `storageKey`, `originalName`, `mimeType` (optional strings). Forces `verificationStatus: 'pending'`, `reviewerUserId: null`, `reviewedAt: null`, `rejectionReason: ''` regardless of body. If `vehicleId` is provided: malformed (not 24 hex chars) → `400 invalid_vehicle_id`; well-formed but not owned by the caller → `404 not_found` (do not leak other drivers' vehicles).
11. **Documents can be deleted only while `pending`.** `DELETE /documents/:id` on a `pending` own document → `200 { ok: true }`; after approval/rejection → `409 { error: 'document_locked' }` (verified documents are compliance records until 019 provides admin flows). Deleting a vehicle does **not** cascade-delete its documents (documents keep a dangling `vehicleId: <deleted>` — acceptable; noted in Maintenance).
12. **Not-found hiding.** A vehicle/document that exists but belongs to someone else is `404 { error: 'not_found' }` — identical to a missing id. Never `403` for foreign resources (role gate 403 happens first only when the caller lacks the `driver` role entirely).
13. **Error JSON** mirrors 014/015: `{ error: '<snake_case>' }`, no `err.message` leakage. Mapping (in `sendDriverError` in the route file):

| `err.code` / condition | HTTP |
|---|---|
| `invalid_vehicle_id` / `invalid_document_id` (malformed ObjectId — 24 hex chars enforced in the service before any query) | 400 |
| `validation_error` (missing plate/kind, bad `vehicleType`/`status`/`kind` enums, negative capacities, bad `?kind=` filter) **or** Mongoose `ValidationError` | 400 |
| `profile_required` (vehicle create without a profile) | 400 |
| `forbidden` (not `driver`) | 403 |
| `not_found` (missing **or** not owned) | 404 |
| `plate_in_use` (duplicate plate) | 409 |
| `document_locked` (delete of non-pending document) | 409 |
| anything else | 500 `server_error` |

14. **List shapes and serialization.** Lists return `{ <plural>: [...], count: <array length> }`, sorted `createdAt: -1`, `.limit(100)`, no pagination params. `GET /documents?kind=` is hand-validated against `Document.KINDS` (400 `validation_error` on bogus — no DB round-trip). Serializers (`publicProfile`, `publicVehicle`, `publicDocument` in the service — do not add extras):

```js
// publicProfile
{ id, userId, licenseNumber, professionalCardNumber, verificationStatus,
  verifiedAt, rejectionReason, createdAt, updatedAt }              // all ids: ObjectId.toString()
// publicVehicle
{ id, driverProfileId, ownerUserId, vehicleType, plate, capacityWeightKg,
  capacityVolumeM3, year, status, createdAt, updatedAt }
// publicDocument
{ id, userId, vehicleId (string or null), kind, storageKey, originalName,
  mimeType, verificationStatus, reviewedAt, reviewerUserId (string or null),
  rejectionReason, createdAt, updatedAt }
```

15. **Profile edit does not reset verification.** A driver updating `licenseNumber`/`professionalCardNumber` keeps the existing `verificationStatus` (even `rejected`). Auto-reset on edit is a 019 decision, not this plan's.
16. **No rate limiting, no model changes.** Authenticated owner/driver CRUD is not an abuse vector (OTP is, and 014 already limits it). Do not add `express-rate-limit` here. Do not add `publishedAt`-style columns anywhere.
17. **Style: CommonJS, 2-space indent, requires at top of file** — match `backend/src/app.js` and `routes/cargo.js`. No TypeScript. The JSON 100kb body cap stays (these payloads are tiny).

## Steps

### Step 1: Drift check and prerequisites

```bash
git diff --stat 0dee85d..HEAD -- backend/src/app.js backend/src/middleware/auth.js backend/src/models/DriverProfile.js backend/src/models/Vehicle.js backend/src/models/Document.js backend/src/models/User.js backend/package.json
cd backend && node -e "const P=require('./src/models/DriverProfile');const V=require('./src/models/Vehicle');const D=require('./src/models/Document');const U=require('./src/models/User');console.log(V.VEHICLE_TYPES.length, D.KINDS.length, P.schema.path('verificationStatus').enumValues.join(','), U.ROLES.join(','))"
grep -rln "driver" src/routes src/services || echo "no driver routes yet"
npm ls express mongoose jsonwebtoken
```

**Verify**: schema one-liner prints `6 6 pending,approved,rejected cargo_owner,driver,admin`; grep prints `no driver routes yet`; `npm ls` shows no UNMET.

If any of `DriverProfile.js` / `Vehicle.js` / `Document.js` is missing, or `User.ROLES` lacks `driver`, STOP — 011 is not in place.
If `backend/src/routes/driver.js` or `backend/src/services/driverService.js` already exists, STOP and report.

### Step 2: `backend/src/services/driverService.js` (new)

Create the service. Required exports and behavior:

```js
const mongoose = require('mongoose');
const DriverProfile = require('../models/DriverProfile');
const Vehicle = require('../models/Vehicle');
const Document = require('../models/Document');
const User = require('../models/User');

const MAX_LIST = 100;

const PROFILE_FIELDS = ['licenseNumber', 'professionalCardNumber'];
const VEHICLE_FIELDS = ['vehicleType', 'plate', 'capacityWeightKg', 'capacityVolumeM3', 'year'];
const VEHICLE_UPDATE_FIELDS = ['vehicleType', 'capacityWeightKg', 'capacityVolumeM3', 'year', 'status'];
const DOCUMENT_FIELDS = ['kind', 'vehicleId', 'storageKey', 'originalName', 'mimeType'];

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertId(id, code) {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) fail(code);
}

function pickFields(body, keys) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function publicProfile(profile) {
  return {
    id: profile._id.toString(),
    userId: profile.userId.toString(),
    licenseNumber: profile.licenseNumber || '',
    professionalCardNumber: profile.professionalCardNumber || '',
    verificationStatus: profile.verificationStatus,
    verifiedAt: profile.verifiedAt,
    rejectionReason: profile.rejectionReason || '',
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function publicVehicle(vehicle) {
  return {
    id: vehicle._id.toString(),
    driverProfileId: vehicle.driverProfileId.toString(),
    ownerUserId: vehicle.ownerUserId.toString(),
    vehicleType: vehicle.vehicleType,
    plate: vehicle.plate,
    capacityWeightKg: vehicle.capacityWeightKg,
    capacityVolumeM3: vehicle.capacityVolumeM3,
    year: vehicle.year,
    status: vehicle.status,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

function publicDocument(document) {
  return {
    id: document._id.toString(),
    userId: document.userId.toString(),
    vehicleId: document.vehicleId ? document.vehicleId.toString() : null,
    kind: document.kind,
    storageKey: document.storageKey || '',
    originalName: document.originalName || '',
    mimeType: document.mimeType || '',
    verificationStatus: document.verificationStatus,
    reviewedAt: document.reviewedAt,
    reviewerUserId: document.reviewerUserId ? document.reviewerUserId.toString() : null,
    rejectionReason: document.rejectionReason || '',
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function upsertProfile({ userId, body }) {
  const fields = pickFields(body, PROFILE_FIELDS);
  // Decision 2: the only path to the `driver` role. Idempotent.
  await User.updateOne({ _id: userId }, { $addToSet: { roles: 'driver' } });

  const existing = await DriverProfile.findOne({ userId });
  if (existing) {
    Object.assign(existing, fields);
    await existing.save(); // runs Mongoose validators
    return { profile: existing, created: false };
  }
  try {
    const profile = await DriverProfile.create({ userId, ...fields });
    return { profile, created: true };
  } catch (err) {
    // Unique-index race on userId: another request created it first.
    if (err && err.code === 11000) {
      const profile = await DriverProfile.findOne({ userId });
      if (profile) {
        Object.assign(profile, fields);
        await profile.save();
        return { profile, created: false };
      }
    }
    throw err;
  }
}

async function getProfile({ userId }) {
  const profile = await DriverProfile.findOne({ userId });
  if (!profile) fail('not_found');
  return profile;
}

async function requireOwnProfile({ userId }) {
  const profile = await DriverProfile.findOne({ userId });
  if (!profile) fail('profile_required');
  return profile;
}

async function createVehicle({ userId, body }) {
  const profile = await requireOwnProfile({ userId });
  const fields = pickFields(body, VEHICLE_FIELDS); // decision 9: `status` never copied on create
  try {
    return await Vehicle.create({ ...fields, driverProfileId: profile._id, ownerUserId: userId });
  } catch (err) {
    // `plate` is the only unique field on Vehicle → E11000 here means duplicate plate.
    if (err && err.code === 11000) fail('plate_in_use');
    throw err;
  }
}

async function listVehicles({ userId }) {
  return Vehicle.find({ ownerUserId: userId }).sort({ createdAt: -1 }).limit(MAX_LIST);
}

async function updateVehicle({ userId, id, body }) {
  assertId(id, 'invalid_vehicle_id');
  const vehicle = await Vehicle.findOne({ _id: id, ownerUserId: userId });
  if (!vehicle) fail('not_found');
  const fields = pickFields(body, VEHICLE_UPDATE_FIELDS); // decision 8: plate NOT editable
  Object.assign(vehicle, fields);
  await vehicle.save(); // Mongoose enum/min validation
  return vehicle;
}

async function deleteVehicle({ userId, id }) {
  assertId(id, 'invalid_vehicle_id');
  const vehicle = await Vehicle.findOne({ _id: id, ownerUserId: userId });
  if (!vehicle) fail('not_found');
  await vehicle.deleteOne();
  return vehicle;
}

async function createDocument({ userId, body }) {
  const fields = pickFields(body, DOCUMENT_FIELDS);
  if (fields.vehicleId !== undefined && fields.vehicleId !== null) {
    assertId(fields.vehicleId, 'invalid_vehicle_id');
    const vehicle = await Vehicle.findOne({ _id: fields.vehicleId, ownerUserId: userId });
    if (!vehicle) fail('not_found'); // decision 10: do not leak other drivers' vehicles
  }
  return Document.create({
    ...fields,
    userId,
    verificationStatus: 'pending', // decision 10: body can never set verification fields
    reviewerUserId: null,
    reviewedAt: null,
    rejectionReason: '',
  });
}

async function listDocuments({ userId, kind }) {
  const query = { userId };
  if (kind !== undefined) {
    if (!Document.KINDS.includes(kind)) fail('validation_error');
    query.kind = kind;
  }
  return Document.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
}

async function deleteDocument({ userId, id }) {
  assertId(id, 'invalid_document_id');
  const document = await Document.findOne({ _id: id, userId });
  if (!document) fail('not_found');
  if (document.verificationStatus !== 'pending') fail('document_locked');
  await document.deleteOne();
  return document;
}

module.exports = {
  publicProfile,
  publicVehicle,
  publicDocument,
  upsertProfile,
  getProfile,
  createVehicle,
  listVehicles,
  updateVehicle,
  deleteVehicle,
  createDocument,
  listDocuments,
  deleteDocument,
};
```

Notes: `assertId` runs **before** any Mongo query, so no CastError ever reaches the route as a 500 (same as 015's `invalid_cargo_id`). `findOwned`-style hiding is inlined per resource (`{ _id: id, ownerUserId: userId }` / `{ _id: id, userId }`). `pickFields` never copies `userId`, `driverProfileId`, `verificationStatus`, `reviewedAt`, `reviewerUserId`, or `rejectionReason` from the body.

**Verify**: `cd backend && node --check src/services/driverService.js` → exit 0, and
`cd backend && node -e "const s=require('./src/services/driverService'); console.log(['publicProfile','publicVehicle','publicDocument','upsertProfile','getProfile','createVehicle','listVehicles','updateVehicle','deleteVehicle','createDocument','listDocuments','deleteDocument'].every(k=>typeof s[k]==='function')?'ok':'fail')"` → `ok`.

### Step 3: `backend/src/routes/driver.js` (new)

```js
const express = require('express');
const { auth } = require('../middleware/auth');
const driverService = require('../services/driverService');

const router = express.Router();

function requireDriver(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('driver')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

function sendDriverError(res, err) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error' });
  }
  const code = err && err.code;
  const map = {
    invalid_vehicle_id: 400,
    invalid_document_id: 400,
    validation_error: 400,
    profile_required: 400,
    forbidden: 403,
    not_found: 404,
    plate_in_use: 409,
    document_locked: 409,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

router.use(auth);

// Decision 2: driver registration is self-service — any active authenticated
// user may call this; it grants the `driver` role (idempotent) and upserts the
// profile. It MUST stay above the requireDriver gate below.
router.post('/profile', async (req, res) => {
  try {
    const { profile, created } = await driverService.upsertProfile({
      userId: req.user._id,
      body: req.body,
    });
    return res.status(created ? 201 : 200).json({ profile: driverService.publicProfile(profile) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

// Everything defined below this line requires the driver role.
router.use(requireDriver);

router.get('/profile', async (req, res) => {
  try {
    const profile = await driverService.getProfile({ userId: req.user._id });
    return res.status(200).json({ profile: driverService.publicProfile(profile) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.post('/vehicles', async (req, res) => {
  try {
    const vehicle = await driverService.createVehicle({ userId: req.user._id, body: req.body });
    return res.status(201).json({ vehicle: driverService.publicVehicle(vehicle) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await driverService.listVehicles({ userId: req.user._id });
    return res.status(200).json({
      vehicles: vehicles.map(driverService.publicVehicle),
      count: vehicles.length,
    });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.patch('/vehicles/:id', async (req, res) => {
  try {
    const vehicle = await driverService.updateVehicle({
      userId: req.user._id,
      id: req.params.id,
      body: req.body,
    });
    return res.status(200).json({ vehicle: driverService.publicVehicle(vehicle) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.delete('/vehicles/:id', async (req, res) => {
  try {
    await driverService.deleteVehicle({ userId: req.user._id, id: req.params.id });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.post('/documents', async (req, res) => {
  try {
    const document = await driverService.createDocument({ userId: req.user._id, body: req.body });
    return res.status(201).json({ document: driverService.publicDocument(document) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.get('/documents', async (req, res) => {
  try {
    const documents = await driverService.listDocuments({
      userId: req.user._id,
      kind: req.query.kind,
    });
    return res.status(200).json({
      documents: documents.map(driverService.publicDocument),
      count: documents.length,
    });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    await driverService.deleteDocument({ userId: req.user._id, id: req.params.id });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

module.exports = router;
```

Note the Express ordering contract: `router.use(auth)` → `POST /profile` → `router.use(requireDriver)` → the remaining 8 routes. That ordering **is** the role model — do not "simplify" it into a single `router.use(auth, requireDriver)` (it would lock new users out of registration) and do not move `POST /profile` below the gate.

**Verify**: `cd backend && node --check src/routes/driver.js` → exit 0, and `grep -c "router\." src/routes/driver.js` → `11` (1 `router.use(auth)` + 1 `router.use(requireDriver)` + 9 route handlers).

### Step 4: Mount in `backend/src/app.js`

Exactly two edits, nothing else:

1. Add to the requires at the top (after the cargo routes require):

```js
const driverRoutes = require('./routes/driver');
```

2. Add between the cargo mount and the `/api` 404 fallback:

```js
  app.use('/api/driver', driverRoutes);
```

Resulting section:

```js
  app.use('/api/auth', authRoutes);

  app.use('/api/cargo', cargoRoutes);

  app.use('/api/driver', driverRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
```

Do **not** touch helmet/cors/json limits/`/health`/the 404 body. Unmatched `/api/driver/*` paths fall through to the `/api` 404 handler — `app.use('/api/driver', ...)` only claims defined routes.

**Verify**:

```bash
cd backend && node --check src/app.js
cd backend && node -e "const {createApp}=require('./src/app'); const a=createApp(); console.log(typeof a.listen==='function'?'ok':'fail')"
grep -n "driverRoutes" src/app.js
```

→ exit 0, `ok`, and the two `driverRoutes` lines present. The existing `health.test.js` assertion (`GET /api/does-not-exist` → `404 { error: 'not_found' }`) must keep holding — it will, because the fallback is untouched.

### Step 5: On-disk verification (before claiming success)

```bash
grep -rn "body.userId\|body.ownerUserId\|body.driverProfileId\|body.verificationStatus\|body.reviewedAt\|body.reviewerUserId" backend/src/routes/driver.js backend/src/services/driverService.js && echo "LEAK" || echo "identity-and-verification-from-server-only"
grep -c "router\." backend/src/routes/driver.js          # expect 11
grep -n "app.use('/api/driver'" backend/src/app.js        # expect 1 line
grep -rn "express-rate-limit" backend/src/routes/driver.js backend/src/services/driverService.js || echo "no-limiter-on-driver-routes"
grep -rn "twilio\|kavenegar\|aws-sdk\|multer" backend/src/routes/driver.js backend/src/services/driverService.js || echo "no-sms-or-storage"
git status --short
```

Expected: `identity-and-verification-from-server-only`; `11`; exactly one mount line; `no-limiter-on-driver-routes`; `no-sms-or-storage`; `git status` shows only the in-scope files (+ nothing else). If any stray file is modified, revert it before committing.

### Step 6: Write the Jest suite (executed later in plan 026 — DO NOT RUN IT NOW)

Create `backend/test/__tests__/driver.routes.test.js`. **First line:** `require('../setup');`

Structural pattern: copy `backend/test/__tests__/cargo.routes.test.js` (supertest + `createApp()` + env in `beforeAll`). Obtain tokens through the real OTP loop (`OTP_FIXED_CODE=123456`, `request-otp` → `verify-otp`) — do not mint JWTs by hand. Phone constants use the 0011–0014 range so they never collide with the cargo suite's 0001–0003 (collections are wiped per test anyway).

```js
require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const Document = require('../../src/models/Document');

const PHONE_DRIVER = '09121230011';   // registers via POST /profile (role granted there)
const PHONE_DRIVER2 = '09121230012';  // second driver — ownership + plate-conflict tests
const PHONE_ROLE_ONLY = '09121230013'; // pre-seeded roles: ['driver'], no profile
const PHONE_CIVILIAN = '09121230014'; // plain cargo_owner via the OTP loop
const canon = (phone) => `+98${phone[1]}****${phone.slice(-4)}`;
const FIXED_CODE = '123456';

describe('driver onboarding', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use';
    process.env.OTP_FIXED_CODE = FIXED_CODE;
    process.env.NODE_ENV = 'test';
  });

  async function register(phone) {
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone, code: FIXED_CODE });
    expect(res.status).toBe(200);
    return { token: res.body.token, userId: res.body.user.id };
  }

  async function registerRoleOnly(phone) {
    await User.create({ phone: canon(phone), roles: ['driver'] });
    const { token } = await register(phone);
    return token;
  }

  async function registerDriverViaProfile(phone, profileOverrides = {}) {
    const { token } = await register(phone);
    const res = await request(app)
      .post('/api/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseNumber: 'L-123456', professionalCardNumber: 'PC-998877', ...profileOverrides });
    expect([200, 201]).toContain(res.status);
    return token;
  }

  function vehicleBody(overrides = {}) {
    return {
      vehicleType: 'truck',
      plate: '12B345IR11',
      capacityWeightKg: 24000,
      capacityVolumeM3: 40,
      year: 1398,
      ...overrides,
    };
  }

  async function createVehicle(token, overrides = {}) {
    return request(app)
      .post('/api/driver/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send(vehicleBody(overrides));
  }

  test('1. POST /api/driver/profile registers a fresh user: 201, pending, driver role granted', async () => {
    const { token, userId } = await register(PHONE_CIVILIAN);
    const res = await request(app)
      .post('/api/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseNumber: 'L-123456' });
    expect(res.status).toBe(201);
    expect(res.body.profile.verificationStatus).toBe('pending');
    expect(res.body.profile.userId).toBe(userId);
    expect(res.body.profile.id).toMatch(/^[0-9a-f]{24}$/);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.roles).toContain('driver');
  });

  test('2. second POST /profile updates (200) and keeps exactly one profile, still pending', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await request(app)
      .post('/api/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseNumber: 'L-999999' });
    expect(res.status).toBe(200);
    expect(res.body.profile.licenseNumber).toBe('L-999999');
    expect(res.body.profile.verificationStatus).toBe('pending');

    const got = await request(app).get('/api/driver/profile').set('Authorization', `Bearer ${token}`);
    expect(got.status).toBe(200);
    expect(got.body.profile.licenseNumber).toBe('L-999999');
  });

  test('3. GET /profile: driver without profile 404; civilian (cargo_owner only) 403', async () => {
    const roleOnly = await registerRoleOnly(PHONE_ROLE_ONLY);
    const noProfile = await request(app).get('/api/driver/profile').set('Authorization', `Bearer ${roleOnly}`);
    expect(noProfile.status).toBe(404);
    expect(noProfile.body).toEqual({ error: 'not_found' });

    const { token } = await register(PHONE_CIVILIAN);
    const civilian = await request(app).get('/api/driver/profile').set('Authorization', `Bearer ${token}`);
    expect(civilian.status).toBe(403);
    expect(civilian.body).toEqual({ error: 'forbidden' });
  });

  test('4. GET /vehicles as a non-driver is forbidden', async () => {
    const { token } = await register(PHONE_CIVILIAN);
    const res = await request(app).get('/api/driver/vehicles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('5. POST /vehicles creates an active truck owned by the token user', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const { userId } = await register(PHONE_DRIVER); // same user; gets id
    const res = await createVehicle(token);
    expect(res.status).toBe(201);
    expect(res.body.vehicle.status).toBe('active');
    expect(res.body.vehicle.vehicleType).toBe('truck');
    expect(res.body.vehicle.plate).toBe('12B345IR11');
    expect(res.body.vehicle.ownerUserId).toBe(userId);
    expect(res.body.vehicle.id).toMatch(/^[0-9a-f]{24}$/);
  });

  test('6. POST /vehicles ignores a smuggled status — always active on create', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await createVehicle(token, { status: 'inactive', ownerUserId: 'f'.repeat(24) });
    expect(res.status).toBe(201);
    expect(res.body.vehicle.status).toBe('active');
    expect(res.body.vehicle.ownerUserId).not.toBe('f'.repeat(24));
  });

  test('7. duplicate plate — even by another driver — is 409 plate_in_use', async () => {
    const first = await registerDriverViaProfile(PHONE_DRIVER);
    const second = await registerDriverViaProfile(PHONE_DRIVER2);
    const original = await createVehicle(first);
    expect(original.status).toBe(201);

    const sameDriver = await createVehicle(first, { vehicleType: 'van' });
    expect(sameDriver.status).toBe(409);
    expect(sameDriver.body).toEqual({ error: 'plate_in_use' });

    const otherDriver = await createVehicle(second);
    expect(otherDriver.status).toBe(409);
    expect(otherDriver.body).toEqual({ error: 'plate_in_use' });
  });

  test('8. POST /vehicles rejects bad vehicleType and missing plate', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const badType = await createVehicle(token, { vehicleType: 'rocket' });
    expect(badType.status).toBe(400);
    expect(badType.body).toEqual({ error: 'validation_error' });

    const noPlate = vehicleBody();
    delete noPlate.plate;
    const res = await request(app)
      .post('/api/driver/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send(noPlate);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('9. GET /vehicles lists only own vehicles, newest first, with count', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    const a = await createVehicle(token, { plate: '11A111IR11' });
    await new Promise((resolve) => setTimeout(resolve, 5)); // distinct createdAt
    const b = await createVehicle(token, { plate: '22B222IR22' });
    await createVehicle(other, { plate: '33C333IR33' });

    const res = await request(app).get('/api/driver/vehicles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.vehicles[0].id).toBe(b.body.vehicle.id);
    expect(res.body.vehicles[1].id).toBe(a.body.vehicle.id);
    for (const vehicle of res.body.vehicles) {
      expect(vehicle.plate).not.toBe('33C333IR33');
    }
  });

  test('10. PATCH own vehicle updates editable fields; plate is not editable; foreign and malformed ids', async () => {
    const driver = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    const created = await createVehicle(driver);
    const id = created.body.vehicle.id;

    const patch = await request(app)
      .patch(`/api/driver/vehicles/${id}`)
      .set('Authorization', `Bearer ${driver}`)
      .send({ vehicleType: 'van', capacityWeightKg: 8000, status: 'inactive', plate: 'HACK99' });
    expect(patch.status).toBe(200);
    expect(patch.body.vehicle.vehicleType).toBe('van');
    expect(patch.body.vehicle.capacityWeightKg).toBe(8000);
    expect(patch.body.vehicle.status).toBe('inactive');
    expect(patch.body.vehicle.plate).toBe('12B345IR11'); // unchanged

    const foreign = await request(app)
      .patch(`/api/driver/vehicles/${id}`)
      .set('Authorization', `Bearer ${other}`)
      .send({ vehicleType: 'tanker' });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'not_found' });

    const malformed = await request(app)
      .patch('/api/driver/vehicles/not-an-objectid')
      .set('Authorization', `Bearer ${driver}`)
      .send({ vehicleType: 'tanker' });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'invalid_vehicle_id' });
  });

  test('11. DELETE own vehicle removes it; subsequent GET shows it gone', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const created = await createVehicle(token);
    const id = created.body.vehicle.id;

    const del = await request(app).delete(`/api/driver/vehicles/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const list = await request(app).get('/api/driver/vehicles').set('Authorization', `Bearer ${token}`);
    expect(list.body.count).toBe(0);
  });

  test('12. POST /documents creates a pending stub; verification fields cannot be smuggled', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const { userId } = await register(PHONE_DRIVER);
    const res = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'driving_license',
        originalName: 'license.jpg',
        mimeType: 'image/jpeg',
        verificationStatus: 'approved',
        reviewerUserId: userId,
      });
    expect(res.status).toBe(201);
    expect(res.body.document.kind).toBe('driving_license');
    expect(res.body.document.verificationStatus).toBe('pending');
    expect(res.body.document.reviewerUserId).toBeNull();
    expect(res.body.document.reviewedAt).toBeNull();
    expect(res.body.document.vehicleId).toBeNull();
  });

  test('13. POST /documents with a foreign vehicleId is 404; malformed vehicleId is 400', async () => {
    const driver = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    const foreignVehicle = await createVehicle(other, { plate: '44D444IR44' });

    const foreign = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${driver}`)
      .send({ kind: 'vehicle_registration', vehicleId: foreignVehicle.body.vehicle.id });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'not_found' });

    const malformed = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${driver}`)
      .send({ kind: 'vehicle_registration', vehicleId: 'zz' });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'invalid_vehicle_id' });
  });

  test('14. POST /documents rejects bad kind and missing kind', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const badKind = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'passport' });
    expect(badKind.status).toBe(400);
    expect(badKind.body).toEqual({ error: 'validation_error' });

    const noKind = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ originalName: 'x.jpg' });
    expect(noKind.status).toBe(400);
    expect(noKind.body).toEqual({ error: 'validation_error' });
  });

  test('15. GET /documents lists own only; ?kind= filters; bogus kind is 400', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    await request(app).post('/api/driver/documents').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'driving_license' });
    const reg = await request(app).post('/api/driver/documents').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'vehicle_registration' });
    await request(app).post('/api/driver/documents').set('Authorization', `Bearer ${other}`)
      .send({ kind: 'national_id' });

    const all = await request(app).get('/api/driver/documents').set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(2);

    const filtered = await request(app)
      .get('/api/driver/documents?kind=vehicle_registration')
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.count).toBe(1);
    expect(filtered.body.documents[0].id).toBe(reg.body.document.id);

    const bogus = await request(app)
      .get('/api/driver/documents?kind=bogus')
      .set('Authorization', `Bearer ${token}`);
    expect(bogus.status).toBe(400);
    expect(bogus.body).toEqual({ error: 'validation_error' });
  });

  test('16. DELETE own pending document is ok; a non-pending document is document_locked', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const pending = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'safety_card' });
    const del = await request(app)
      .delete(`/api/driver/documents/${pending.body.document.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const approved = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'national_id' });
    // Force approval directly in the DB — the driver API itself can never do this.
    await Document.updateOne(
      { _id: approved.body.document.id },
      { $set: { verificationStatus: 'approved', reviewedAt: new Date() } }
    );
    const locked = await request(app)
      .delete(`/api/driver/documents/${approved.body.document.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(locked.status).toBe(409);
    expect(locked.body).toEqual({ error: 'document_locked' });
  });

  test('17. missing Authorization header is unauthorized before any role check', async () => {
    const res = await request(app).get('/api/driver/profile');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('18. GET /api/does-not-exist still falls through to not_found', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
```

**Verify** (this run): `cd backend && node --check test/__tests__/driver.routes.test.js` → exit 0. The suite **runs green in plan 026** ("deferred to plan 026" — operator override; never run `npm test` in this run).

### Step 7: Commit the implementation (operator override: commit-on-main)

```bash
git add backend/src/services/driverService.js backend/src/routes/driver.js \
  backend/src/app.js backend/test/__tests__/driver.routes.test.js
git commit -m "feat(016): add driver onboarding API"
```

If git identity or a hook fails, leave the changes uncommitted and say so in the report — do not fight git.

### Step 8: Mark the plan in the index

Edit `plans/README.md`:

1. Status table — flip the 016 row:

```
| 016  | Add driver profile + vehicle + documents REST API (driver onboarding) | P1 | M | 014 | DONE (executed by pipeline) |
```

2. Dependency notes — the 016 note added when this plan was written already describes the implemented behavior; if the implementation deviated from it (it must not — STOP conditions), correct the note in the same commit.

Then:

```bash
git add plans/README.md
git commit -m "chore(016): mark plan DONE in index"
```

## Test plan

- New: `backend/test/__tests__/driver.routes.test.js` — the 18 HTTP cases in Step 6.
- Structural pattern: `backend/test/__tests__/cargo.routes.test.js` (`require('../setup');` first line, supertest + `createApp()`, tokens via the OTP loop).
- Existing suites (`health`, `auth`, `phone`, `models.identity`, `models.cargo`, `cargo.routes`) must stay untouched and green when 026 runs them; this plan does not edit them.
- Verification in **this** run: syntax checks + app-boot one-liner only. **Full suite execution is deferred to plan 026** (operator override — never run `npm test` here).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && node --check src/app.js src/services/driverService.js src/routes/driver.js test/__tests__/driver.routes.test.js` exits 0 (run `node --check` per file)
- [ ] `cd backend && node -e "const {createApp}=require('./src/app'); createApp(); console.log('ok')"` → `ok`
- [ ] `backend/src/routes/driver.js` defines all 9 endpoints and is mounted at `/api/driver` in `app.js` **before** the `/api` 404 fallback; `POST /profile` sits **above** `router.use(requireDriver)`
- [ ] `grep -c "router\." backend/src/routes/driver.js` → `11`
- [ ] `grep -rn "body.userId\|body.ownerUserId\|body.driverProfileId\|body.verificationStatus\|body.reviewedAt\|body.reviewerUserId" backend/src/routes/driver.js backend/src/services/driverService.js` → no matches
- [ ] `grep -rn "express-rate-limit\|multer\|aws-sdk\|twilio\|kavenegar" backend/src/routes/driver.js backend/src/services/driverService.js` → no matches
- [ ] All four 011 models (`DriverProfile.js`, `Vehicle.js`, `Document.js`, `User.js`), `middleware/auth.js`, `routes/auth.js`, `routes/cargo.js`, `services/cargoService.js`, `package.json` show **no diff** (`git diff --name-only` must not list them)
- [ ] `git status --short` lists nothing outside the in-scope set
- [ ] Two commits exist: `feat(016): add driver onboarding API` and `chore(016): mark plan DONE in index`
- [ ] `plans/README.md` status row for 016 is `DONE (executed by pipeline)`
- [ ] `mobile/`, `webapp/` untouched

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live files (drift) — e.g. `app.js` no longer has the `/api/auth` + `/api/cargo` mounts or the `/api` 404 fallback, `middleware/auth.js` no longer exports `auth`, or a model gained/renamed fields vs. the excerpts.
- Any of `DriverProfile.js` / `Vehicle.js` / `Document.js` is missing, `User.ROLES` lacks `driver`, or the unique `userId`/`plate` indexes are gone (011 not in place).
- `backend/src/routes/driver.js` or `backend/src/services/driverService.js` already exists.
- Any step seems to require a new npm dependency, a model edit, matching/offer logic, an admin guard, verification approve/reject, file upload/multipart, cookies, or a CORS change — none of it is this plan.
- You are about to run `npm test` or start a server "just to check" — forbidden this run; deferred to 026.
- A syntax check fails twice after a reasonable fix attempt.

## Maintenance notes

- **Plan 017 (matching)**: matches drivers to `open` cargo by `Vehicle.vehicleType` vs `Cargo.transportMode` and origin proximity (`origin.location` 2dsphere index exists). It must query `Vehicle` by `driverProfileId`/`ownerUserId` for the driver's assets — reuse `listVehicles`' scoping pattern (owner = token user), never a global vehicle list. 013's decision stands: `Vehicle` is a road asset; sea/air/rail modes have no vehicle types, so 017 matching for non-land modes is a product decision to revisit there.
- **Plan 018 (shipments)**: `Offer.vehicleId` + `Shipment.vehicleId` reference vehicles created by this plan. Deleting a vehicle that a future shipment references would dangle — 018 should treat `vehicleId` lookups defensively (no cascade was added here on purpose).
- **Plan 019 (admin)**: the verification queue consumes `Document.verificationStatus` + `DriverProfile.verificationStatus` and must set `reviewerUserId`/`reviewedAt`/`rejectionReason` — fields this plan always forces to their defaults. Admin routes must NOT reuse `requireDriver`; write an admin guard in 019. The `document_locked` rule means admin-approved documents are immutable from the driver side — as intended.
- **Profile verification is not auto-reset** on profile edit (decision 15). If 019 wants "edit after rejection → back to pending", that is a 019 (or new-plan) decision touching `driverService.upsertProfile`.
- **Object storage**: `storageKey` stays a client-supplied optional string until a dedicated upload plan lands; then `POST /documents` should start issuing server-generated keys and this plan's `originalName`/`mimeType` fields become the upload metadata.
- **Pagination**: both list endpoints cap at 100 with no `?limit=`/`?cursor=`. Revisit when the admin driver/document tables (plan 021) need more; the cap lives in one constant (`MAX_LIST`).
- Reviewers: confirm `POST /profile` is the only un-gated route and grants the role idempotently, verification fields can never come from a body, foreign resources are `404` not `403`, plate duplicates are `409 plate_in_use`, and no model or dependency changed.

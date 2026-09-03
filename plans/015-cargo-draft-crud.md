# Plan 015: Add cargo-owner-only draft CRUD REST API on the 011 Cargo model

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6a64cb1..HEAD -- backend/src/app.js backend/src/middleware/auth.js backend/src/models/Cargo.js backend/src/models/geoPoint.js backend/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates: `backend/src/middleware/auth.js` exports `auth` (014 present), `backend/src/app.js` mounts `/api/auth` **before** the `/api` 404 placeholder, and `Cargo.schema.path('transportMode')` is defined with `STATUSES` containing `draft`/`open`/`cancelled` (011/013 present). Do not STOP just because later commits exist.

## Operator overrides (from the pipeline prompt — these REPLACE conflicting parts of the improve skill and of this plan's Git workflow / test sections)

1. **GIT POLICY (COMMIT-ON-MAIN, locked 2026-09-03)**: stay on the current branch (`main`). No branch creation, no `checkout`/`switch`, no worktree, no push. Commits ARE allowed and expected: after finishing, `git add` exactly this plan's in-scope files (plus the `plans/README.md` row edit) and commit `feat(015): add cargo draft CRUD API`, then a final `chore(015): mark plan DONE in index` commit when the row is flipped. Never commit `.env` files or secrets; `.pipeline.lock` is gitignored. If git identity or a hook fails, leave changes uncommitted and note it in the report instead of fighting git.
2. **TESTS DEFERRED**: never run `npm test` / Jest, never start dev servers or the API process (nothing long-running may survive the run). Allowed verification: `node --check` / `node -c` syntax checks, `npm ls` to confirm installed deps, grep/search checks, and this plan's pure-node verify one-liners. The Jest suite in Step 6 is **written now but executed in plan 026** ("deferred to plan 026") — do not treat a skipped test run as a STOP condition.
3. `npm install` is allowed only inside `backend/` and only for dependencies the plan explicitly names — this plan names **none** (zero new dependencies).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/014-phone-otp-auth.md (DONE — `auth` middleware + Bearer JWT exist), plans/013-cargo-transport-mode.md (DONE — `Cargo.transportMode` exists)
- **Category**: direction
- **Planned at**: commit `6a64cb1`, 2026-09-03

## Why this matters

V6 Phase 1 §2 still has no HTTP surface for the core object of the platform — the cargo:

- **Cargo registry** — register cargo details on the platform
- **Setting origin / destination geographic location** — exact loading/unloading points
- **Specifying physical cargo dimensions** — weight, volume, sizes
- **Specifying special cargo characteristics** — hazardous, fragile, refrigerated
- **Specifying required pickup / delivery timing**
- **Managing cargo/load records** — edit, update, or cancel draft load records

The 011 `Cargo` model already has every field for this (owner, title/description, `transportMode` from 013, GeoJSON `origin`/`destination` via `placeSchema`, `dimensions`, `specialCharacteristics`, `pickupAt`/`deliverBy`, `status` starting at `draft`). 014 added JWT auth (`auth` middleware sets `req.user`). What is missing is the owner-scoped REST layer between them: create/read/list/update/delete **draft** cargoes, plus the two status exits a draft needs before matching (017) can consume it — `publish` (draft → `open`) and `cancel` (→ `cancelled`).

This plan is **cargo-owner CRUD HTTP only**. It adds no matching, no offers, no driver visibility endpoint, no admin routes, no model changes, no new dependencies.

## Current state

Repo layout at plan time (`6a64cb1` on `main`):

```
backend/
  src/app.js                 ← helmet/cors/json + /health + /api/auth mount + /api 404 fallback
  src/middleware/auth.js     ← Bearer JWT → req.user (014)
  src/routes/auth.js         ← request-otp / verify-otp / me (014) — pattern exemplar
  src/models/Cargo.js        ← the 011/013 model this plan serves
  src/models/geoPoint.js     ← geoPointSchema + placeSchema (embedded, _id:false)
  test/__tests__/auth.test.js ← structural test exemplar (supertest + createApp)
  package.json               ← deps: bcryptjs cors dotenv express express-rate-limit helmet jsonwebtoken mongoose
```

`backend/src/models/Cargo.js` today (full file — 49 lines, unchanged by this plan):

```js
const mongoose = require('mongoose');
const { placeSchema } = require('./geoPoint');

const STATUSES = ['draft', 'open', 'matched', 'cancelled', 'completed'];
const SPECIAL = ['hazardous', 'fragile', 'refrigerated', 'livestock', 'oversized', 'other'];
const TRANSPORT_MODES = ['land', 'sea', 'air', 'rail', 'multimodal'];

const cargoSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    transportMode: {
      type: String,
      enum: TRANSPORT_MODES,
      default: 'land',
    },
    origin: { type: placeSchema, required: true },
    destination: { type: placeSchema, required: true },
    dimensions: {
      weightKg: { type: Number, default: 0, min: 0 },
      volumeM3: { type: Number, default: 0, min: 0 },
      lengthCm: { type: Number, default: 0, min: 0 },
      widthCm: { type: Number, default: 0, min: 0 },
      heightCm: { type: Number, default: 0, min: 0 },
    },
    specialCharacteristics: { type: [String], enum: SPECIAL, default: [] },
    pickupAt: { type: Date, default: null },
    deliverBy: { type: Date, default: null },
    status: { type: String, enum: STATUSES, default: 'draft' },
  },
  { timestamps: true }
);

cargoSchema.index({ ownerUserId: 1, status: 1 });
cargoSchema.index({ status: 1, pickupAt: 1 });
cargoSchema.index({ 'origin.location': '2dsphere' });
cargoSchema.index({ 'destination.location': '2dsphere' });
cargoSchema.index({ transportMode: 1, status: 1 });

cargoSchema.statics.STATUSES = STATUSES;
cargoSchema.statics.SPECIAL = SPECIAL;
cargoSchema.statics.TRANSPORT_MODES = TRANSPORT_MODES;

module.exports = mongoose.model('Cargo', cargoSchema, 'cargos');
```

`backend/src/models/geoPoint.js` — the embedded sub-schemas a cargo body must satisfy:

```js
const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(v) {
          return (
            Array.isArray(v) &&
            v.length === 2 &&
            v.every((n) => typeof n === 'number' && Number.isFinite(n))
          );
        },
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false }
);

const placeSchema = new mongoose.Schema(
  {
    address: { type: String, default: '' },
    location: { type: geoPointSchema, required: true },
  },
  { _id: false }
);

module.exports = { geoPointSchema, placeSchema };
```

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

`backend/src/app.js` today (the `/api` section — mounts auth, then the 404 fallback):

```js
const authRoutes = require('./routes/auth');
// ...
  app.use('/api/auth', authRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
```

`backend/src/routes/auth.js` — the conventions this plan copies (do not re-invent):

```js
const router = express.Router();
// rateLimit with skip: () => process.env.NODE_ENV === 'test'  (authLimiter — CRUD does NOT need it)
function publicUser(user) {
  return { id: user._id.toString(), /* ...only safe fields... */ };
}
function sendAuthError(res, err) {
  const map = { invalid_phone: 400, /* ... */ server_misconfigured: 500 };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}
// every async handler: try { ... } catch (err) { return sendAuthError(res, err); }
```

`backend/package.json` — test config: `jest --runInBand --forceExit`, `testMatch: **/test/__tests__/**/*.test.js`, `testTimeout: 30000`. `backend/test/setup.js` clears **all collections after each test** (`afterEach` → `deleteMany({})`), so every test creates its own user/cargo.

Dependencies today: `bcryptjs`, `cors`, `dotenv`, `express`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `mongoose`. **This plan needs zero new packages.**

V6 bullets this plan covers (`resources/features-roadmap.md`, Phase 1 §1–§2):

```
Phase 1 §1
*   **Submitting transport requests**: Enables users to request a cargo transport service [14].
*   **Submitting cargo/load details**: Allows users to submit parameters and info of a new load [14].
*   **Managing cargo/load records**: Allows users to edit, update, or cancel their draft load records [14].

Phase 1 §2
*   **Cargo registry**: Allows cargo owners to register cargo details on the platform [15].
*   **Setting origin geographic location**: Allows owners to mark the exact loading point on the map [15].
*   **Setting destination geographic location**: Allows owners to mark the exact unloading point on the map [15].
*   **Specifying physical cargo dimensions**: Allows owners to enter load weight, volume, and sizes [15].
*   **Specifying special cargo characteristics**: Allows owners to classify hazardous, fragile, or refrigerated cargo [15].
*   **Specifying required pickup timing**: Allows owners to define the precise loading date and time [15].
*   **Specifying required delivery timing**: Allows owners to define target delivery deadlines [15].
```

"Setting origin/destination **on the map**" is served here as GeoJSON accepted in the JSON body — **no map wiring** (mobile map pickers are plan 024).

Roadmap items this plan does **not** implement:

- Viewing/tracking request status lists, offers, selecting a provider (Phase 1 §2 — needs 017/018)
- Driver-facing anything (Phase 1 §3 — plan 016/017)
- Shipment lifecycle, events, notifications (Phase 1 §4/§6 — plan 018)
- Admin cargo oversight (Phase 1 §5 — plan 019)
- Mobile screens / map pickers (plan 023/024)
- Live GPS, payments, KYC, companies, ratings (Phase 2 — parked)

## Commands you will need

Run from the **repo root** unless a step says `cd backend`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 6a64cb1..HEAD -- backend/src/app.js backend/src/middleware/auth.js backend/src/models/Cargo.js backend/src/models/geoPoint.js backend/package.json` | empty, or only unrelated later commits — re-read excerpts if not empty |
| Confirm Cargo model | `cd backend && node -e "const C=require('./src/models/Cargo'); console.log(C.schema.path('transportMode').enumValues.join(','), '|', C.STATUSES.join(','))"` | `land,sea,air,rail,multimodal \| draft,open,matched,cancelled,completed` |
| Confirm no cargo routes yet | `grep -rln "cargo" backend/src/routes backend/src/services` | no output (only `auth.js` exists in routes/) |
| Confirm deps installed | `cd backend && npm ls express mongoose jsonwebtoken` | all listed, no `UNMET` |
| Syntax | `cd backend && node --check src/app.js && node --check src/services/cargoService.js && node --check src/routes/cargo.js` | exit 0 |
| App still boots | `cd backend && node -e "const {createApp}=require('./src/app'); const a=createApp(); console.log(typeof a.listen==='function'?'ok':'fail')"` | `ok` |
| Jest suite | `cd backend && npm test` | **DEFERRED to plan 026 — do not run (operator override)** |

Do **not** run `npm install` at the repo root (no root `package.json`). Do **not** run `npm install` inside `backend/` at all for this plan — nothing new is needed.

## Suggested executor toolkit

- Product checklist: `resources/features-roadmap.md` Phase 1 §1 (submitting/managing load records) and §2 (cargo registry bullets quoted above).
- Match the patterns in `backend/src/routes/auth.js` (router shape, error mapper, async try/catch) and `backend/src/middleware/auth.js` (how `req.user` is produced). Copy patterns only from `$HOME/projects/v5/backend` if a middleware composition reference is needed — do **not** copy cookies, Redis, BullMQ, or billing.
- Mongoose notes: there is **no schema field named `id`** — serialize `_id` as `id` via a helper; `Cargo.create` for inserts; `doc.save()` runs validators on updates.

## Scope

**In scope** (the only files you should create or modify):

- `backend/src/services/cargoService.js` (new — all ownership/status logic)
- `backend/src/routes/cargo.js` (new — the REST layer)
- `backend/src/app.js` (mount `/api/cargo` between the auth mount and the `/api` 404 fallback — nothing else changes)
- `backend/test/__tests__/cargo.routes.test.js` (new — **written now, executed in 026**)
- `plans/README.md` (status row for 015 + queue-row marker)

**Out of scope** (do NOT touch, even though they look related):

- `backend/src/models/Cargo.js` — no new fields (no `publishedAt`, no per-mode spec columns), no index changes, no new enums.
- `backend/src/models/User.js`, `OtpChallenge.js`, `geoPoint.js`, and every other model (Vehicle, DriverProfile, Document, Offer, Shipment, ShipmentEvent).
- `backend/src/routes/auth.js`, `backend/src/middleware/auth.js`, `backend/src/services/otpService.js` — 014 is done; do not refactor it.
- `backend/package.json` / lockfile — zero new dependencies.
- No driver visibility endpoint for `open` cargo (017), no offers, no shipments, no notifications.
- No admin guard / admin routes (019), no role management.
- `mobile/`, `webapp/`, `admin/` — nothing client-side exists for this yet.
- Cookies, CORS changes, `express-rate-limit` on CRUD, JSON body-cap changes, `/health` changes.
- SMS, payments, KYC, GPS streaming (Phase 2).

## Git workflow (operator override replaces the branch instructions)

- **Stay on the current branch (`main`).** No branch creation, no checkout/switch, no worktree, no push.
- Commit style (from this repo): `feat(015): add cargo draft CRUD API`, then `chore(015): mark plan DONE in index` after the README row flip.
- `git add` exactly the in-scope files + `plans/README.md`. Never `git add` `.env*` or `.pipeline.lock` (already gitignored).

## Product / design decisions (locked for this plan)

These are not open questions for the executor. Implement them as written.

1. **Owner identity comes from the token, never the body.** `ownerUserId` is always `req.user._id`. `grep req.body.ownerUserId` must find nothing. The body cannot set `status` or `ownerUserId`.
2. **Role gate.** Every `/api/cargo` route requires `req.user.roles` to include `'cargo_owner'`; otherwise `403 { error: 'forbidden' }`. Implement as a small `requireCargoOwner(req, res, next)` helper **inside `routes/cargo.js`** (do not edit `middleware/auth.js`). A user with `['cargo_owner','driver']` passes. No admin bypass — admins have no UI until 019.
3. **Everything is created as a draft.** `POST /api/cargo` forces `status: 'draft'` regardless of any body value. The queue row's "draft cargoes" is the contract: read/list/update/delete operate on drafts; the only exits from `draft` are `publish` and `cancel`.
4. **Endpoints** (all under `/api/cargo`, all requiring auth + `cargo_owner`):

| Method + path | Success | Purpose |
|---|---|---|
| `POST /api/cargo` | `201 { cargo }` | create draft |
| `GET /api/cargo` | `200 { cargo: [...], count }` | list **own** cargoes, newest first, optional `?status=` filter, cap 100 |
| `GET /api/cargo/:id` | `200 { cargo }` | get own cargo |
| `PATCH /api/cargo/:id` | `200 { cargo }` | update own **draft** only |
| `DELETE /api/cargo/:id` | `200 { ok: true }` | hard-delete own **draft** only |
| `POST /api/cargo/:id/publish` | `200 { cargo }` | own `draft` → `open` |
| `POST /api/cargo/:id/cancel` | `200 { cargo }` | own `draft` or `open` → `cancelled` |

5. **Status guard matrix** (service-enforced):

| Action | Allowed from | Else |
|---|---|---|
| `PATCH` | `draft` | `409 { error: 'invalid_status' }` |
| `DELETE` | `draft` | `409 invalid_status` |
| `publish` | `draft` → `open` | `409 invalid_status` |
| `cancel` | `draft` or `open` → `cancelled` | `409 invalid_status` |

`matched` / `completed` / `cancelled` cargoes reject all mutations. Cancel is the retirement path for an `open` cargo (the roadmap's "cancel their draft load records" plus the lifecycle need to withdraw a posted cargo before 017 matching awards it).
6. **Not-found hiding.** A cargo that exists but belongs to someone else is `404 { error: 'not_found' }` — identical to a missing id. Never `403` (do not leak existence). Non-owner users also cannot reach the handler with a valid id unless they pass the role gate (403 first).
7. **Error JSON** mirrors 014: `{ error: '<snake_case>' }`, no `err.message` leakage. Mapping (in `sendCargoError` in the route file):

| `err.code` / condition | HTTP |
|---|---|
| `invalid_cargo_id` (malformed ObjectId — 24 hex chars enforced in the service before any query) | 400 |
| `validation_error` (missing origin/destination, `deliverBy` < `pickupAt`, bad `status` query filter) **or** Mongoose `ValidationError` (bad `transportMode`, bad `specialCharacteristics`, non-finite coordinates) | 400 |
| `forbidden` (not `cargo_owner`) | 403 |
| `not_found` (missing **or** not owned) | 404 |
| `invalid_status` (transition guard) | 409 |
| anything else | 500 `server_error` |

8. **Editable fields allowlist.** `PATCH` and `POST` accept exactly: `title`, `description`, `transportMode`, `origin`, `destination`, `dimensions`, `specialCharacteristics`, `pickupAt`, `deliverBy`. Everything else in the body is ignored (Mongoose default). Both `POST` and `PATCH` validate: if **both** `pickupAt` and `deliverBy` are present (in the request for POST; in the **merged document** for PATCH) and `deliverBy < pickupAt` → `400 validation_error`.
9. **Enum validation is Mongoose's job.** Do not hand-validate `transportMode` / `specialCharacteristics` values; assign and let `save()`/`create()` throw `ValidationError`, mapped to `400 validation_error`. `GET ?status=` **is** hand-validated against `Cargo.STATUSES` (no DB round-trip needed to reject it).
10. **List shape.** `GET /api/cargo` → `{ cargo: [serialized...], count: <array length> }`, sorted `createdAt: -1`, `.limit(100)`, no pagination params (deferred; see Maintenance notes). `?status=` filters on the owner's own cargoes only.
11. **Serialization shape** (`publicCargo` in the service — do not add extras):

```js
{
  id: '<ObjectId string>',        // cargo._id.toString()
  ownerUserId: '<ObjectId string>',
  title, description, transportMode,
  origin: { address, location: { type: 'Point', coordinates: [lng, lat] } },
  destination: { ... },
  dimensions: { weightKg, volumeM3, lengthCm, widthCm, heightCm },
  specialCharacteristics: ['hazardous', ...],
  pickupAt, deliverBy,            // Date or null
  status, createdAt, updatedAt,
}
```

12. **No `publishedAt` / no model changes.** `publish` flips `status` only. If reviewers want a timestamp later, that is a new plan touching `Cargo.js`.
13. **Rate limiting: none on CRUD.** The 014 limiter exists because OTP is an abuse vector; authenticated owner CRUD is not. Do not add `express-rate-limit` here.
14. **Style: CommonJS, 2-space indent, requires at top of file** — match `backend/src/app.js` and `routes/auth.js`. No TypeScript. The JSON 100kb body cap stays (GeoJSON points are tiny).

## Steps

### Step 1: Drift check and prerequisites

```bash
git diff --stat 6a64cb1..HEAD -- backend/src/app.js backend/src/middleware/auth.js backend/src/models/Cargo.js backend/src/models/geoPoint.js backend/package.json
cd backend && node -e "const C=require('./src/models/Cargo'); console.log(C.schema.path('transportMode').enumValues.join(','), '|', C.STATUSES.join(','))"
grep -rln "cargo" src/routes src/services || echo "no cargo routes yet"
npm ls express mongoose jsonwebtoken
```

**Verify**: schema one-liner prints `land,sea,air,rail,multimodal | draft,open,matched,cancelled,completed`; grep prints `no cargo routes yet`; `npm ls` shows no UNMET.

If `backend/src/models/Cargo.js` is missing or `draft`/`open`/`cancelled` are not in `STATUSES`, STOP — 011 is not in place.
If `backend/src/routes/cargo.js` or `backend/src/services/cargoService.js` already exists, STOP and report.

### Step 2: `backend/src/services/cargoService.js` (new)

Create the service. Required exports and behavior:

```js
const mongoose = require('mongoose');
const Cargo = require('../models/Cargo');

const MAX_LIST = 100;
const EDITABLE_FIELDS = [
  'title', 'description', 'transportMode', 'origin', 'destination',
  'dimensions', 'specialCharacteristics', 'pickupAt', 'deliverBy',
];

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertObjectId(id) {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) fail('invalid_cargo_id');
}

function publicCargo(cargo) {
  return {
    id: cargo._id.toString(),
    ownerUserId: cargo.ownerUserId.toString(),
    title: cargo.title || '',
    description: cargo.description || '',
    transportMode: cargo.transportMode,
    origin: cargo.origin,
    destination: cargo.destination,
    dimensions: cargo.dimensions,
    specialCharacteristics: cargo.specialCharacteristics,
    pickupAt: cargo.pickupAt,
    deliverBy: cargo.deliverBy,
    status: cargo.status,
    createdAt: cargo.createdAt,
    updatedAt: cargo.updatedAt,
  };
}

function pickEditableFields(body) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function assertTiming(pickupAt, deliverBy) {
  if (pickupAt && deliverBy && new Date(deliverBy).getTime() < new Date(pickupAt).getTime()) {
    fail('validation_error');
  }
}

async function createCargo({ ownerUserId, body }) {
  const fields = pickEditableFields(body);
  if (!fields.origin || !fields.destination) fail('validation_error');
  assertTiming(fields.pickupAt, fields.deliverBy);
  const cargo = await Cargo.create({ ...fields, ownerUserId, status: 'draft' });
  return cargo;
}

async function listCargo({ ownerUserId, status }) {
  const query = { ownerUserId };
  if (status !== undefined) {
    if (!Cargo.STATUSES.includes(status)) fail('validation_error');
    query.status = status;
  }
  return Cargo.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
}

async function findOwned({ ownerUserId, id }) {
  assertObjectId(id);
  const cargo = await Cargo.findOne({ _id: id, ownerUserId });
  if (!cargo) fail('not_found');
  return cargo;
}

async function updateCargo({ ownerUserId, id, body }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft') fail('invalid_status');
  const fields = pickEditableFields(body);
  assertTiming(
    fields.pickupAt !== undefined ? fields.pickupAt : cargo.pickupAt,
    fields.deliverBy !== undefined ? fields.deliverBy : cargo.deliverBy
  );
  Object.assign(cargo, fields);
  await cargo.save(); // runs Mongoose validators → ValidationError on bad enums
  return cargo;
}

async function deleteCargo({ ownerUserId, id }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft') fail('invalid_status');
  await cargo.deleteOne();
  return cargo;
}

async function publishCargo({ ownerUserId, id }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft') fail('invalid_status');
  cargo.status = 'open';
  await cargo.save();
  return cargo;
}

async function cancelCargo({ ownerUserId, id }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft' && cargo.status !== 'open') fail('invalid_status');
  cargo.status = 'cancelled';
  await cargo.save();
  return cargo;
}

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

Notes: `findOwned` enforces decision 6 (not-owned → `not_found`) and decision 7 (malformed id → `invalid_cargo_id` **before** any Mongo query, so no CastError ever reaches the route as a 500). `Cargo.create` with a body-set `status` is impossible because `pickEditableFields` never copies `status`; the explicit `status: 'draft'` after the spread wins even if a future field list regression re-adds it.

**Verify**: `cd backend && node --check src/services/cargoService.js` → exit 0, and
`cd backend && node -e "const s=require('./src/services/cargoService'); console.log(['createCargo','listCargo','updateCargo','deleteCargo','publishCargo','cancelCargo','publicCargo'].every(k=>typeof s[k]==='function')?'ok':'fail')"` → `ok`.

### Step 3: `backend/src/routes/cargo.js` (new)

```js
const express = require('express');
const { auth } = require('../middleware/auth');
const cargoService = require('../services/cargoService');

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
  const map = {
    invalid_cargo_id: 400,
    validation_error: 400,
    forbidden: 403,
    not_found: 404,
    invalid_status: 409,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

router.use(auth, requireCargoOwner);

router.post('/', async (req, res) => {
  try {
    const cargo = await cargoService.createCargo({
      ownerUserId: req.user._id,
      body: req.body,
    });
    return res.status(201).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const cargoes = await cargoService.listCargo({
      ownerUserId: req.user._id,
      status: req.query.status,
    });
    return res.status(200).json({
      cargo: cargoes.map(cargoService.publicCargo),
      count: cargoes.length,
    });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const cargo = await cargoService.findOwned({ ownerUserId: req.user._id, id: req.params.id });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const cargo = await cargoService.updateCargo({
      ownerUserId: req.user._id,
      id: req.params.id,
      body: req.body,
    });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await cargoService.deleteCargo({ ownerUserId: req.user._id, id: req.params.id });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.post('/:id/publish', async (req, res) => {
  try {
    const cargo = await cargoService.publishCargo({ ownerUserId: req.user._id, id: req.params.id });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const cargo = await cargoService.cancelCargo({ ownerUserId: req.user._id, id: req.params.id });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

module.exports = router;
```

Note `router.use(auth, requireCargoOwner)` guards every route in the file — individual route definitions never repeat it.

**Verify**: `cd backend && node --check src/routes/cargo.js` → exit 0.

### Step 4: Mount in `backend/src/app.js`

Exactly two edits, nothing else:

1. Add to the requires at the top (after the auth routes require):

```js
const cargoRoutes = require('./routes/cargo');
```

2. Add between the auth mount and the `/api` 404 fallback:

```js
  app.use('/api/cargo', cargoRoutes);
```

Resulting section:

```js
  app.use('/api/auth', authRoutes);

  app.use('/api/cargo', cargoRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
```

Do **not** touch helmet/cors/json limits/`/health`/the 404 body. Unmatched `/api/cargo/*` paths (e.g. `POST /api/cargo/:id/unpublish`) fall through to the `/api` 404 handler — `app.use('/api/cargo', ...)` only claims defined routes.

**Verify**:

```bash
cd backend && node --check src/app.js
cd backend && node -e "const {createApp}=require('./src/app'); const a=createApp(); console.log(typeof a.listen==='function'?'ok':'fail')"
grep -n "cargoRoutes\|/api/does-not-exist" src/app.js
```

→ exit 0, `ok`, and the mount line present. The existing `health.test.js` assertion (`GET /api/does-not-exist` → `404 { error: 'not_found' }`) must keep holding — it will, because the fallback is untouched.

### Step 5: On-disk verification (before claiming success)

```bash
grep -rn "req.body.ownerUserId\|body.ownerUserId" backend/src && echo "LEAK" || echo "owner-from-token-only"
grep -c "router\." backend/src/routes/cargo.js          # expect 7
grep -n "app.use('/api/cargo'" backend/src/app.js        # expect 1 line
grep -rn "express-rate-limit" backend/src/routes/cargo.js backend/src/services/cargoService.js || echo "no-limiter-on-crud"
git status --short
```

Expected: `owner-from-token-only`; `7`; exactly one mount line; `no-limiter-on-crud`; `git status` shows only the in-scope files (+ nothing else). If any stray file is modified, revert it before committing.

### Step 6: Write the Jest suite (executed later in plan 026 — DO NOT RUN IT NOW)

Create `backend/test/__tests__/cargo.routes.test.js`. **First line:** `require('../setup');`

Structural pattern: copy `backend/test/__tests__/auth.test.js` (supertest + `createApp()` + env in `beforeAll`). Obtain tokens through the real OTP loop (`OTP_FIXED_CODE=123456`, `request-otp` → `verify-otp`) exactly like `auth.test.js` does — do not mint JWTs by hand in the tests.

```js
require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');

const PHONE_OWNER = '09121230001';   // canonical +989120000001
const PHONE_OTHER = '09121230002';   // canonical +989120000002
const PHONE_DRIVER = '09121230003';  // roles: ['driver']

describe('cargo draft CRUD', () => {
  const app = createApp();
  // beforeAll: JWT_SECRET='test-secret-do-not-use', OTP_FIXED_CODE='123456', NODE_ENV='test'
  // helper: register(phone) → token via request-otp + verify-otp
  // helper: validCargoBody() → { title: 'Steel coils', transportMode: 'land',
  //   origin: { address: 'Tehran depot', location: { coordinates: [51.3890, 35.6892] } },
  //   destination: { address: 'Bandar Abbas', location: { coordinates: [56.2705, 27.1832] } },
  //   dimensions: { weightKg: 24000, volumeM3: 40 }, specialCharacteristics: ['oversized'],
  //   pickupAt: '2026-09-10T08:00:00.000Z', deliverBy: '2026-09-12T18:00:00.000Z' }
```

Cases (all via HTTP; every case creates its own users because `setup.js` wipes collections per test):

1. `POST /api/cargo` with valid body → `201`, `cargo.status === 'draft'`, `cargo.id` is 24-hex, `cargo.ownerUserId` equals the owner user id, echoed `origin.location.coordinates` is `[lng, lat]`, `transportMode: 'land'`.
2. `POST` with `status: 'open'` and `ownerUserId: '<other user id>'` smuggled in the body → still `201 draft` and `ownerUserId` is the **token** owner (decision 1).
3. `POST` without `origin` → `400 { error: 'validation_error' }`. Same for missing `destination`.
4. `POST` with `transportMode: 'spaceship'` → `400 validation_error` (Mongoose enum). `POST` with `specialCharacteristics: ['radioactive']` → `400 validation_error`. `POST` with `origin.location.coordinates: [51.38]` (length 1) → `400 validation_error`.
5. `POST` with `deliverBy` before `pickupAt` → `400 validation_error`.
6. `GET /api/cargo` → `200`, `count === number of created cargoes`, all `ownerUserId` equal owner, newest first (create two, assert `cargo[0].id` is the second-created id).
7. `GET /api/cargo?status=open` → only published ones; `GET /api/cargo?status=bogus` → `400 validation_error`.
8. `GET /api/cargo/:id` own → `200`. `GET` the same id with the **other owner's** token → `404 { error: 'not_found' }` (not 403). `GET /api/cargo/not-an-objectid` → `400 { error: 'invalid_cargo_id' }`. `GET` a well-formed but nonexistent id (`'0'.repeat(24)`) → `404 not_found`.
9. `PATCH` own draft (`title`, `dimensions.weightKg`) → `200`, persisted values, `status` still `draft`.
10. `PATCH` after `publish` (status `open`) → `409 { error: 'invalid_status' }`. `DELETE` after `publish` → `409 invalid_status`.
11. `PATCH` other owner's draft → `404 not_found`.
12. `DELETE` own draft → `200 { ok: true }`; subsequent `GET` → `404`.
13. `POST /:id/publish` on draft → `200`, `status: 'open'`; publish again → `409 invalid_status`.
14. `POST /:id/cancel` on draft → `200 cancelled`; a second cancel → `409 invalid_status`. Cancel on a fresh published (open) cargo → `200 cancelled`.
15. No `Authorization` header → `401 { error: 'unauthorized' }` (before role check).
16. Driver-only user (roles `['driver']`) → `403 { error: 'forbidden' }` on `GET /api/cargo`.
17. `GET /api/does-not-exist` still `404 { error: 'not_found' }` (fallback intact).

**Verify** (this run): `cd backend && node --check test/__tests__/cargo.routes.test.js` → exit 0. The suite **runs green in plan 026** ("deferred to plan 026" — operator override; never run `npm test` in this run).

### Step 7: Commit the implementation (operator override: commit-on-main)

```bash
git add backend/src/services/cargoService.js backend/src/routes/cargo.js \
  backend/src/app.js backend/test/__tests__/cargo.routes.test.js
git commit -m "feat(015): add cargo draft CRUD API"
```

If git identity or a hook fails, leave the changes uncommitted and say so in the report — do not fight git.

### Step 8: Mark the plan in the index

Edit `plans/README.md`:

1. Status table — add the 015 row after 014:

```
| 015  | Add cargo-owner draft CRUD REST API on the 011 Cargo model | P1 | M | 014 | DONE (executed by pipeline) |
```

2. Dependency notes — add:

```
- 015 depends on 014 (`auth` middleware + Bearer JWT). Owner-scoped CRUD over the 011 `Cargo` model with publish/cancel status exits — no model changes, no matching/offers (017), no shipments (018), no admin (019).
```

3. Queue row — the `015 Cargo draft CRUD API` row in "MVP slice queue" gets its plan-file pointer (`(→ 015)` appended to the Next-plan cell) when the plan is **written**, and is left as-is after execution.

Then:

```bash
git add plans/README.md
git commit -m "chore(015): mark plan DONE in index"
```

## Test plan

- New: `backend/test/__tests__/cargo.routes.test.js` — the 17 HTTP cases in Step 6.
- Structural pattern: `backend/test/__tests__/auth.test.js` (`require('../setup');` first line, supertest + `createApp()`, tokens via the OTP loop).
- Existing suites (`health`, `auth`, `phone`, `models.identity`, `models.cargo`) must stay untouched and green when 026 runs them; this plan does not edit them.
- Verification in **this** run: syntax checks + app-boot one-liner only. **Full suite execution is deferred to plan 026** (operator override — never run `npm test` here).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && node --check src/app.js src/services/cargoService.js src/routes/cargo.js test/__tests__/cargo.routes.test.js` exits 0 (run `node --check` per file)
- [ ] `cd backend && node -e "const {createApp}=require('./src/app'); createApp(); console.log('ok')"` → `ok`
- [ ] `backend/src/routes/cargo.js` defines all 7 endpoints and is mounted at `/api/cargo` in `app.js` **before** the `/api` 404 fallback
- [ ] `grep -rn "body.ownerUserId" backend/src` → no matches (owner always from `req.user`)
- [ ] `grep -c "router\." backend/src/routes/cargo.js` → `7`
- [ ] `grep -rn "express-rate-limit\|cookie-parser\|twilio\|kavenegar" backend/src/routes/cargo.js backend/src/services/cargoService.js backend/package.json` → no new matches vs. baseline (none in the two new files at all)
- [ ] `backend/src/models/Cargo.js`, `backend/src/models/User.js`, `backend/package.json` show **no diff** (`git diff --name-only` must not list them)
- [ ] `git status --short` lists nothing outside the in-scope set
- [ ] Two commits exist: `feat(015): add cargo draft CRUD API` and `chore(015): mark plan DONE in index`
- [ ] `plans/README.md` status row for 015 is `DONE (executed by pipeline)`
- [ ] `mobile/`, `webapp/` untouched

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live files (drift) — e.g. `app.js` no longer has the `/api/auth` mount or the `/api` 404 fallback, or `middleware/auth.js` no longer exports `auth`.
- `backend/src/models/Cargo.js` is missing, or `draft`/`open`/`cancelled` are absent from `STATUSES`, or `transportMode` is missing (011/013 not in place).
- `backend/src/routes/cargo.js` or `backend/src/services/cargoService.js` already exists.
- Any step seems to require a new npm dependency, a `Cargo.js`/`User.js` edit, matching/offers/shipment logic, an admin guard, cookies, or a CORS change — none of it is this plan.
- You are about to run `npm test` or start a server "just to check" — forbidden this run; deferred to 026.
- A syntax check fails twice after a reasonable fix attempt.

## Maintenance notes

- **Pagination**: `GET /api/cargo` caps at 100 with no `?limit=`/`?cursor=`. Revisit when the admin cargo database table (plan 021) or a power user needs more; the service owns the cap in one constant (`MAX_LIST`).
- **Plan 017 (matching) consumes `open` cargo**: drivers will need a *separate* driver-scoped listing of others' `open` cargoes filtered by vehicle type + origin proximity — it must **not** reuse `findOwned` (owner-scoped). The `transportMode`/`status` and `origin.location` 2dsphere indexes already exist for those queries.
- **Plan 018 (shipments)**: awarding will transition `open` → `matched`. This plan's guard matrix deliberately leaves no owner endpoint to set `matched`/`completed` — only 017/018 flows may.
- **Plan 019 (admin)** will need admin routes that bypass `findOwned`'s owner scoping — do not retrofit "admin bypass" into this service; write admin-owned queries in 019.
- **Profile fields** (`title`/`description` emptiness, per-mode spec columns like `containerNumber`) were rejected in 013 and stay rejected: if a per-mode field is needed, it is a new model plan.
- Reviewers: confirm `ownerUserId` can never come from the body, non-owner reads are `404` not `403`, drafts cannot be edited/deleted after `publish`, and no model or dependency changed.

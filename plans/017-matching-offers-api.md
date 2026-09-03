# Plan 017: Add matching + offers API (driver bids on open cargo, owner awards)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` to `DONE (executed by pipeline)` and commit per the
> git policy below.
>
> **Drift check (run first)**:
> `git diff --stat a3ffd05..HEAD -- backend/src`
> plus `git status --short backend/src`. If any in-scope file changed since
> `a3ffd05` or has uncommitted edits, re-read the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.
>
> **Operator overrides (replace conflicting skill/plan text)**: stay on the
> current branch (no branch creation, no checkout, no worktree, no push).
> Commits ARE allowed and expected. TESTS DEFERRED: never run Jest/npm test,
> never start the API server. Allowed verification: `node --check`, `npm ls`,
> grep/search checks. If a gate is a test run, note "deferred to plan 026".

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/015-cargo-draft-api.md, plans/016-driver-onboarding.md (both DONE)
- **Category**: feature (backend API)
- **Planned at**: commit `a3ffd05`, 2026-09-03

## Why this matters

Phase 1 booking needs the marketplace loop: a driver discovers open cargo that
fits his vehicle and location, bids a price, and the cargo owner awards the
job. This plan wires that loop over the existing 011 models (`Cargo`,
`Offer`, `Vehicle`) using the 014 JWT auth and the 015/016 role-gate
conventions. It implements these V6 bullets from `resources/features-roadmap.md`:

- Line 61: "Viewing incoming carrier offers: Lists incoming price bids and
  transport proposals from drivers."
- Line 63: "Selecting service provider: Enables the cargo owner to select a
  driver/carrier bid."
- Line 76: "Viewing matching transport requests: Lists open cargo requests
  matching the driver's vehicle type and location."

## Current state

- `backend/src/app.js:40-48` — mounts routes and a final `/api` 404 catch-all:
  ```js
  app.use('/api/auth', authRoutes);
  app.use('/api/cargo', cargoRoutes);
  app.use('/api/driver', driverRoutes);
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  ```
  New routers MUST be mounted above the `/api` catch-all.
- `backend/src/middleware/auth.js` — `auth(req,res,next)` verifies
  `Authorization: Bearer <HS256 JWT>` (`payload.sub` = user id), loads the
  user, rejects `status !== 'active'`, sets `req.user`. Exported as
  `module.exports = { auth }`.
- `backend/src/routes/cargo.js:7-12` — the role-gate style to copy:
  ```js
  function requireCargoOwner(req, res, next) {
    if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('cargo_owner')) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  }
  ```
  and `sendCargoError(res, err)` (lines 14–29): maps service error `code`
  strings to HTTP statuses (`validation_error: 400, forbidden: 403,
  not_found: 404, invalid_status: 409`), `ValidationError` → 400, anything
  else → 500 `server_error`. Match this pattern; add these new codes to the
  map: `invalid_offer_id: 400, invalid_vehicle_id: 400, offer_exists: 409`.
- `backend/src/services/cargoService.js` — the service style to copy:
  `fail(code)` helper (lines 10–14), `assertObjectId` regex
  `/^[0-9a-fA-F]{24}$/` (line 17), `publicCargo(cargo)` plain-object
  serializer (lines 20–37), field allowlist via `pickEditableFields`
  (lines 39–46), `MAX_LIST = 100`. Cargo statuses:
  `['draft', 'open', 'matched', 'cancelled', 'completed']`
  (`backend/src/models/Cargo.js:4`), exposed as `Cargo.STATUSES`.
  `publishCargo` (cargoService.js:98-104) is what puts cargo into `'open'` —
  the only status drivers may bid on.
- `backend/src/models/Offer.js` (live excerpt):
  ```js
  const STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'];
  const offerSchema = new mongoose.Schema(
    {
      cargoId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Cargo',  required: true },
      driverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
      vehicleId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle',required: true },
      priceRial: { type: Number, required: true, min: 0 },
      note: { type: String, default: '' },
      status: { type: String, enum: STATUSES, default: 'pending' },
    },
    { timestamps: true }
  );
  offerSchema.index({ cargoId: 1, status: 1 });
  offerSchema.index({ driverUserId: 1, status: 1 });
  offerSchema.index({ cargoId: 1, driverUserId: 1 });
  ```
  Note: there is NO unique index on `(cargoId, driverUserId)` — the
  duplicate-pending-offer check must be a query check in the service
  (`offer_exists`), not a 11000 handler.
- `backend/src/models/Vehicle.js` (live excerpt):
  ```js
  const VEHICLE_TYPES = ['truck', 'trailer', 'van', 'reefer', 'tanker', 'other'];
  const STATUSES = ['active', 'inactive'];
  // fields: driverProfileId, ownerUserId, vehicleType, plate,
  // capacityWeightKg, capacityVolumeM3, year, status (default 'active')
  vehicleSchema.index({ plate: 1 }, { unique: true });
  ```
- `backend/src/models/Cargo.js:39-43` — geo indexes already exist:
  ```js
  cargoSchema.index({ 'origin.location': '2dsphere' });
  cargoSchema.index({ 'destination.location': '2dsphere' });
  ```
  so `$near` on `origin.location` works. `origin`/`destination` use
  `placeSchema` (`backend/src/models/geoPoint.js`): `{ address, location:
  { type: 'Point', coordinates: [lng, lat] } }`.
- `backend/src/routes/driver.js:34-52` — precedent for mixed gating: a
  `router.use(auth)` up top, an un-gated route, then `router.use(requireDriver)`
  for everything below. The offers router uses a different shape (per-route
  role middleware) because its endpoints alternate between driver-only and
  owner-only — see Step 3.
- `backend/src/models/Shipment.js` — exists but is OUT OF SCOPE: creating a
  Shipment on award is plan 018 (its `offerId`/`cargoId` unique index will
  consume the accepted offer then). 017 only flips Offer/Cargo statuses.

**Repo conventions**: backend is CommonJS, 2-space indent, double quotes,
`async/await` with try/catch in routes and `fail(code)` errors in services.
Exemplar files: `backend/src/routes/cargo.js`, `backend/src/services/cargoService.js`.
No new npm dependencies are needed (express/mongoose already installed in
`backend/node_modules`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax check a new file | `node --check backend/src/services/matchingService.js` | exit 0, no output |
| Syntax check routes | `node --check backend/src/routes/matching.js && node --check backend/src/routes/offers.js` | exit 0 |
| App loads (models + routers resolve, no DB needed) | `node -e "const {createApp}=require('./backend/src/app'); const a=createApp(); console.log(typeof a)"` | prints `function` |
| Deps present | `cd backend && npm ls express mongoose --depth=0` | both listed, no `UNMET` |
| Route registration grep | `grep -c "router\.\(get\|post\|patch\|delete\)" backend/src/routes/offers.js` | `5` (POST /, GET /, PATCH /:id, DELETE /:id, POST /:id/accept) |
| Mount grep | `grep -n "matchingRoutes\|offerRoutes" backend/src/app.js` | both `app.use` lines present above the `/api` 404 |

(TESTS DEFERRED to plan 026 — Jest suites for these endpoints are written
there. Do not create test files in 017.)

## Scope

**In scope** (the only files you should create or modify):
- `backend/src/services/matchingService.js` (create)
- `backend/src/routes/matching.js` (create)
- `backend/src/routes/offers.js` (create)
- `backend/src/app.js` (add two `require` lines + two `app.use` lines)
- `plans/README.md` (status row + queue-row marker, per git policy)

**Out of scope** (do NOT touch, even though they look related):
- `backend/src/models/*` — all models exist from 011/013; do NOT add fields
  or indexes to Offer/Cargo/Vehicle.
- `backend/src/services/cargoService.js` and `backend/src/routes/cargo.js` —
  auto-rejecting pending offers when an owner cancels an open cargo is a
  nice-to-have, deliberately deferred (owner cancel of `open` cargo stays
  allowed; stale pending offers simply become un-acceptable because accept
  requires cargo status `'open'`). Do not modify cancel logic.
- `backend/src/models/Shipment.js` / any shipment creation — plan 018.
- Notifications — plan 018. No `Notification` writes on award.
- File uploads, ratings, GPS, payments, SMS — Phase 2.
- `mobile/`, `webapp/`, `admin/` — backend only.

## Git workflow

- Stay on the current branch (`main`). No branch creation, no push.
- Commit style (from `git log`): conventional commits with plan number,
  e.g. `feat(017): add matching + offers API`.
- Commit 1: the three new backend files + the `app.js` edit —
  `feat(017): add matching + offers API`.
- Commit 2: `plans/README.md` row flip + queue marker —
  `chore(017): mark plan DONE in index`.
- Stage exactly the in-scope files; never commit `.env` or `.pipeline.lock`.

## Steps

### Step 1: Create `backend/src/services/matchingService.js`

Copy the conventions from `cargoService.js`: `fail(code)`, `assertId(id, code)`
with the `/^[0-9a-fA-F]{24}$/` regex, `MAX_LIST = 100`, allowlist field picking.

Expose exactly these functions:

```js
const OFFER_FIELDS = ['priceRial', 'note']; // vehicleId/cargoId come from the route, never the body

// --- Driver side ---

// List open cargo matching the driver's vehicle + location.
// Params: { userId, vehicleId?, lat?, lng?, radiusKm? }
// - vehicleId: must be an owned, active Vehicle (fail('not_found') /
//   fail('validation_error') if inactive). When given, also filter capacity:
//   cargo weight must be 0 (unspecified) OR <= vehicle.capacityWeightKg.
// - lat/lng: both or neither; invalid numbers -> fail('validation_error').
//   radiusKm default 50, clamped to [1, 500].
// Query: { status: 'open' }; when lat/lng given add
//   { 'origin.location': { $near: { $geometry: { type: 'Point',
//       coordinates: [lng, lat] }, $maxDistance: radiusKm * 1000 } } }
//   ($near implies sort-by-distance; otherwise .sort({ createdAt: -1 }))
// .limit(MAX_LIST)
async function listMatchingCargo({ userId, vehicleId, lat, lng, radiusKm })

// Create a pending offer. Params: { userId, cargoId, vehicleId, body }
// - validate both ids (invalid_cargo_id / invalid_offer_id? NO — use
//   'invalid_cargo_id' and 'invalid_vehicle_id')
// - cargo must exist and status === 'open', else fail('invalid_status')
// - vehicle must exist, be owned by userId, and status === 'active',
//   else fail('not_found') / fail('validation_error')
// - pick OFFER_FIELDS from body; priceRial must be a finite number >= 0
//   (mongoose min:0 also validates — let ValidationError map to 400)
// - if an Offer with { cargoId, driverUserId: userId, status: 'pending' }
//   already exists -> fail('offer_exists')
// - create and return the Offer (status defaults 'pending')
async function createOffer({ userId, cargoId, vehicleId, body })

// List the driver's own offers (all statuses).
// Query: { driverUserId: userId }, .sort({ createdAt: -1 }).limit(MAX_LIST)
async function listMyOffers({ userId })

// Update price/note on the driver's own PENDING offer only.
// Other statuses -> fail('invalid_status'); not found -> fail('not_found')
async function updateOffer({ userId, id, body })

// Driver withdraws own pending offer: status = 'withdrawn' (do NOT delete).
async function withdrawOffer({ userId, id })

// --- Owner side ---

// List incoming offers for a cargo the requester owns.
// Params: { userId, cargoId } — cargo must exist and be owned by userId,
// else fail('not_found') (do not leak other owners' cargoes).
// Query: { cargoId }, .sort({ createdAt: -1 }).limit(MAX_LIST)
async function listCargoOffers({ userId, cargoId })

// Award (accept an offer). Params: { userId, offerId }
// - offer must exist -> fail('not_found')
// - cargo must exist and be owned by userId -> fail('not_found')
//   (this is the owner check — do NOT rely on roles alone)
// - Atomic two-step to avoid racing drivers/owners:
//   1) Cargo.updateOne({ _id: cargo._id, status: 'open' },
//        { status: 'matched' })  — if matchedCount === 0 -> fail('invalid_status')
//   2) Offer.updateOne({ _id: offer._id, status: 'pending' },
//        { status: 'accepted' }) — if matchedCount === 0, revert the cargo
//        back to 'open' (best-effort Cargo.updateOne) and fail('invalid_status')
//   3) Offer.updateMany({ cargoId: offer.cargoId,
//        _id: { $ne: offer._id }, status: 'pending' }, { status: 'rejected' })
// - return { offer: <freshly fetched accepted offer>, cargo: <freshly
//   fetched matched cargo> }
// - Do NOT create a Shipment here (plan 018).
async function acceptOffer({ userId, offerId })

// Serializer, same style as publicCargo:
// { id, cargoId, driverUserId, vehicleId, priceRial, note, status,
//   createdAt, updatedAt } — all ObjectIds .toString()
function publicOffer(offer)
```

**Verify**: `node --check backend/src/services/matchingService.js` → exit 0.

### Step 2: Create `backend/src/routes/matching.js`

Clone the shape of `routes/cargo.js`: `requireDriver` middleware (copy from
`routes/driver.js:7-12`), `sendError` mapping with the union of codes used by
the service (`invalid_cargo_id, invalid_vehicle_id, validation_error,
forbidden, not_found, invalid_status, offer_exists, invalid_offer_id`),
`router.use(auth, requireDriver)`, and exactly one route:

- `GET /cargo` — reads `req.query.vehicleId / lat / lng / radiusKm` (pass
  strings through; the service parses), calls
  `matchingService.listMatchingCargo({ userId: req.user._id, ... })`, responds
  `200 { cargo: [<publicCargo>...], count: n }`. Use
  `cargoService.publicCargo` (require `../services/cargoService`) so the
  driver sees the same cargo shape owners get.

**Verify**: `node --check backend/src/routes/matching.js` → exit 0;
`grep -c "router\." backend/src/routes/matching.js` → `2` (exactly one
`router.use(auth, requireDriver);` line + one `router.get('/cargo', ...)`
line; `function requireDriver` and `module.exports = router;` contain no
`router.` substring, so the count is mechanically 2 — if your file has a
comment containing `router.`, remove the token from the comment rather than
adjusting the expected count).

### Step 3: Create `backend/src/routes/offers.js`

Same error-mapping helper. Per-route role middleware (both roles appear in
this router, so do NOT use a router-wide `requireDriver`):

```js
function requireDriver(req, res, next) { /* roles.includes('driver') else 403 'forbidden' */ }
function requireCargoOwner(req, res, next) { /* roles.includes('cargo_owner') else 403 'forbidden' */ }
```

Routes (all after `router.use(auth)`):

| Route | Gate | Handler |
|-------|------|---------|
| `POST /` | requireDriver | `createOffer({ userId: req.user._id, cargoId: req.body.cargoId, vehicleId: req.body.vehicleId, body: req.body })` → `201 { offer: publicOffer(o) }`. Missing/non-string `cargoId`/`vehicleId` in body → service `assertId` fires → 400. |
| `GET /` | requireDriver | `listMyOffers` → `200 { offers: [...], count }` |
| `GET /cargo/:cargoId/offers` | requireCargoOwner | `listCargoOffers` → `200 { offers: [...], count }` |
| `PATCH /:id` | requireDriver | `updateOffer` → `200 { offer }` |
| `DELETE /:id` | requireDriver | `withdrawOffer` → `200 { ok: true }` |
| `POST /:id/accept` | requireCargoOwner | `acceptOffer` → `200 { offer, cargo: publicCargo(cargo) }` |

**Verify**: `node --check backend/src/routes/offers.js` → exit 0;
`grep -c "router\.\(get\|post\|patch\|delete\)" backend/src/routes/offers.js` → `6`.

### Step 4: Mount the routers in `backend/src/app.js`

Add requires after the existing ones and mounts above the `/api` 404 catch-all:

```js
const matchingRoutes = require('./routes/matching');
const offerRoutes = require('./routes/offers');
// ...
app.use('/api/matching', matchingRoutes);
app.use('/api/offers', offerRoutes);
```

Keep the mount order: `/api/auth`, `/api/cargo`, `/api/driver`,
`/api/matching`, `/api/offers`, then the `/api` catch-all.

**Verify**: `node -e "const {createApp}=require('./backend/src/app'); console.log(typeof createApp())"` → prints `function` (this resolves every require without touching Mongo).
`grep -n "app.use('/api/matching'\|app.use('/api/offers'" backend/src/app.js` → 2 lines, both with line numbers smaller than the `app.use('/api', ...)` line.

### Step 5: Commit (backend)

```bash
git add backend/src/services/matchingService.js backend/src/routes/matching.js backend/src/routes/offers.js backend/src/app.js
git commit -m "feat(017): add matching + offers API"
```

**Verify**: `git log --oneline -1` → `feat(017): add matching + offers API`;
`git status --short` → only `plans/README.md` (next step) and untracked
`.pipeline.lock` remain.

### Step 6: Update `plans/README.md` and commit

1. Status table row (currently `016` is the last row):
   `| 017  | Add matching + offers REST API (driver bidding, owner award) | P1 | M | 015, 016 | DONE (executed by pipeline) |`
2. Dependency notes: append
   `- 017 depends on 015 (open/draft cargo lifecycle) and 016 (driver role + owned active vehicles). Drivers list open cargo via /api/matching/cargo (vehicle capacity + origin $near filters), bid via /api/offers; owners award via POST /api/offers/:id/accept which flips offer->accepted, other pending offers->rejected, cargo->matched. No Shipment (018), no notifications (018), no cancel-time offer rejection (deferred).`
3. MVP slice queue row `017 Matching + offers API`: append ` (→ 017)` to the
   scope-summary cell, after the existing text (matching how 015/016 rows
   were marked).

Commit: `git add plans/README.md && git commit -m "chore(017): mark plan DONE in index"`.

**Verify**: `grep -n "| 017" plans/README.md` → one row containing
`DONE (executed by pipeline)`; `grep -c "(→ 017)" plans/README.md` → `1`.

## Done criteria

ALL must hold:

- [ ] `node --check` passes for all three new backend files (Step 1–3 verifies)
- [ ] `node -e "...createApp..."` prints `function` — app resolves with new routers mounted
- [ ] `grep -c "router\.\(get\|post\|patch\|delete\)" backend/src/routes/offers.js` → `6`
- [ ] Both new `app.use('/api/...')` mounts sit above the `/api` 404 catch-all in `backend/src/app.js`
- [ ] `grep -n "Shipment" backend/src/services/matchingService.js backend/src/routes/*.js` returns no matches (017 does not touch shipments)
- [ ] No files outside the in-scope list modified (`git status --short` clean except untracked `.pipeline.lock`)
- [ ] Two commits exist: `feat(017): add matching + offers API` and `chore(017): mark plan DONE in index` (via `git log --oneline -3`)
- [ ] `plans/README.md` row 017 = DONE, queue row 017 marked `(→ 017)`
- [ ] Jest tests for these endpoints: **deferred to plan 026** (noted, not a failure)

## STOP conditions

Stop, set the plan row to `BLOCKED (<reason>)` in `plans/README.md`, leave
changes uncommitted (or commit only what already passed verification), and
report if:

- The drift check shows any in-scope file changed since `a3ffd05` and the
  "Current state" excerpts no longer match the live code (e.g. `app.js`
  mounts differ, `Offer` model gained a unique index or new statuses).
- `backend/node_modules` is missing and `npm install` in `backend/` fails —
  do not fight dependency resolution; report.
- The `Offer` model lacks any of `cargoId / driverUserId / vehicleId /
  priceRial / status`, or `Vehicle` lacks `ownerUserId` — the service design
  assumes these; inventing schema changes is out of scope.
- Any step's verification fails twice after a reasonable fix attempt.
- You find yourself needing to modify `cargoService.js`, `Shipment.js`, or
  any model — that means the plan's boundary is wrong; stop instead.

## Maintenance notes

- **018 will build on this**: the accepted offer + matched cargo pair from
  `acceptOffer` is exactly what Shipment creation consumes (`Shipment` has
  `offerId` required and a unique index on `cargoId`). Do not add shipment
  logic here; 018 reads the resulting state.
- **Cancel-race known gap**: an owner may cancel an `open` cargo while
  pending offers exist; those offers stay `pending` but become un-acceptable
  (accept re-checks cargo status `'open'` atomically). If product wants
  auto-rejection on cancel, extend `cancelCargo` in 018+.
- **Reviewer scrutiny**: check `acceptOffer`'s atomicity — the cargo status
  flip must be conditioned on `status: 'open'` in the update query, not a
  read-then-write, or two concurrent accepts could both pass.
- **No notification on award** is intentional (018 owns the Notification
  collection).

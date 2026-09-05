# Plan 037: Let awarded drivers read cargo parameters and destinations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1232e61..HEAD -- backend/src/routes/cargo.js backend/src/services/cargoService.js backend/src/services/shipmentService.js backend/src/models/Shipment.js backend/test/__tests__/cargo.routes.test.js backend/test/__tests__/shipments.routes.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `router.use(auth, requireNotMaintenance, requireCargoOwner)` is still on
> `backend/src/routes/cargo.js`; `GET /api/shipments/:id` still returns
> `publicShipment` with ids only (no nested cargo). Do not STOP just
> because later commits exist.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/015-cargo-draft-crud.md (DONE), plans/018-shipment-lifecycle-notifications.md (DONE)
- **Category**: direction + tests
- **Planned at**: commit `1232e61`, 2026-09-05

## Why this matters

V6 Phase 1 §3 still has two bullets with no backend read for the
**accepted driver**:

- **Viewing cargo parameters** — dimensions and weight for accepted drivers
- **Viewing route destinations** — origin/destination of the awarded load

Owners already have full cargo CRUD (`GET /api/cargo/:id` is
`cargo_owner` + `findOwned`). Drivers see origin/destination/dimensions
only while the cargo is `open`, via `GET /api/matching/cargo` (uses
`cargoService.publicCargo`). After award, cargo becomes `matched` and
drops out of matching. `GET /api/shipments/:id` returns:

```
id, cargoId, offerId, ownerUserId, driverUserId, vehicleId,
status, pickupAt, deliveredAt, createdAt, updatedAt
```

No nested cargo. The Expo driver trip screen
(`mobile/src/screens/DriverShipmentDetailScreen.tsx`) therefore shows
only `formatId(shipment.cargoId)` — it has nothing else to display.
This is a backend hole, not a mobile-only one: there is no participant
cargo GET at all.

This plan adds `GET /api/shipments/:id/cargo` (participant-scoped) that
returns the existing `publicCargo` shape. No new collection, no change
to owner CRUD, no mobile UI in this slice.

## Current state

`backend/src/routes/cargo.js` — entire router is cargo-owner:

```js
router.use(auth, requireNotMaintenance, requireCargoOwner);
```

`findOwned` in `cargoService.js` is `{ _id, ownerUserId }` — a driver
calling `GET /api/cargo/:id` today gets 403 (no `cargo_owner` role) or,
if they also happen to be an owner, 404 for someone else's cargo.

`backend/src/services/shipmentService.js` — `getForUser` already encodes
the participant rule:

```js
async function getForUser({ userId, id }) {
  assertId(id, "invalid_shipment_id");
  const shipment = await Shipment.findOne({
    _id: id,
    $or: [{ ownerUserId: userId }, { driverUserId: userId }],
  });
  if (!shipment) fail("not_found");
  return shipment;
}
```

`publicShipment` (same file, ~187–201) has no cargo fields.

`backend/src/routes/shipments.js` currently:

- `GET /` list
- `GET /:id`
- `GET /:id/events`
- `POST /:id/status` (driver)
- `POST /:id/events` (driver)

Quote style: `shipmentService.js` / `shipments.js` use **double quotes**.
`cargoService.js` uses **single quotes**. Match the file.

`publicCargo` already serializes origin, destination, dimensions,
specials, transportMode — reuse it. Do not invent a second serializer.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (if needed) | `cd backend && npm install` | `express-rate-limit` resolves |
| Slice tests | `cd backend && npx jest --runInBand --forceExit test/__tests__/shipments.routes.test.js test/__tests__/cargo.routes.test.js` | exit 0 |
| Full suite | `cd backend && npm test` | exit 0 |
| Hang workaround | `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` | memory Mongo starts |

## Scope

**In scope**:

- `backend/src/services/shipmentService.js` — add `getCargoForUser`
- `backend/src/routes/shipments.js` — add `GET /:id/cargo`
- `backend/test/__tests__/shipments.routes.test.js` — new cases
- `backend/test/__tests__/cargo.routes.test.js` — one regression that
  `GET /api/cargo/:id` is still owner-only (403 for a driver-only token)

**Out of scope**:

- Changing `GET /api/cargo/:id` to allow drivers (would leak unmatched
  drafts if the id is guessed; participant check belongs on the shipment).
- Nesting cargo inside `publicShipment` (breaks the existing shipment
  contract the mobile types already consume).
- `mobile/` DriverShipmentDetailScreen wiring — client follow-up after
  this API exists. Mention it in Maintenance, do not edit Expo.
- Owner "search nearby vehicles" (Vehicle has no point; Phase 2 GPS).
- Offer nested cargo on `GET /api/offers`.
- Plan 035 security hardening.

## Git workflow

- Branch: `advisor/037-shipment-cargo-read`
- Commits: `feat(037): add participant GET /api/shipments/:id/cargo` then
  `chore(037): mark plan DONE in index`
- Do not push.

## Steps

### Step 1: Service helper

In `backend/src/services/shipmentService.js`, require `cargoService` at
the top. `cargoService` already requires `matchingService`, which
requires `shipmentService` — **this is a cycle**. Do **not**
`require("./cargoService")` at module top.

Instead, lazy-require inside the new function (same pattern already used
to avoid cargo↔matching cycles; `cargoService.js` comments that
matching does not require cargo). Or require only `Cargo` (already
imported) and call `cargoService.publicCargo` via a lazy require:

```js
async function getCargoForUser({ userId, id }) {
  const shipment = await getForUser({ userId, id });
  const cargo = await Cargo.findById(shipment.cargoId);
  if (!cargo) fail("not_found");
  return cargo;
}
```

Do **not** serialize here. The route will call `cargoService.publicCargo`
with a lazy require:

```js
// routes/shipments.js, inside the handler
const cargoService = require("../services/cargoService");
```

A route-level require is evaluated once on first request and does not
cycle at matchingService load time (`routes/shipments.js` currently does
not require cargoService). Add that require at the **top of
`routes/shipments.js`** — `cargoService` does not require
`shipmentService`, so this is one-way and safe.

Export `getCargoForUser` from `shipmentService`.

**Verify**:
`node -e "const s=require('./backend/src/services/shipmentService'); const c=require('./backend/src/services/cargoService'); if (typeof s.getCargoForUser!=='function') process.exit(1); console.log('ok', Object.keys(c).includes('publicCargo'))"`
→ prints `ok true`. If this throws a circular-require empty object, STOP
and report rather than adding a second serializer.

### Step 2: Route

In `backend/src/routes/shipments.js`, next to the other `GET /:id/…`
routes (after `GET /:id/events` is fine), add:

```js
router.get("/:id/cargo", async (req, res) => {
  try {
    const cargo = await shipmentService.getCargoForUser({
      userId: req.user._id,
      id: req.params.id,
    });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendShipmentError(res, err);
  }
});
```

Add `const cargoService = require("../services/cargoService");` at the
top of the file (single quotes vs double: this file uses double quotes
for requires — keep double quotes).

No extra role gate. `getForUser` already 404s strangers. Both owner and
driver of that shipment may read. Maintenance middleware already allows
GET.

Malformed id → existing `invalid_shipment_id` 400 from `assertId`.
Unknown / non-participant id → `not_found` 404 (do not leak existence).

**Verify**: file loads:
`node -e "require('./backend/src/routes/shipments'); console.log('ok')"`

### Step 3: Tests — TDD

`backend/test/__tests__/shipments.routes.test.js` already has helpers to
register owner+driver, publish cargo, and accept an offer (look for the
existing "award creates a shipment" / list tests). Add cases that use
the same setup:

1. **Awarded driver GET `/api/shipments/:id/cargo` → 200** with
   `body.cargo.id === shipment.cargoId`,
   `body.cargo.origin.location.coordinates` present,
   `body.cargo.destination` present,
   `body.cargo.dimensions.weightKg` present,
   `body.cargo.transportMode` present.
   Shape keys must match `publicCargo` (id, ownerUserId, title,
   description, transportMode, origin, destination, dimensions,
   specialCharacteristics, pickupAt, deliverBy, status, createdAt,
   updatedAt). Status after award is `matched`.

2. **Owner of the same shipment GET → 200** (same cargo id). Proves
   the participant `$or` includes owner, not driver-only.

3. **Unrelated user GET → 404 `{ error: 'not_found' }`** (not 403).
   Register a second owner (`PHONE_OWNER2` already exists in this file).

4. **Unauthenticated GET → 401**.

5. **Malformed id → 400 `{ error: 'invalid_shipment_id' }`**.

6. **Regression: `GET /api/shipments/:id` still has no nested cargo**
   (`expect(res.body.shipment.cargo).toBeUndefined()` and
   `expect(res.body.shipment.cargoId).toBe(cargoId)`).

In `backend/test/__tests__/cargo.routes.test.js`, add one case if a
driver-only token helper exists; otherwise skip — do not invent a
driver-only user in the cargo file unless `registerDriver` is already
there (it is: `registerDriver` at line ~28). Case:

- Driver token `GET /api/cargo/:id` for an open cargo they do not own
  → **403** `{ error: 'forbidden' }` (router-wide `requireCargoOwner`).
  This documents that 037 did **not** punch a hole in owner CRUD.

Write the shipment tests first, run them (expect 404 on the new path
from the `/api` catch-all), then add the route.

**Verify**:
`cd backend && npx jest --runInBand --forceExit test/__tests__/shipments.routes.test.js test/__tests__/cargo.routes.test.js`
→ all pass.

### Step 4: Full suite

**Verify**: `cd backend && npm test` → exit 0.

## Test plan

- New tests listed in Step 3.
- Pattern: existing `GET /api/shipments/:id` 404-for-stranger tests in
  `shipments.routes.test.js` (same `getForUser` contract).
- Do not add Expo tests.

## Done criteria

- [ ] `GET /api/shipments/:id/cargo` exists, auth required
- [ ] Response is `{ cargo: publicCargo(...) }` — same serializer as owner
      cargo GET / matching list
- [ ] Participant-only: owner or driver of that shipment; strangers 404
- [ ] `GET /api/cargo/:id` remains cargo_owner + owned
- [ ] `GET /api/shipments/:id` response shape unchanged
- [ ] New tests pass; `cd backend && npm test` exits 0
- [ ] No `mobile/` or `admin/` edits
- [ ] `plans/README.md` row for 037 is DONE

## STOP conditions

- `GET /api/shipments/:id` already nests cargo — do not add a second
  endpoint; extend tests and mark DONE.
- Requiring `cargoService` from `shipmentService.js` at top-level yields
  `{}` / missing exports (cycle) — keep the lazy/route-level require as
  specified; do not copy-paste `publicCargo`.
- Temptation to return raw mongoose docs — STOP; always `publicCargo`.
- Temptation to open `GET /api/cargo/:id` to any driver — STOP; that
  leaks unmatched cargo.

## Maintenance notes

- Mobile follow-up (not this plan): `DriverShipmentDetailScreen` should
  call `GET /api/shipments/:id/cargo` and show origin/destination/
  dimensions. Until then the API is unused by Expo but the MVP backend
  bullet is closed.
- If a future plan nests cargo on the shipment list for fewer round
  trips, keep `GET /:id/cargo` as the canonical detail read.
- Reviewer: confirm 404 (not 403) for strangers, matching `getForUser`.

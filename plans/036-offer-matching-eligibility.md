# Plan 036: Enforce matching eligibility when a driver creates an offer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1232e61..HEAD -- backend/src/services/matchingService.js backend/src/routes/offers.js backend/src/routes/matching.js backend/test/__tests__/offers.routes.test.js backend/test/__tests__/matching.routes.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `listMatchingCargo` already filters `transportMode` / `volumeM3` / reefer
> when `vehicleId` is set; `createOffer` still only checks cargo `open` +
> owned active vehicle. Do not STOP just because later commits exist.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/028-matching-filters-cancel-offers.md (DONE)
- **Category**: correctness + tests
- **Planned at**: commit `1232e61`, 2026-09-05

## Why this matters

V6 Phase 1 §3 says matching lists open cargo that fits the driver's
**vehicle type and location**. Plan 028 implemented that on
`GET /api/matching/cargo` only. `POST /api/offers` does not reuse those
rules: any driver with an active vehicle can bid on open sea/air/rail
cargo, refrigerated cargo (from a dry truck), or a load heavier/larger
than the truck.

The matching list is therefore a UI filter, not a marketplace invariant.
A client (or a crafted POST) can award a truck onto cargo 028 just hid.
This plan extracts one eligibility helper and runs it from both the list
query (documentation + unit tests) and `createOffer` (the write path).

## Current state

`backend/src/services/matchingService.js` — list path (028) already
builds a Mongo query from the vehicle:

```js
if (hasValue(vehicleId)) {
  const vehicle = await findOwnedActiveVehicle({ userId, vehicleId });
  query["dimensions.weightKg"] = { $lte: vehicle.capacityWeightKg };
  query["dimensions.volumeM3"] = { $lte: vehicle.capacityVolumeM3 };
  query.transportMode = { $in: ["land", "multimodal"] };
  if (vehicle.vehicleType !== "reefer") {
    query.specialCharacteristics = { $nin: ["refrigerated"] };
  }
}
```

`createOffer` (same file) only checks the cargo is `open` and the vehicle
is owned + active. It never looks at `transportMode`, weight, volume, or
reefer:

```js
async function createOffer({ userId, cargoId, vehicleId, body }) {
  assertId(cargoId, "invalid_cargo_id");
  assertId(vehicleId, "invalid_vehicle_id");

  const cargo = await Cargo.findOne({ _id: cargoId, status: "open" });
  if (!cargo) fail("invalid_status");

  await findOwnedActiveVehicle({ userId, vehicleId });
  // ... price validation, duplicate pending offer, Offer.create ...
}
```

`backend/test/__tests__/matching.routes.test.js` covers the list filters
(sea/air hidden, volume, reefer). `backend/test/__tests__/offers.routes.test.js`
covers open-vs-draft, duplicate bid, foreign vehicle — **not** mode /
capacity / reefer on POST.

Conventions to match:

- This file uses **double quotes** (`matchingService.js`, `offers.routes.test.js`).
  Match the file you edit. Do not reformat to single quotes.
- Errors are `{ error: "<code>" }` with `err.code` set by `fail("…")`.
- 2-space indent. CommonJS.
- Jest files start with `require('../setup');`.
- `invalid_status` (409) means the cargo is not in the required status.
  A vehicle that does not fit an **open** cargo is **not** a status
  problem — use `validation_error` (400), same as inactive vehicle.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (if `express-rate-limit` missing) | `cd backend && npm install` | exit 0; `node -e "require('express-rate-limit')"` prints nothing |
| Tests | `cd backend && npm test` | exit 0, all suites pass |
| Tests (this slice) | `cd backend && npx jest --runInBand --forceExit test/__tests__/offers.routes.test.js test/__tests__/matching.routes.test.js` | exit 0 |
| Hang workaround | `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` | memory Mongo starts |

If `npm test` fails on `Cannot find module 'express-rate-limit'`, that is
stale `node_modules` vs `package.json` (the dep is already declared). Run
`npm install` in `backend/` once, then re-run tests. Do not add new
runtime packages.

## Scope

**In scope**:

- `backend/src/services/matchingService.js`
- `backend/test/__tests__/offers.routes.test.js` (new cases)
- `backend/test/__tests__/matching.routes.test.js` (optional: one case that
  POSTs an offer the list hid — only if you do not already cover it in
  offers tests)

**Out of scope**:

- `listMatchingCargo` Mongo query shape — keep the 028 `$in` / `$lte` /
  `$nin` filters. Do **not** replace the query with an in-JS scan.
- Owner nearby-vehicle search (Vehicle has no GeoJSON point; live GPS is
  Phase 2).
- Stretching `Vehicle.vehicleType` to ship/plane/wagon (013/028 rejected).
- `mobile/` and `admin/`.
- Security work in plan 035 (CORS, JWT pin, error handler).
- Extracting `fail` / `assertId` into a shared util (plan 038).

## Git workflow

- Branch: `advisor/036-offer-matching-eligibility`
- Commits: `feat(036): reject ineligible offers on create` then
  `chore(036): mark plan DONE in index`
- Do not push or open a PR unless the operator asked.

## Steps

### Step 1: Add `vehicleFitsCargo` next to the existing helpers

In `backend/src/services/matchingService.js`, after `findOwnedActiveVehicle`
and **before** `listMatchingCargo`, add:

```js
// Shared Phase 1 compatibility matrix (plan 028 list + plan 036 write).
// Vehicle is a road asset: land/multimodal only. Refrigerated cargo needs
// a reefer. Weight/volume treat 0 as "unspecified" on cargo (schema min 0)
// so `$lte` / `<=` is the whole rule.
function vehicleFitsCargo(vehicle, cargo) {
  const mode = cargo.transportMode || "land";
  if (mode !== "land" && mode !== "multimodal") return false;
  const weight = (cargo.dimensions && cargo.dimensions.weightKg) || 0;
  const volume = (cargo.dimensions && cargo.dimensions.volumeM3) || 0;
  if (weight > vehicle.capacityWeightKg) return false;
  if (volume > vehicle.capacityVolumeM3) return false;
  const specials = cargo.specialCharacteristics || [];
  if (vehicle.vehicleType !== "reefer" && specials.includes("refrigerated")) {
    return false;
  }
  return true;
}
```

Export it from `module.exports` so a unit-style require in tests can call
it directly if needed. Keep `listMatchingCargo`'s Mongo filters as they
are — they must stay equivalent to this function. Do **not** call
`vehicleFitsCargo` inside the Mongo query builder (it cannot express
`$near`).

**Verify**: `node -e "const m = require('./backend/src/services/matchingService'); if (typeof m.vehicleFitsCargo !== 'function') process.exit(1); console.log('ok')"`
→ prints `ok`.

### Step 2: Call it from `createOffer`

After `findOwnedActiveVehicle` returns, **before** price validation / the
duplicate-offer query:

```js
const vehicle = await findOwnedActiveVehicle({ userId, vehicleId });
if (!vehicleFitsCargo(vehicle, cargo)) fail("validation_error");
```

Replace the previous `await findOwnedActiveVehicle(...)` that discarded
the return value. Do not change the `invalid_status` branch for
non-open cargo.

**Verify**: `node -e "require('./backend/src/services/matchingService'); console.log('ok')"`
→ prints `ok`.

### Step 3: RED then GREEN — offers route tests

In `backend/test/__tests__/offers.routes.test.js`, reuse the existing
`register` / `setupDriverWithVehicle` / `publishCargo` / `openCargoBody`
helpers already in that file. Add these cases inside the same
`describe('offers routes')` (after the foreign-vehicle test is a good
spot):

1. **Sea cargo + truck → 400 `validation_error`**.
   `publishCargo(ownerToken, { title: 'Sea cargo', transportMode: 'sea' })`
   then `POST /api/offers` with the truck `vehicleId`. Expect 400
   `{ error: 'validation_error' }`. Confirm no Offer row was created:
   `expect(await Offer.countDocuments()).toBe(0)` (or count-before ===
   count-after if other tests in the same file leave data — they should
   not; `test/setup.js` `afterEach` wipes collections).

2. **Air cargo + truck → 400 `validation_error`**. Same shape,
   `transportMode: 'air'`.

3. **Multimodal cargo + truck → 201**. Proves 028's exception is kept
   on the write path. `transportMode: 'multimodal'`, expect 201 and
   `res.body.offer.status === 'pending'`.

4. **Weight above capacity → 400**. Create the vehicle with
   `capacityWeightKg: 5000` (pass through `createVehicle` /
   `setupDriverWithVehicle` overrides — today `setupDriverWithVehicle`
   only forwards `plate`; extend it to `...overrides` like
   `createVehicle` already does, or call `createVehicle` directly).
   Publish cargo with `dimensions: { weightKg: 8000, volumeM3: 10 }`.

5. **Volume above capacity → 400**. Vehicle `capacityVolumeM3: 10`,
   cargo `volumeM3: 50`.

6. **Refrigerated cargo + dry truck → 400**. Default `vehicleType: 'truck'`,
   cargo `specialCharacteristics: ['refrigerated']`.

7. **Refrigerated cargo + reefer → 201**. `createVehicle(token, { vehicleType: 'reefer', plate: 'REEFER1IR11' })`.

If `setupDriverWithVehicle` cannot pass capacity/type, change it to:

```js
async function setupDriverWithVehicle(phone, plateOrOverrides) {
  const { token } = await registerDriverViaProfile(phone);
  const overrides = typeof plateOrOverrides === "string"
    ? { plate: plateOrOverrides }
    : (plateOrOverrides || {});
  const vehicleId = await createVehicle(token, overrides);
  return { token, vehicleId };
}
```

Existing callers pass a plate string — keep that working.

Write the tests first, run the offers file, confirm the new cases fail
(sea/air currently 201). Then land Step 2 and re-run.

**Verify**:
`cd backend && npx jest --runInBand --forceExit test/__tests__/offers.routes.test.js test/__tests__/matching.routes.test.js`
→ all pass, including the 7 new cases. Existing matching list tests still
pass (028 behaviour unchanged).

### Step 4: Full suite

**Verify**: `cd backend && npm test` → exit 0.

If memory Mongo hangs: `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod`
once in that shell and retry. Do not switch to `MongoMemoryReplSet`.

## Test plan

- New tests listed in Step 3, in `backend/test/__tests__/offers.routes.test.js`.
- Pattern: the existing `POST /api/offers with non-open cargo is invalid_status`
  test in that file (status 409 vs the new 400s).
- Do **not** assert on notification documents here (029 already covers
  `offer_received` on a successful bid).
- Matching list tests stay as characterization that the Mongo query still
  agrees with `vehicleFitsCargo`.

## Done criteria

- [ ] `vehicleFitsCargo` is exported from `matchingService.js`
- [ ] `createOffer` calls `findOwnedActiveVehicle` **and** `vehicleFitsCargo`;
      mismatch → `fail("validation_error")` (400)
- [ ] Non-open cargo still returns `invalid_status` (409)
- [ ] `listMatchingCargo` Mongo filters are unchanged
- [ ] New offers tests exist and pass for sea, air, multimodal, weight,
      volume, dry-vs-reefer
- [ ] `cd backend && npm test` exits 0
- [ ] `git status` shows only in-scope files (+ `plans/README.md` status row)
- [ ] `plans/README.md` row for 036 is DONE

## STOP conditions

- `createOffer` already calls a capacity/mode check (plan already landed) —
  do not duplicate; mark DONE and report.
- `listMatchingCargo` no longer has the 028 filters — STOP; 028 drifted.
- A new test wants `not_eligible` / `forbidden` instead of
  `validation_error` — do not invent a new error code. This API uses the
  existing map in `routes/offers.js` (`validation_error: 400`).
- Fix appears to need `Vehicle` schema changes or sea/air vehicle types —
  STOP; that was rejected in 013/028.

## Maintenance notes

- Plan 038 will extract `fail` / `assertId` from this file. After 038 the
  helper should still live in `matchingService.js` (domain rule, not a
  generic util).
- Plan 037 adds participant cargo GET; it does not change offer create.
- If Phase 2 adds sea/air assets, `vehicleFitsCargo` and the Mongo `$in`
  must change together — add a comment pointing at both sites.
- Reviewer: confirm sea POST is 400 not 409, and multimodal still 201.

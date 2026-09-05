# Plan 028: Tighten matching filters and reject stale offers on cargo cancel

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 39fe0a7..HEAD -- backend/src/services/matchingService.js backend/src/services/cargoService.js backend/src/services/adminService.js backend/src/routes/matching.js backend/src/models/Cargo.js backend/src/models/Vehicle.js backend/src/models/Offer.js backend/test/__tests__/matching.routes.test.js backend/test/__tests__/cargo.routes.test.js backend/test/__tests__/offers.routes.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `listMatchingCargo` exists and filters by `dimensions.weightKg` + `$near`
> only (no `vehicleType`, no `transportMode`, no `volumeM3`);
> `cancelCargo` flips cargo status and does **not** touch Offer documents.
> Do not STOP just because later commits exist.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/017-matching-offers-api.md (DONE), plans/015-cargo-draft-crud.md (DONE), plans/019-admin-backend-api.md (DONE — admin cancel cascade)
- **Category**: direction
- **Planned at**: commit `39fe0a7`, 2026-09-05

## Why this matters

V6 Phase 1 matching is specified as vehicle-aware, not "every open cargo":

- **Searching / viewing transportation options** (§1)
- **Viewing matching transport requests**: "Lists open cargo requests matching
  the driver's **vehicle type and location**" (§3)
- **Viewing cargo parameters / route destinations** for the accepted driver (§3)

Plan 017's index note claimed `GET /api/matching/cargo` filters by "vehicle
capacity + origin `$near`". Live code (`matchingService.js:62-93`) does
exactly that and **nothing else**:

- `vehicleId` → `dimensions.weightKg $lte vehicle.capacityWeightKg`
- optional `lat`/`lng`/`radiusKm` → `$near` on `origin.location`
- no `vehicleType` filter
- no `transportMode` filter
- no `capacityVolumeM3` filter

A reefer truck therefore sees open sea/air cargo and oversized dry loads.
Owners who cancel an `open` cargo also leave driver bids sitting at
`pending` forever — 017 deferred "cancel-time offer rejection" on purpose
(`plans/017-matching-offers-api.md` out-of-scope). Accept already requires
cargo `open`, so those bids cannot be awarded, but `GET /api/offers` still
shows them as live pending work.

This plan closes both holes on the existing models. No new collections.

## Current state

`backend/src/services/matchingService.js` — the list query today (full
function, 62–93). Capacity is weight-only; `vehicle.vehicleType` is loaded
and then ignored:

```js
async function listMatchingCargo({ userId, vehicleId, lat, lng, radiusKm }) {
  const hasLat = hasValue(lat);
  const hasLng = hasValue(lng);
  if (hasLat !== hasLng) fail("validation_error");

  const query = { status: "open" };
  let sortByDistance = false;

  if (hasLat) {
    const latNum = parseCoordinate(lat);
    const lngNum = parseCoordinate(lng);
    const radius = parseRadius(radiusKm);
    query["origin.location"] = {
      $near: {
        $geometry: { type: "Point", coordinates: [lngNum, latNum] },
        $maxDistance: radius * 1000,
      },
    };
    sortByDistance = true;
  }

  if (hasValue(vehicleId)) {
    const vehicle = await findOwnedActiveVehicle({ userId, vehicleId });
    query["dimensions.weightKg"] = { $lte: vehicle.capacityWeightKg };
  }

  if (sortByDistance) {
    return Cargo.find(query).limit(MAX_LIST);
  }
  return Cargo.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
}
```

`findOwnedActiveVehicle` (same file, 49–55) already returns the full
Vehicle document (`vehicleType`, `capacityWeightKg`, `capacityVolumeM3`,
`status`). Reuse it — do not write a second lookup.

`backend/src/models/Vehicle.js` enums (do not change):

```js
const VEHICLE_TYPES = ['truck', 'trailer', 'van', 'reefer', 'tanker', 'other'];
```

`backend/src/models/Cargo.js` enums (do not change):

```js
const TRANSPORT_MODES = ['land', 'sea', 'air', 'rail', 'multimodal'];
const SPECIAL = ['hazardous', 'fragile', 'refrigerated', 'livestock', 'oversized', 'other'];
```

Mode ↔ vehicle compatibility (this plan's product rule — inline so the
executor does not invent a different matrix):

| `Cargo.transportMode` | Eligible `Vehicle.vehicleType` |
|-----------------------|--------------------------------|
| `land`                | all six types                  |
| `multimodal`          | all six types (road leg)       |
| `sea` / `air` / `rail`| **none** — a road vehicle cannot take the job. Hide these from `GET /api/matching/cargo` whenever `vehicleId` is supplied. |

When `vehicleId` is **omitted**, keep today's behavior: return every `open`
cargo (optionally `$near`-filtered). Drivers browsing without a truck still
see the market; bidding still requires a `vehicleId` on `POST /api/offers`.

Reefer / hazardous extra rule, applied only when `vehicleId` is present:

- If cargo `specialCharacteristics` includes `refrigerated` and
  `vehicle.vehicleType !== 'reefer'`, exclude the cargo.
- Other specials (`hazardous`, `fragile`, `livestock`, `oversized`, `other`)
  do **not** exclude — there is no matching vehicle class for them. Do not
  invent a tanker↔hazardous coupling in this plan.

Volume: when `vehicleId` is present, also require
`dimensions.volumeM3 $lte vehicle.capacityVolumeM3` (same "0 means
unspecified" semantics as weight — schema min is 0, so `$lte` is enough).

`backend/src/routes/matching.js:37-45` already forwards `vehicleId`, `lat`,
`lng`, `radiusKm`. **Do not add new query params.** All new filters derive
from the Vehicle document.

`backend/src/services/cargoService.js` cancel today (106–112) — status only:

```js
async function cancelCargo({ ownerUserId, id }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft' && cargo.status !== 'open') fail('invalid_status');
  cargo.status = 'cancelled';
  await cargo.save();
  return cargo;
}
```

`backend/src/services/adminService.js` `cancelCargoAdmin` (186–218) already
cancels an in-flight Shipment when the cargo was `matched`. It does **not**
reject leftover `pending` offers for `open` cargo. Mirror the offer cleanup
in **both** cancel paths (owner + admin) so a cancelled posting never leaves
`pending` bids.

`backend/src/models/Offer.js` statuses: `pending | accepted | rejected | withdrawn`.
Rejecting (not withdrawing) is the right cancel-time transition: withdraw is
the **driver's** action; reject is the marketplace telling the driver the
job is gone. `acceptOffer` already does `Offer.updateMany({ cargoId, status:
'pending' }, { status: 'rejected' })` for the losing bids — copy that query.

`backend/src/services/matchingService.js` uses **double quotes**.
`cargoService.js` / `adminService.js` use **single quotes**. When you edit a
file, match **that file's** existing quote style. Do not reformat the whole
file.

`backend/test/__tests__/matching.routes.test.js` already covers weight
filter, `$near`, inactive vehicle, owner-role 403. It does **not** assert
mode or reefer filtering. `createAndPublishCargo` helper defaults
`transportMode: 'land'`.

Repo conventions:

- CommonJS, 2-space, `fail(code)`, allowlists, `MAX_LIST = 100`.
- Tests: first line `require('../setup');`. `await Cargo.init()` before any
  `$near` query if a new geo test is added (existing `$near` test already
  works because 015/017 called `Cargo.init` indirectly via first insert;
  if a geo test flakes, add `await Cargo.init()` in that test — do **not**
  switch to `MongoMemoryReplSet`).
- Jest: `cd backend && npm test`. Hang workaround:
  `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 39fe0a7..HEAD -- backend/src/services/matchingService.js backend/src/services/cargoService.js backend/src/services/adminService.js backend/src/routes/matching.js backend/src/models/Cargo.js backend/src/models/Vehicle.js backend/src/models/Offer.js backend/test/__tests__/matching.routes.test.js backend/test/__tests__/cargo.routes.test.js backend/test/__tests__/offers.routes.test.js` | empty or unrelated later commits |
| Syntax | `cd backend && node --check src/services/matchingService.js && node --check src/services/cargoService.js && node --check src/services/adminService.js && node --check test/__tests__/matching.routes.test.js && node --check test/__tests__/cargo.routes.test.js` | exit 0 |
| App boots | `cd backend && node -e "const {createApp}=require('./src/app'); console.log(typeof createApp().listen==='function'?'ok':'fail')"` | `ok` |
| Matching tests | `cd backend && npm test -- --testPathPattern='matching.routes|cargo.routes|offers.routes'` | all pass |
| Full suite | `cd backend && npm test` | all pass |

Zero new npm packages. Do not run `npm install`.

## Suggested executor toolkit

- Skills: `amintajeran-project`, `mongoose-patterns` (`$near` + `Model.init()`,
  no ReplSet).
- Product: `resources/features-roadmap.md` Phase 1 §1 / §3 matching bullets.
- Exemplars: `matchingService.listMatchingCargo`, `acceptOffer`'s
  `Offer.updateMany` reject block, `cargo.routes.test.js` cancel tests.

## Scope

**In scope**:

- `backend/src/services/matchingService.js` (`listMatchingCargo` only, plus
  a small exported helper `rejectPendingOffersForCargo` used by cancel)
- `backend/src/services/cargoService.js` (`cancelCargo` — call the helper
  when status was `open`)
- `backend/src/services/adminService.js` (`cancelCargoAdmin` — same helper
  when status was `open` or `matched`)
- `backend/test/__tests__/matching.routes.test.js` (new filter cases)
- `backend/test/__tests__/cargo.routes.test.js` (cancel rejects pending offers)
- `backend/test/__tests__/admin.routes.test.js` (admin cancel rejects pending
  offers — add one test; do not rewrite the file)
- `plans/README.md`

**Out of scope**:

- `backend/src/models/*` — no new fields, no new indexes, no new enums.
- `backend/src/routes/matching.js` — query param list stays
  `vehicleId` / `lat` / `lng` / `radiusKm`.
- Changing `createOffer` / `acceptOffer` / `withdrawOffer` behavior other
  than what falls out of the cancelled-cargo status (accept already requires
  `open`).
- Notifications on offer-reject (plan 029 owns new notification types).
- Matching sea/air/rail to non-road assets — Vehicle is a road asset
  (plan 013 rejected stretching it). Those modes stay unlistable when a
  `vehicleId` is supplied.
- `mobile/`, `admin/` UI.
- Phase 2 GPS / companies / ratings / payments.

## Git workflow

- Stay on current branch. Do not push.
- Commits: `feat(028): tighten matching filters and reject offers on cancel`
  then `chore(028): mark plan DONE in index`.

## Steps

### Step 1: Add `rejectPendingOffersForCargo` in `matchingService.js`

Next to `acceptOffer`'s existing `Offer.updateMany`. Quote style = double
quotes (this file). Export it.

```js
async function rejectPendingOffersForCargo(cargoId) {
  await Offer.updateMany(
    { cargoId, status: "pending" },
    { status: "rejected" }
  );
}
```

Do **not** touch `accepted` / `withdrawn` / already-`rejected` offers.
Do **not** emit notifications here (029).

Add to `module.exports`.

**Verify**: `cd backend && node --check src/services/matchingService.js` → exit 0.
`cd backend && node -e "const m=require('./src/services/matchingService'); console.log(typeof m.rejectPendingOffersForCargo)"`
→ `function`.

### Step 2: Filter `listMatchingCargo` by mode, volume, reefer

Inside the `if (hasValue(vehicleId))` block, after
`findOwnedActiveVehicle`, extend `query` (do not replace the weight clause):

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

Notes:

- `$nin: ["refrigerated"]` still returns cargo whose specials array is
  empty or contains other values. Cargo with `refrigerated` plus another
  special is still excluded for non-reefers — that is correct.
- Do **not** add a `vehicleType` equality against cargo — cargo has no
  vehicle-type field. Mode + reefer-special is the whole compatibility
  matrix for Phase 1.
- When `vehicleId` is omitted, do not add these clauses (market browse).

Do not change `$near` / radius / inactive-vehicle / not_found behavior.

**Verify**: `grep -n "transportMode" backend/src/services/matchingService.js`
→ the `$in: ["land", "multimodal"]` line (and no schema edits).
`grep -n "capacityVolumeM3" backend/src/services/matchingService.js` → one
query use.

### Step 3: Call the helper from both cancel paths

`backend/src/services/cargoService.js` — require matchingService **inside
the function** or at top-level. Top-level is fine: `matchingService`
already requires `shipmentService`, not `cargoService`, so no cycle.

```js
const matchingService = require('./matchingService');

async function cancelCargo({ ownerUserId, id }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft' && cargo.status !== 'open') fail('invalid_status');
  const wasOpen = cargo.status === 'open';
  cargo.status = 'cancelled';
  await cargo.save();
  if (wasOpen) {
    await matchingService.rejectPendingOffersForCargo(cargo._id);
  }
  return cargo;
}
```

Draft cancel has no offers (publish is what makes cargo biddable). Skip the
helper for drafts.

`backend/src/services/adminService.js` `cancelCargoAdmin`: after the cargo
save (and in addition to the existing shipment-cancel block), always reject
pending offers for that cargoId:

```js
const matchingService = require('./matchingService');
// inside cancelCargoAdmin, after cargo.save():
await matchingService.rejectPendingOffersForCargo(cargo._id);
```

Admin cancel of `matched` cargo should still reject any straggler
`pending` bids (there should be none after accept, but the updateMany is
idempotent). Keep the existing shipment-cancel + notify block untouched.

**Verify**: `cd backend && node --check src/services/cargoService.js && node --check src/services/adminService.js` → exit 0.
Circular-require smoke:
`cd backend && node -e "require('./src/services/cargoService'); require('./src/services/matchingService'); require('./src/services/adminService'); console.log('ok')"`
→ `ok`. If this throws a cycle, STOP and report — do not invent a third
module. (Expected: no cycle because matchingService does not require
cargoService.)

### Step 4: Tests

Keep every existing matching/cargo/admin test green. Add:

**`matching.routes.test.js`** (same helpers: `createAndPublishCargo`,
`createDriverWithVehicle`):

1. `vehicleId` filter hides `transportMode: 'sea'` (and `'air'`, one
   assertion with two published cargoes is enough) while still returning
   the land cargo. Use a truck.
2. `vehicleId` filter still returns `transportMode: 'multimodal'` for a
   truck.
3. `vehicleId` filter hides cargo with `specialCharacteristics: ['refrigerated']`
   when the vehicle is `vehicleType: 'truck'`.
4. Same refrigerated cargo **is** returned when the vehicle is
   `vehicleType: 'reefer'` (and weight/volume still fit).
5. `vehicleId` filter hides cargo whose `dimensions.volumeM3` exceeds
   `vehicle.capacityVolumeM3` (mirror the existing weight test).
6. Without `vehicleId`, a sea cargo **is** listed (browse path unchanged).

**`cargo.routes.test.js`**:

7. Publish a cargo, have a second user-as-driver `POST /api/offers` a
   pending bid, then owner `POST /api/cargo/:id/cancel`. Assert cargo
   `cancelled` and `GET /api/offers` as that driver now shows the bid as
   `rejected` (not `pending`, not `withdrawn`).
   Use the existing `registerDriver` helper already in this file (it
   creates a driver-only user). That helper does **not** create a
   DriverProfile/Vehicle — so either:
   - call `POST /api/driver/profile` + `POST /api/driver/vehicles` like
     `matching.routes.test.js`, or
   - put this case in `offers.routes.test.js` which already has
     `createDriverWithVehicle`. Prefer **offers.routes.test.js** if wiring
     a driver in cargo.routes.test.js looks messy. One test, one file —
     do not duplicate.

**`admin.routes.test.js`**:

8. Admin cancel of an `open` cargo with a pending offer flips that offer
   to `rejected`. Reuse the file's existing admin-token + cargo helpers.
   If those helpers cannot create a driver offer without a large rewrite,
   put the assertion in `offers.routes.test.js` instead and skip the admin
   file — but then also call `cancelCargoAdmin` through
   `POST /api/admin/cargo/:id/cancel` with the admin token already minted
   in `admin.routes.test.js`. Prefer keeping it next to the other admin
   cancel tests if a driver setup is already possible there.

Do **not** weaken an existing test to make a new one pass.

**Verify**: `cd backend && npm test -- --testPathPattern='matching.routes|cargo.routes|offers.routes|admin.routes'`
→ all pass. Then `cd backend && npm test`.

### Step 5: Mark DONE

Update `plans/README.md` 028 row. Commit per Git workflow.

## Test plan

- New cases in Step 4. Pattern: `backend/test/__tests__/matching.routes.test.js`
  (`createAndPublishCargo`, Bearer tokens, exact `{ error }` bodies).
- Regression: existing weight / `$near` / inactive-vehicle / owner-403 tests
  must still pass unchanged.
- Verification: `cd backend && npm test` → all pass.

## Done criteria

- [ ] `listMatchingCargo` with a `vehicleId` constrains `transportMode` to
      `land|multimodal`, `volumeM3 $lte capacity`, and non-reefer vehicles
      exclude `refrigerated` specials
- [ ] `grep -n "rejectPendingOffersForCargo" backend/src/services/cargoService.js backend/src/services/adminService.js` → at least one hit each
- [ ] Owner cancel of `open` cargo leaves no `Offer` with `status: 'pending'`
      for that `cargoId` (proven by a new test)
- [ ] `cd backend && npm test` exits 0
- [ ] No model/schema/index changes
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` 028 row updated

## STOP conditions

- Current-state excerpts no longer match live code.
- A verification command fails twice.
- You think you need a new Vehicle type (`ship`, `plane`, `wagon`) — you
  do not; hide non-land modes when filtering by a road vehicle instead.
- You are about to notify drivers of the rejected bid (that's 029).
- Circular require between cargoService and matchingService. Report it.
- You are about to change `POST /api/offers` validation to require
  matching mode — out of scope; listing is the filter, bidding on a
  visible cargo is enough for Phase 1. (A driver who omits `vehicleId` on
  GET can still bid on sea cargo with a truck. That residual is accepted
  for this plan. Do **not** silently "fix" it by adding a mode check in
  `createOffer` unless a follow-up plan says so.)

## Maintenance notes

- If product later books sea/air/rail capacity, do **not** stretch
  `Vehicle.vehicleType`. Add a different asset model. 013 recorded this.
- Reefer↔refrigerated is the only special-characteristic coupling. A
  future hazardous/tanker rule belongs in a new plan, not a drive-by here.
- Plan 029 may want an `offer_rejected` notification when this helper
  runs — keep the helper notification-free so 029 can wrap it.
- Reviewer: confirm browse-without-`vehicleId` still returns sea cargo, or
  drivers with no truck selected will see an empty market.

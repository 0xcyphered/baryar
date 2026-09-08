# Plan 051: Drive matching list queries from vehicleFitsCargo (single eligibility source)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to
> the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row
> for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat baaa248..HEAD -- backend/src/services/matchingService.js backend/test/__tests__/matching.routes.test.js backend/test/__tests__/offers.routes.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `listMatchingCargo` still inlines `transportMode $in land/multimodal`,
> `weightKg $lte`, `volumeM3 $lte`, and non-reefer `$nin refrigerated`;
> `createOffer` still calls `vehicleFitsCargo`. Do not STOP just because
> later commits exist.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/028-matching-filters-cancel-offers.md (DONE), plans/036-offer-matching-eligibility.md (DONE), plans/049-driver-verification-gate.md (soft — 049 edits the top of `listMatchingCargo` / `createOffer`; land 049 first so this plan's excerpts still apply)
- **Category**: tech-debt + tests
- **Planned at**: commit `baaa248`, 2026-09-06

## Why this matters

Plan 036 extracted `vehicleFitsCargo(vehicle, cargo)` for the **write**
path. The **list** path (`listMatchingCargo`) still duplicates the same
four rules as a Mongo query:

```js
query["dimensions.weightKg"] = { $lte: vehicle.capacityWeightKg };
query["dimensions.volumeM3"] = { $lte: vehicle.capacityVolumeM3 };
query.transportMode = { $in: ["land", "multimodal"] };
if (vehicle.vehicleType !== "reefer") {
  query.specialCharacteristics = { $nin: ["refrigerated"] };
}
```

vs the helper:

```js
if (mode !== "land" && mode !== "multimodal") return false;
if (weight > vehicle.capacityWeightKg) return false;
if (volume > vehicle.capacityVolumeM3) return false;
if (vehicle.vehicleType !== "reefer" && specials.includes("refrigerated")) return false;
```

They agree today. They will not stay agreed: the next special
(hazardous, tanker) or a sea-mode vehicle will get added to one side.
This plan makes the list query a translation of the helper so there is
one matrix.

Behaviour must stay identical: browse **without** `vehicleId` stays
unfiltered (sea cargo still listed); with `vehicleId`, sea/air/rail
hidden, over-weight/volume hidden, refrigerated hidden unless reefer.
Do not change HTTP contracts.

## Current state

`backend/src/services/matchingService.js` (verbatim at `baaa248`):

```js
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

async function listMatchingCargo({ userId, vehicleId, lat, lng, radiusKm }) {
  // ... lat/lng pair validation, optional $near ...
  if (hasValue(vehicleId)) {
    const vehicle = await findOwnedActiveVehicle({ userId, vehicleId });
    query["dimensions.weightKg"] = { $lte: vehicle.capacityWeightKg };
    query["dimensions.volumeM3"] = { $lte: vehicle.capacityVolumeM3 };
    query.transportMode = { $in: ["land", "multimodal"] };
    if (vehicle.vehicleType !== "reefer") {
      query.specialCharacteristics = { $nin: ["refrigerated"] };
    }
  }
  // Cargo.find(query).limit(MAX_LIST)
}
```

If 049 has landed, `assertApprovedDriver(userId)` sits at the top of
`listMatchingCargo` / `createOffer`. Keep those calls. This plan only
replaces the vehicle-filter block.

Existing HTTP tests in `matching.routes.test.js` (028 block) and
`offers.routes.test.js` (036 block) are the contract. This plan adds
**unit** tests for `vehicleFitsCargo` + `matchingQueryForVehicle` so a
future rule change fails in one place.

Quote style: this file is **double quotes**. New helpers in this file
use double quotes.

Weight/volume `0` on cargo means "unspecified" (schema min 0). `$lte`
and `<=` are the whole rule — do not add `$or: [{weightKg:0}, ...]`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Unit | `cd backend && npx jest --runInBand --forceExit test/__tests__/matchingService.test.js` | exit 0 |
| HTTP | `cd backend && npx jest --runInBand --forceExit test/__tests__/matching.routes.test.js test/__tests__/offers.routes.test.js` | exit 0 |
| Full | `cd backend && npm test` | exit 0 (or only known driver.routes 21/7 red at HEAD) |
| Hang workaround | `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` | memory Mongo starts |

## Scope

**In scope** (create):

- `backend/test/__tests__/matchingService.test.js`

**In scope** (edit):

- `backend/src/services/matchingService.js` — add
  `matchingQueryForVehicle(vehicle)`, use it from `listMatchingCargo`;
  export it next to `vehicleFitsCargo`

**Out of scope**:

- Changing filter semantics (no hazardous/tanker rules, no sea
  vehicles — 013/028 rejected stretching `Vehicle.vehicleType`).
- In-memory filter after `Cargo.find` (keep a Mongo query; do not
  load every open cargo and `filter(vehicleFitsCargo)`).
- `MAX_LIST` extraction (038 rejected).
- `mobile/` / `admin/`.
- Plan 049 verification (already a separate assert). If 049 is still
  TODO, do not add `assertApprovedDriver` here — leave that to 049.
- Plan 050 / 052.

## Git workflow

- Branch: `advisor/051-matching-query-from-helper`
- Commits: `refactor(051): build matching list query from vehicleFitsCargo`
  then `chore(051): mark plan DONE in index`
- Do not push.

## Steps

### Step 1: Unit tests for the helper and the query translator (TDD)

Create `backend/test/__tests__/matchingService.test.js`. First line:
`require('../setup');` (repo convention even though these cases are
pure).

```js
require('../setup');
const {
  vehicleFitsCargo,
  matchingQueryForVehicle,
} = require('../../src/services/matchingService');

function vehicle(overrides) {
  return {
    vehicleType: 'truck',
    capacityWeightKg: 10000,
    capacityVolumeM3: 40,
    ...overrides,
  };
}

function cargo(overrides) {
  return {
    transportMode: 'land',
    dimensions: { weightKg: 1000, volumeM3: 10 },
    specialCharacteristics: [],
    ...overrides,
  };
}

describe('vehicleFitsCargo', () => {
  test('land cargo within cap fits a truck', () => {
    expect(vehicleFitsCargo(vehicle(), cargo())).toBe(true);
  });
  test('sea / air / rail do not fit', () => {
    expect(vehicleFitsCargo(vehicle(), cargo({ transportMode: 'sea' }))).toBe(false);
    expect(vehicleFitsCargo(vehicle(), cargo({ transportMode: 'air' }))).toBe(false);
    expect(vehicleFitsCargo(vehicle(), cargo({ transportMode: 'rail' }))).toBe(false);
  });
  test('multimodal fits', () => {
    expect(vehicleFitsCargo(vehicle(), cargo({ transportMode: 'multimodal' }))).toBe(true);
  });
  test('missing transportMode is treated as land', () => {
    const c = cargo();
    delete c.transportMode;
    expect(vehicleFitsCargo(vehicle(), c)).toBe(true);
  });
  test('weight / volume above cap do not fit; equal cap does', () => {
    expect(vehicleFitsCargo(vehicle({ capacityWeightKg: 1000 }), cargo({ dimensions: { weightKg: 1000, volumeM3: 10 } }))).toBe(true);
    expect(vehicleFitsCargo(vehicle({ capacityWeightKg: 999 }), cargo({ dimensions: { weightKg: 1000, volumeM3: 10 } }))).toBe(false);
  });
  test('missing dimensions count as 0 (unspecified) and fit', () => {
    expect(vehicleFitsCargo(vehicle(), { transportMode: 'land', specialCharacteristics: [] })).toBe(true);
  });
  test('refrigerated needs a reefer; other specials do not', () => {
    expect(vehicleFitsCargo(vehicle(), cargo({ specialCharacteristics: ['refrigerated'] }))).toBe(false);
    expect(vehicleFitsCargo(vehicle({ vehicleType: 'reefer' }), cargo({ specialCharacteristics: ['refrigerated'] }))).toBe(true);
    expect(vehicleFitsCargo(vehicle(), cargo({ specialCharacteristics: ['hazardous'] }))).toBe(true);
  });
});

describe('matchingQueryForVehicle', () => {
  test('always restricts to land/multimodal and weight/volume $lte', () => {
    const q = matchingQueryForVehicle(vehicle());
    expect(q.transportMode).toEqual({ $in: ['land', 'multimodal'] });
    expect(q['dimensions.weightKg']).toEqual({ $lte: 10000 });
    expect(q['dimensions.volumeM3']).toEqual({ $lte: 40 });
  });
  test('non-reefer adds specialCharacteristics $nin refrigerated', () => {
    const q = matchingQueryForVehicle(vehicle({ vehicleType: 'truck' }));
    expect(q.specialCharacteristics).toEqual({ $nin: ['refrigerated'] });
  });
  test('reefer does not set specialCharacteristics', () => {
    const q = matchingQueryForVehicle(vehicle({ vehicleType: 'reefer' }));
    expect(q.specialCharacteristics).toBeUndefined();
  });
});
```

Use single quotes in the **test** file (match `helpers.js` /
`httpError.test.js`). The service stays double quotes.

**Verify (RED)**: jest on this file → `matchingQueryForVehicle` is not
a function.

### Step 2: Implement `matchingQueryForVehicle` from the helper's rules

In `matchingService.js`, immediately below `vehicleFitsCargo`:

```js
function matchingQueryForVehicle(vehicle) {
  const query = {
    "dimensions.weightKg": { $lte: vehicle.capacityWeightKg },
    "dimensions.volumeM3": { $lte: vehicle.capacityVolumeM3 },
    transportMode: { $in: ["land", "multimodal"] },
  };
  if (vehicle.vehicleType !== "reefer") {
    query.specialCharacteristics = { $nin: ["refrigerated"] };
  }
  return query;
}
```

Replace the inline block in `listMatchingCargo`:

```js
if (hasValue(vehicleId)) {
  const vehicle = await findOwnedActiveVehicle({ userId, vehicleId });
  Object.assign(query, matchingQueryForVehicle(vehicle));
}
```

Do not put `status: "open"` inside `matchingQueryForVehicle` — that
predicate is the list's, not the vehicle matrix (createOffer uses
status separately).

Export `matchingQueryForVehicle` in `module.exports` next to
`vehicleFitsCargo`.

**Invariant comment** (keep, short): the Mongo query must stay a
mechanical translation of `vehicleFitsCargo`. If you add a rule to
one, add it to the other in the same commit. The unit tests in Step 1
are that checklist.

**Verify**: unit file green. Then matching + offers HTTP files green
(same counts as before this plan, plus the new unit tests).

### Step 3: Confirm no remaining inline matrix

```
rg -n 'transportMode = \{ \$in' backend/src/services/matchingService.js
```

Expected: only inside `matchingQueryForVehicle` (or not at all if you
inlined the `$in` as a property in the object literal — then grep
`$in: [\"land\"` and expect one hit).

**Verify**: `cd backend && npm test` as in Commands.

## Test plan

- New unit file in Step 1. Pattern: `pickFields.test.js` (no HTTP, no
  OTP).
- Do not duplicate the 028/036 HTTP tables. Those stay the contract.
- Do not mock Cargo.find.

## Done criteria

- [ ] `listMatchingCargo` vehicle branch is
      `Object.assign(query, matchingQueryForVehicle(vehicle))` (or
      equivalent spread); no second copy of the four predicates
- [ ] `matchingQueryForVehicle` and `vehicleFitsCargo` are both
      exported
- [ ] `backend/test/__tests__/matchingService.test.js` exists and
      covers land/sea/multimodal, weight equality, missing dimensions,
      reefer vs refrigerated, hazardous still fits, reefer query omits
      `$nin`
- [ ] Existing matching.routes + offers.routes tests still pass
- [ ] Browse without `vehicleId` still lists sea cargo (existing test
      `'without vehicleId, sea cargo is still listed'`)
- [ ] No `mobile/` / `admin/` edits; no new matching rules
- [ ] `plans/README.md` row for 051 is DONE

## STOP conditions

- You want to filter in JS after `Cargo.find` because "then there is
  truly one function". STOP. The list is capped at 100 but `$near`
  still needs a query; keep Mongo predicates.
- Adding hazardous → tanker or sea-mode vehicle types "while unifying"
  — STOP. 013/028 rejected that.
- `vehicleFitsCargo` was deleted or no longer exported (036 clients /
  tests depend on it).
- 049 is in progress on the same lines and your rebase would drop
  `assertApprovedDriver` — finish 049 first.

## Maintenance notes

- Next matching rule (e.g. tanker ↔ a new special) = one commit that
  updates `vehicleFitsCargo`, `matchingQueryForVehicle`, and
  `matchingService.test.js` together. Reviewer rejects PRs that touch
  only one side.
- Reviewer: confirm weight/volume still treat 0 as unspecified (`$lte`
  / `<=`), no `$or`.

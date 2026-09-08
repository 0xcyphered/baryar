# Plan 052: Gate matching and offers on an approved driver profile

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to
> the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row
> for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat baaa248..HEAD -- backend/src/services/matchingService.js backend/src/services/driverService.js backend/src/routes/matching.js backend/src/routes/offers.js backend/test/helpers.js backend/test/__tests__/matching.routes.test.js backend/test/__tests__/offers.routes.test.js backend/test/__tests__/driver.routes.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `createOffer` still only checks cargo `open` + owned active vehicle +
> `vehicleFitsCargo`; `listMatchingCargo` does not read
> `DriverProfile.verificationStatus`; `POST /api/driver/profile` still
> grants the `driver` role with status `pending`. Do not STOP just
> because later commits exist.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/016-driver-onboarding.md (DONE), plans/019-admin-backend.md (DONE), plans/036-offer-matching-eligibility.md (DONE)
- **Category**: correctness + tests
- **Planned at**: commit `baaa248`, 2026-09-06

## Why this matters

V6 Phase 1 §3 ("Uploading driver licenses" / "Submitting required
documents") and §5 ("Driver document verification") are implemented as
**storage + an admin decision**, but the decision is never read on the
marketplace write path.

- `POST /api/driver/profile` grants `roles: ['driver']` immediately and
  leaves `DriverProfile.verificationStatus` at `'pending'`
  (`driverService.upsertProfile`).
- Admin `POST /api/admin/drivers/:userId/verify` can flip the profile to
  `approved` / `rejected`.
- `GET /api/matching/cargo` and `POST /api/offers` only require the
  `driver` role + an owned active vehicle.

A brand-new, unverified (or rejected) driver can therefore list open
cargo and bid. Verification is theater: the admin queue has no effect
on who gets work. This plan adds one shared `assertApprovedDriver`
check on the matching list and on offer create. Onboarding
(profile / vehicles / document upload) stays open so a pending driver
can still finish their file.

This is **not** Phase 2 KYC (external identity APIs). It reuses the
existing `DriverProfile.verificationStatus` enum.

## Current state

`backend/src/services/driverService.js` — role grant, always pending:

```js
async function upsertProfile({ userId, body }) {
  const fields = pickFields(body, PROFILE_FIELDS);
  await User.updateOne({ _id: userId }, { $addToSet: { roles: 'driver' } });
  // ... create or update DriverProfile; schema default verificationStatus: 'pending'
}
```

`backend/src/services/matchingService.js` — `createOffer` today
(eligibility from 036, no verification):

```js
const cargo = await Cargo.findOne({ _id: cargoId, status: "open" });
if (!cargo) fail("invalid_status");

const vehicle = await findOwnedActiveVehicle({ userId, vehicleId });
if (!vehicleFitsCargo(vehicle, cargo)) fail("validation_error");
```

`listMatchingCargo` builds `{ status: "open" }` plus optional `$near`
and vehicle filters. It never loads `DriverProfile`.

`backend/src/models/DriverProfile.js` enum (do not extend):

```js
const VERIFICATION = ['pending', 'approved', 'rejected'];
```

Admin verify already exists (`adminService.verifyDriverProfile`) and is
tested in `admin.routes.test.js`. Do not change that handler.

`backend/test/helpers.js` `registerDriverViaProfile` / `setupDriverWithVehicle`
leave the profile pending. Almost every matching/offers test goes through
those helpers, so they must start approving **after** the new gate lands
or the whole marketplace suite goes 403.

Conventions to match:

- 2-space indent, CommonJS.
- `matchingService.js` uses **double quotes**. New code in that file
  must use double quotes. `driverService.js` / `helpers.js` use single
  quotes.
- Errors: `fail("code")` then the route `ERROR` map. New code
  `driver_unverified` → **403**.
- Tests: first line `require('../setup');`. Hang workaround:
  `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod`.
- Do not switch `MongoMemoryServer` to a replica set.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `cd backend && npm test` | exit 0 |
| Targeted | `cd backend && npx jest --runInBand --forceExit test/__tests__/matching.routes.test.js test/__tests__/offers.routes.test.js test/__tests__/driver.routes.test.js` | exit 0 |
| Coverage (optional) | `cd backend && npm run test:coverage` | exit 0, thresholds still pass |
| Hang workaround | `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` | memory Mongo starts |

If `driver.routes.test.js` test 21 (`invalid_file_type` → 500) or test 7
(`socket hang up`) fail, those are **pre-existing** (038 README: deferred
035 global error handler). Do **not** "fix" multer in this plan. A
marketplace-green run with those two still red is acceptable **only if**
they were already red at HEAD before your edits (`git stash` A/B). Plan
052 maps the multer error locally.

## Scope

**In scope**:

- `backend/src/services/matchingService.js` — `assertApprovedDriver`,
  call from `listMatchingCargo` and `createOffer`
- `backend/src/routes/matching.js` — add `driver_unverified: 403` to
  `MATCHING_ERRORS`
- `backend/src/routes/offers.js` — add `driver_unverified: 403` to
  `OFFER_ERRORS`
- `backend/test/helpers.js` — `approveDriver(userId)`; call it from
  `setupDriverWithVehicle`
- `backend/test/__tests__/matching.routes.test.js` — approve helpers;
  new pending/rejected cases
- `backend/test/__tests__/offers.routes.test.js` — new pending/rejected
  cases (setupDriverWithVehicle will already approve)
- `backend/src/services/driverService.js` — **only if** you prefer to
  put `assertApprovedDriver` here and require it from matchingService.
  matchingService does **not** currently require driverService (and
  driverService does not require matchingService), so either placement
  is cycle-free. Prefer **matchingService** (the only caller) unless you
  also want driverService tests to reuse it — then put it on
  driverService and export it.

**Out of scope**:

- Requiring individual `Document.verificationStatus === 'approved'`
  (driving_license etc.). Phase 1 gate is the **profile** flag the
  admin already sets. Per-document completeness is a later product call.
- Blocking profile/vehicle/document CRUD for pending drivers.
- Blocking `GET /api/offers`, `PATCH /api/offers/:id`,
  `DELETE /api/offers/:id` (a driver who bid before this ships, or who
  is later rejected, must still see and withdraw their own rows).
- Changing `adminService.verifyDriverProfile`.
- KYC / national-id inquiry APIs (Phase 2 §8).
- `mobile/` / `admin/` UI copy for the new 403 (client follow-up).
- Plan 035 CORS / global error handler.
- Plan 053 serializers, 054 query unification, 055 test-helper migration.

## Git workflow

- Branch: `advisor/049-driver-verification-gate`
- Commits: `feat(049): reject unverified drivers on matching and offers`
  then `chore(049): mark plan DONE in index`
- Do not push.

## Steps

### Step 1: Write the failing tests first (TDD)

In `backend/test/helpers.js`, add (single quotes):

```js
async function approveDriver(userId) {
  const DriverProfile = require('../src/models/DriverProfile');
  const profile = await DriverProfile.findOneAndUpdate(
    { userId },
    { verificationStatus: 'approved', verifiedAt: new Date(), rejectionReason: '' },
    { new: true }
  );
  if (!profile) {
    throw new Error(`approveDriver: no DriverProfile for ${userId}`);
  }
  return profile;
}
```

Export it from `makeHelpers` **and** from `module.exports` if that
keeps call sites simple. Call `await approveDriver(userId)` at the end
of `setupDriverWithVehicle` (after `createVehicle`). Do **not** change
`registerDriverViaProfile` — onboarding tests and the new "pending is
403" cases need a pending profile.

`matching.routes.test.js` currently has a **local**
`createDriverWithVehicle` that does not go through
`h.setupDriverWithVehicle`. Either:

- switch that local helper to `h.setupDriverWithVehicle` (preferred —
  it will approve), **or**
- call `await h.approveDriver(...)` inside the local helper.

Keep PHONE_* constants as they are.

Add these tests (names may vary; assertions must hold):

**matching.routes.test.js**

1. Pending driver + `vehicleId`: `GET /api/matching/cargo?vehicleId=`
   → 403 `{ error: 'driver_unverified' }`. Use
   `h.registerDriverViaProfile` + `h.createVehicle` (no approve).
2. Same pending driver **without** `vehicleId` (browse path) → also 403
   `driver_unverified`. The gate is the driver, not the vehicle filter.
3. Rejected driver (set `verificationStatus: 'rejected'` via
   `DriverProfile.updateOne`) + vehicleId → 403 `driver_unverified`.
4. Existing "lists open cargo" / sea-hidden / reefer tests still 200
   after the helper starts approving.

**offers.routes.test.js**

1. Pending driver `POST /api/offers` on open land cargo → 403
   `driver_unverified`; `Offer.countDocuments() === 0`.
2. Rejected driver same → 403; no row.
3. Existing create-offer happy path still 201 (`setupDriverWithVehicle`
   now approves).

Do **not** add these tests to `driver.routes.test.js`. Onboarding must
keep working while pending.

**Verify (RED)**: targeted jest → the new tests fail with 200 or 201
(no `driver_unverified` in the error maps yet). Existing marketplace
tests that went through `setupDriverWithVehicle` still pass once you
wired `approveDriver` (that helper change is test-only so far).

### Step 2: Implement `assertApprovedDriver`

In `matchingService.js` (double quotes):

```js
const DriverProfile = require("../models/DriverProfile");

async function assertApprovedDriver(userId) {
  const profile = await DriverProfile.findOne({ userId });
  if (!profile || profile.verificationStatus !== "approved") {
    fail("driver_unverified");
  }
  return profile;
}
```

Call it as the **first** await in `listMatchingCargo` (before lat/lng
validation is fine, or after — but before `Cargo.find`) and in
`createOffer` **before** `Cargo.findOne` / vehicle load. Fail-closed:
missing profile is the same 403 as pending/rejected (do not 404; that
would leak whether a profile row exists).

Export `assertApprovedDriver` next to `vehicleFitsCargo` so unit tests
in a later plan can require it. Not required for this plan's HTTP tests.

Add `driver_unverified: 403` to `MATCHING_ERRORS` and `OFFER_ERRORS`.
Do not add it to cargo/shipment/driver maps.

**Verify**: targeted jest → new tests 403, existing matching/offers
green.

### Step 3: Confirm onboarding is untouched

`POST /api/driver/profile` still 201/200 with `verificationStatus:
'pending'`. `POST /api/driver/vehicles` still 201 for that pending
user. No new require() of matchingService from driverService.

**Verify**:
`cd backend && npx jest --runInBand --forceExit test/__tests__/driver.routes.test.js`
→ tests 1 (profile pending) and vehicle-create still pass. Ignore
pre-existing test 21 / test 7 if they fail the same way at HEAD.

### Step 4: Full suite

**Verify**: `cd backend && npm test`

Accept only: (a) exit 0, or (b) the same two pre-existing
`driver.routes` failures as HEAD, and **no** new failures in
matching/offers/admin/cargo/shipments.

## Test plan

- New HTTP cases listed in Step 1. Pattern: `offers.routes.test.js`
  plan-036 block (status + `Offer.countDocuments()`).
- Helper `approveDriver` uses the model, not the admin HTTP API, so
  matching tests do not need an admin token.
- Do not auto-approve inside `registerDriverViaProfile`.

## Done criteria

- [ ] `listMatchingCargo` and `createOffer` both call a shared
      `assertApprovedDriver` (grep `verificationStatus` in
      `matchingService.js` finds the helper, not two inline copies)
- [ ] Pending + rejected drivers get 403 `{ error: 'driver_unverified' }`
      on `GET /api/matching/cargo` and `POST /api/offers`
- [ ] Approved drivers still match and bid (existing tests green)
- [ ] `POST /api/driver/profile` still creates `pending` profiles
- [ ] `GET/PATCH/DELETE /api/offers` unchanged for the owning driver
- [ ] `MATCHING_ERRORS` and `OFFER_ERRORS` include
      `driver_unverified: 403`
- [ ] `helpers.setupDriverWithVehicle` approves; `registerDriverViaProfile`
      does not
- [ ] No `mobile/` / `admin/` edits; no Document-status gate
- [ ] `plans/README.md` row for 049 is DONE

## STOP conditions

- `DriverProfile` no longer has `verificationStatus` or the enum lost
  `approved`.
- You think the gate should require every document kind to be approved
  — STOP and report; do not invent a completeness matrix.
- Matching browse-without-vehicleId feels like it should stay open for
  pending drivers. The plan says close it. If product later wants
  browse-open / bid-closed, that is a follow-up; do not split the gate
  in this slice.
- Temptation to also block vehicle create — STOP. Onboarding stays open.
- Implementing 035's global error handler "so test 21 passes" — STOP.

## Maintenance notes

- Mobile driver matching/offer screens will start seeing
  `driver_unverified`. A later client plan should map that to Persian
  copy ("حساب شما هنوز تایید نشده") the same way 032 mapped
  `cargo_limit`. Do not bundle UI into this API slice.
- Admin verify is the only self-serve promotion path. If ops ever needs
  a bootstrap approved driver, that is a fixture/script, not a public
  route.
- Reviewer: confirm rejected ≠ pending handling is the same 403 (no
  extra `driver_rejected` code).
- Plan 054 will rewrite the matching query builder in the same file —
  land 052 first so 054 does not also touch the verification lines.

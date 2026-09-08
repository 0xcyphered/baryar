# Plan 055 — Finish test-helper migration, map multer errors, leftover coverage

**Priority:** P2 | **Effort:** M | **Depends on:** 038, 039 | **Scope:** backend/

## §1 Problem

Three HTTP test files (driver, admin, notifications) duplicate
`register()`, `registerDriverViaProfile()`, `createVehicle()`, and
`cargoBody()` helpers that already exist in `test/helpers.js` (plan 039).
Plan 052 mapped the `registerDriverViaProfile` helper to also call
`approveDriver`, but the three HTTP test files still have local copies.

Additionally, the multer `fileFilter` on `POST /api/driver/documents/upload`
returns a bare error (`cb(err)`) that crashes to 500 because no Express
error handler catches it (global error handler is deferred in plan 035).
Test 21 in driver.routes.test.js expects 400 `invalid_file_type` but gets
500.

Finally, the admin `listShipmentsAdmin` enrichment (cargo title + owner/driver
names) has no dedicated test, and the OTP service `sendOtp` production branch
(mock `NODE_ENV=production`) is untested.

## §2 Changes

### 2a. Fix multer error on `/documents/upload` (driver.js route)

Wrap `upload.single('file')` in a function that catches the fileFilter error
and routes it through `sendDriverError` (which already maps `invalid_file_type`
→ 400):

```js
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return sendDriverError(res, err);
    next();
  });
}

router.post('/documents/upload', handleUpload, async (req, res) => { ... });
```

Single file: `src/routes/driver.js`. ~6 lines changed.

### 2b. Migrate driver.routes.test.js to shared helpers

- Import `{ applyTestEnv, makeHelpers, FIXED_CODE, canon }` from `../helpers`
- Call `applyTestEnv()` in `beforeAll` (replaces local env setup)
- Replace local `register()` → `h.register()` (from `makeHelpers(app)`)
- Replace local `registerDriverViaProfile()` → `h.registerDriverViaProfile()`
- Replace local `createVehicle()` → raw supertest POST (the helper returns
  the vehicleId, but driver tests need the full response body for status
  assertions — keep a thin local wrapper)
- Remove local `canon`, `FIXED_CODE` constants
- Keep `registerRoleOnly()` as a local helper (not in shared helpers) but use
  `canon` from helpers instead of re-defining it
- Keep `uploadDoc()`, `vehicleBody()`, `PNG_1X1` as local (driver-specific)

~40 lines removed, ~5 added.

### 2c. Migrate admin.routes.test.js to shared helpers

- Import `{ applyTestEnv, makeHelpers, cargoBody, canon }` from `../helpers`
- Call `applyTestEnv()` in `beforeAll`
- Replace local `createAdmin()` → `h.createAdmin(phone)` from helpers
- Replace local `register()` → `h.register()`
- Replace local `registerDriverViaProfile()` → `h.registerDriverViaProfile()`
  (note: helpers version calls `approveDriver` automatically, which matches
  what the admin tests need for the driver-verify tests)
- Replace local `cargoBody()` → import from helpers (the local version takes
  a `title` arg; helpers takes overrides — adapt calls)
- Remove local `canon`, `FIXED_CODE`, `JWT_SECRET` constants
- Keep `uploadAsDriver()` as local (admin-specific: uses raw supertest)

~30 lines removed, ~8 added.

### 2d. Migrate notifications.routes.test.js to shared helpers

- Import `{ applyTestEnv, makeHelpers, cargoBody, canon }` from `../helpers`
- Call `applyTestEnv()` in `beforeAll`
- Replace local `register()` → `h.register()`
- Replace local `registerDriverViaProfile()` → `h.registerDriverViaProfile()`
  (helpers version includes approveDriver; notifications tests also approve)
- Replace local `createVehicle()` → `h.createVehicle()`
- Replace local `publishCargo()` → `h.publishCargo()`
- Replace local `openCargoBody()` → `cargoBody` from helpers
- Remove local `canon`, `FIXED_CODE` constants
- Keep `setupDriverWithVehicle()` as local but simplify to use helpers
  (the helpers version already calls `approveDriver`, which notifications
  tests don't need — but since notifications tests don't test the
  verification gate, having an approved driver is harmless and matches
  the setup they already do)
- Keep `awardCargo()`, `openCargoForOffer()`, `makeOffer()` as local
  (notifications-specific orchestration)

~45 lines removed, ~10 added.

### 2e. Additional coverage: admin shipments enrichment test

Add a test to `admin.routes.test.js` that creates a shipment (via the full
award flow), then calls `GET /api/admin/shipments` and asserts:
- `cargoTitle` is populated
- `ownerName` / `driverName` are populated (not empty)
- `status`, `pickupAt`, `createdAt` are present

~20 lines added.

### 2f. Additional coverage: OTP production log branch

Add a test to `otpService.test.js` that sets `NODE_ENV=production`, calls
`sendOtp`, and asserts the console.log message does NOT contain the code
(only phone). Restore `NODE_ENV` afterwards.

~10 lines added.

## §3 Files touched

| File | Action |
|------|--------|
| `src/routes/driver.js` | Wrap upload.single error handling (~6 lines) |
| `test/__tests__/driver.routes.test.js` | Migrate to shared helpers (~35 lines net reduction) |
| `test/__tests__/admin.routes.test.js` | Migrate to shared helpers (~22 lines net reduction) |
| `test/__tests__/notifications.routes.test.js` | Migrate to shared helpers (~35 lines net reduction) |
| `test/__tests__/otpService.test.js` | Add production log test (~10 lines) |

**No model/route contract changes. All test-only + multer error mapping.**

## §4 Verification

1. `cd backend && npx --no-install jest --runInBand --silent 2>&1 | tail -5`
   — all 24 suites green, 0 failures
2. `cd backend && npx --no-install jest --runInBand 2>&1 | grep "Tests:"`
   — count ≥ 288 (286 current + 2 new)
3. Confirm test 21 (multer disallowed mime) now passes with status 400
4. `git commit -m "test(055): migrate helpers, map multer error, add coverage"`

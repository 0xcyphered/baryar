# Plan 055: Finish test-helper migration, map multer errors, raise coverage on remaining branches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to
> the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row
> for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat baaa248..HEAD -- backend/test backend/src/routes/auth.js backend/src/routes/driver.js backend/src/services/otpService.js backend/src/services/notificationService.js backend/src/services/adminService.js backend/src/middleware/maintenance.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `admin.routes.test.js`, `driver.routes.test.js`,
> `notifications.routes.test.js` still inline `register` /
> `FIXED_CODE` / `canon`; `routes/auth.js` still has a local
> `sendAuthError` instead of `sendError`; multer `fileFilter` still
> `cb(err)` which Express 4 turns into an unhandled error (test 21
> expects 400, gets 500). Do not STOP just because later commits exist.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/038-shared-backend-helpers.md (DONE), plans/039-backend-coverage-baseline.md (DONE)
- **Category**: tests + tech-debt
- **Planned at**: commit `baaa248`, 2026-09-06

## Why this matters

Plan 039 added `backend/test/helpers.js` and migrated cargo / matching /
offers / shipments / settings.enforcement. Three large HTTP suites still
copy the same OTP loop:

- `backend/test/__tests__/admin.routes.test.js` (local `createAdmin`,
  `register`, `registerDriverViaProfile`, `cargoBody`)
- `backend/test/__tests__/driver.routes.test.js` (local `register`,
  `registerDriverViaProfile`, `canon`, `FIXED_CODE`)
- `backend/test/__tests__/notifications.routes.test.js` (same)

That is leftover DRY debt, not a product hole. Same plan batch also
left two **real test failures** at HEAD that 038/039 documented as
"pre-existing / 035's missing global handler":

1. `driver.routes.test.js` test 21 —
   `POST /documents/upload` with `image/gif` expects 400
   `invalid_file_type`, gets **500**. Multer `fileFilter` calls
   `cb(err)` with `err.code = 'invalid_file_type'`. There is no
   Express error middleware (035 DEFERRED), so the error never reaches
   `sendDriverError`.
2. Test 7 (`duplicate plate`) has been seen as `socket hang up` when
   a previous unhandled multer error leaves the app in a bad state.
   Mapping the multer error **on the route** (not a global handler)
   is the local, in-scope fix. Do **not** implement 035's global
   handler.

Coverage at `baaa248` (`npm run test:coverage`) is already above the
039 floor (≈90/78/95/92) even with those two failures. This plan does
not raise the threshold. It fills the branches 039 listed and then
missed or implemented as smoke-only:

- `otpService.sendOtp` production log still includes `{ phone, code }`
  in tests (`otpService.test.js` never sets `NODE_ENV=production`).
- `notificationService.deliver` production branch
  (`notificationService.js:11-18`) uncovered.
- `adminService.listShipmentsAdmin` (`:320-353`) uncovered — the admin
  shipments test hits the empty-list early return only.
- `auth.js` `sendAuthError` is a leftover inline of `sendError`
  (038 listed auth.js in scope; the local function remains).
- `shipmentService.pickEventFields` still inlines the pick loop
  instead of `pickFields` (038 extracted pickFields everywhere else).

039 explicitly said: do not implement 035 while testing. This plan
honors that: local multer mapping on `/documents/upload` only.

## Current state

Multer on `backend/src/routes/driver.js`:

```js
fileFilter: (req, file, cb) => {
  if (storageService.ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
  const err = new Error('invalid_file_type');
  err.code = 'invalid_file_type';
  return cb(err);
},

router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'validation_error' });
    // ...
  } catch (err) {
    return sendDriverError(res, err);
  }
});
```

`DRIVER_ERRORS` already has `invalid_file_type: 400`. The catch never
runs for `fileFilter` rejections.

`routes/auth.js` still:

```js
function sendAuthError(res, err) {
  const code = err && err.code;
  const map = { invalid_phone: 400, otp_cooldown: 429, /* ... */ };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}
```

That is `sendError` without the `ValidationError` branch. OTP handlers
do not throw mongoose ValidationError today; switching to `sendError`
is behaviour-preserving for current codes.

`otpService.test.js` (entire file):

```js
test('does not throw when called with a valid Iranian mobile phone', () => {
  expect(() => { otpService.sendOtp({ phone: '09121230901', code: '123456' }); }).not.toThrow();
});
```

`notificationService.test.js` is the same smoke for `deliver`.

`admin.routes.test.js` GET `/api/admin/shipments` only asserts
`res.body.shipments` is an Array (usually `[]`).

`test/helpers.js` already exports `makeHelpers(app)` with `register`,
`registerDriverViaProfile`, `createVehicle`, `publishCargo`,
`setupDriverWithVehicle`, `createAdmin`, `makeDriverOnlyToken`, plus
`applyTestEnv`, `cargoBody`, `canon`, `FIXED_CODE`, `JWT_SECRET`.

If 049 landed, `setupDriverWithVehicle` also approves the profile.
`registerDriverViaProfile` stays pending — driver.routes needs that.

`auth.test.js` keeps a local `register()` on purpose (039: "auth.test.js
still local") because it asserts OTP side effects (challenge hash,
cooldown). Do **not** migrate auth.test.js.

Quote style: helpers and driver/admin tests that you touch should stay
**single quotes**. `notifications.routes.test.js` currently mixes;
when you replace the local register, do not reformat the rest of the
file.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Driver suite | `cd backend && npx jest --runInBand --forceExit test/__tests__/driver.routes.test.js` | exit 0, **including test 21 = 400** |
| Admin suite | `cd backend && npx jest --runInBand --forceExit test/__tests__/admin.routes.test.js` | exit 0 |
| Notifications | `cd backend && npx jest --runInBand --forceExit test/__tests__/notifications.routes.test.js` | exit 0 |
| Auth | `cd backend && npx jest --runInBand --forceExit test/__tests__/auth.test.js` | exit 0 (sendAuthError swap) |
| Full | `cd backend && npm test` | exit 0 |
| Coverage | `cd backend && npm run test:coverage` | exit 0, ≥ 70/55/70/70 |
| Hang workaround | `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` | memory Mongo starts |

## Scope

**In scope**:

- `backend/src/routes/driver.js` — wrap `upload.single('file')` with a
  local error mapper (see Step 2)
- `backend/src/routes/auth.js` — replace `sendAuthError` with
  `sendError(res, err, AUTH_ERRORS)`
- `backend/src/services/shipmentService.js` — `pickEventFields` →
  `pickFields(body, EVENT_FIELDS)` (behaviour: pickFields skips
  `undefined`; the current loop copies own-properties including
  `undefined`. `addEvent` already treats `fields.note === undefined`
  as `""`. Confirm after the swap that `POST /events` with `{}`
  still 400 `validation_error` for missing eventType — existing
  shipments.routes tests cover this)
- `backend/test/__tests__/admin.routes.test.js` — use `makeHelpers`
- `backend/test/__tests__/driver.routes.test.js` — use `makeHelpers`
  for register / registerDriverViaProfile (keep local `vehicleBody` /
  `uploadDoc` / PNG fixture — those are file-specific)
- `backend/test/__tests__/notifications.routes.test.js` — use
  `makeHelpers`
- `backend/test/__tests__/otpService.test.js` — production vs
  non-production log (restore `NODE_ENV`)
- `backend/test/__tests__/notificationService.test.js` — production
  deliver log must not include `title`
- `backend/test/__tests__/admin.routes.test.js` — one test that
  creates a real shipment then `GET /api/admin/shipments` asserts
  `id`, `cargoTitle`, `driverName` (covers `listShipmentsAdmin`
  enrich path)

**Out of scope**:

- Plan 035 global Express error handler / CORS / JWT pin.
- Raising `coverageThreshold` above 70/55/70/70.
- Migrating `auth.test.js` onto helpers.
- `mobile/` / `admin/` apps.
- Changing multer limits or allowed MIME.
- Plan 052/053/054 behaviour. If those have landed, keep their
  assertions; do not revert serializers or verification.

## Git workflow

- Branch: `advisor/052-test-helpers-and-multer-map`
- Commits: `fix(052): map multer fileFilter errors on driver upload`,
  `test(052): migrate remaining HTTP suites onto helpers + cover leftover branches`,
  then `chore(052): mark plan DONE in index`
- Do not push.

## Steps

### Step 1: Prove test 21 is red at HEAD (characterization)

**Verify**:
`cd backend && npx jest --runInBand --forceExit test/__tests__/driver.routes.test.js -t "disallowed mime"`
→ fail, received 500.

Do not "fix" it by changing the test to expect 500.

### Step 2: Map multer errors on the upload route only

In `driver.js`, keep `fileFilter` as it is (it already sets
`err.code = 'invalid_file_type'`). Multer also sets `err.code =
'LIMIT_FILE_SIZE'` on oversize, which `DRIVER_ERRORS` already maps to
413.

Express 4 does not pass `fileFilter` / limit errors into the async
handler's `catch`. Wrap the middleware:

```js
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return sendDriverError(res, err);
    return next();
  });
}

router.post('/documents/upload', handleUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'validation_error' });
    const document = await driverService.createDocumentFromUpload({
      userId: req.user._id,
      body: req.body,
      file: req.file,
    });
    return res.status(201).json({ document: driverService.publicDocument(document) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});
```

Do **not** `app.use` a global handler. Do not change other driver
routes.

**Verify**: test 21 → 400 `{ error: 'invalid_file_type' }`. Re-run the
full driver file; test 7 (duplicate plate) should no longer hang if
it was a cascade from test 21. If test 7 still hangs in isolation,
STOP and report — do not add retries.

### Step 3: Switch auth.js to shared sendError

```js
const { sendError } = require('../utils/httpError');

const AUTH_ERRORS = {
  invalid_phone: 400,
  otp_cooldown: 429,
  otp_invalid: 401,
  otp_locked: 429,
  account_blocked: 403,
  server_misconfigured: 500,
  unauthorized: 401,
  validation_error: 400,
};

function sendAuthError(res, err) {
  return sendError(res, err, AUTH_ERRORS);
}
```

Keeping the `sendAuthError` name is optional; inlining
`sendError(res, err, AUTH_ERRORS)` at the three call sites is also
fine. Status codes must stay exactly as in the map above
(`otp_invalid` is 401, not 400).

**Verify**: `auth.test.js` still exit 0 (cooldown 429, wrong code 401,
blocked 403, etc.).

### Step 4: pickEventFields → pickFields

In `shipmentService.js` (double quotes in this file):

```js
const { pickFields } = require("../utils/pickFields");

function pickEventFields(body) {
  return pickFields(body, EVENT_FIELDS);
}
```

**Verify**: existing `POST /api/shipments/:id/events` tests still pass
(missing eventType → 400; happy checkpoint → 201). If a test sends
`eventType: undefined` as an own-property and previously got a
mongoose ValidationError, pickFields will omit the key and
`DRIVER_EVENT_TYPES.includes(undefined)` is still false → 400
`validation_error`. That is acceptable (same 400 family). If any test
expected a different code, STOP and keep the old loop.

### Step 5: Migrate the three HTTP suites onto helpers

For each of `admin.routes.test.js`, `driver.routes.test.js`,
`notifications.routes.test.js`:

1. Keep `require('../setup');` as line 1.
2. Add
   `const { applyTestEnv, makeHelpers, cargoBody, canon, FIXED_CODE, JWT_SECRET } = require('../helpers');`
   (import only what you use).
3. `const app = createApp(); const h = makeHelpers(app);`
4. `beforeAll(() => { applyTestEnv(); /* keep any extra env like UPLOAD_DIR */ });`
5. Replace local `register` / `registerDriverViaProfile` /
   `createAdmin` / `canon` / `FIXED_CODE` / `JWT_SECRET` with `h.*` /
   imported constants.
6. **Keep PHONE_* constants local.**
7. Do **not** rewrite assertions. A helper that throws on non-200
   register is fine (039 already did this).
8. Admin's local `cargoBody(title = 'Admin Cargo')` takes a string
   title; helpers' `cargoBody(overrides)` takes an object. When
   replacing, call `cargoBody({ title })` or wrap:
   `const cargoBody = (title) => helpers.cargoBody({ title: title || 'Admin Cargo' });`
   so existing `cargoBody('Draft One')` call sites still compile. Do
   not blindly search-replace.

Driver-specific `vehicleBody`, `createVehicle` (returns the supertest
response, not an id — helpers' `createVehicle` returns the id), PNG
fixture, `uploadDoc` stay local. Do not force those onto helpers.

If 049 added `h.approveDriver`, driver.routes must **not** call it
(onboarding tests need pending). Admin/notifications tests that bid
on cargo will start 403 unless they approve — if 049 is DONE, call
`await h.approveDriver(userId)` (or use `setupDriverWithVehicle`) in
those files' bid fixtures only.

**Verify**: the three files exit 0 with the same assertion count (± the
new shipments enrich test in Step 7).

### Step 6: Production-log unit tests (restore NODE_ENV)

`otpService.test.js` — keep the smoke tests, add:

```js
test('production log omits the code', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    otpService.sendOtp({ phone: '+989121230901', code: '123456' });
    const line = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(line).toContain('+989121230901');
    expect(line).not.toContain('123456');
  } finally {
    spy.mockRestore();
    process.env.NODE_ENV = prev;
  }
});
```

`notificationService.test.js` — same pattern for `deliver` with
`NODE_ENV=production`: logged JSON has `userId` and `type`, does
**not** contain `title`. Restore env in `finally`.

**Verify**: both files exit 0. A later file in `--runInBand` still
sees `NODE_ENV=test` (auth tests depend on it for the rate-limit skip).

### Step 7: Cover listShipmentsAdmin enrich path

In `admin.routes.test.js`, after the existing empty list test, add one
case that:

1. Registers owner + approved driver + vehicle (use helpers;
   `publishCargo` + `POST /api/offers` + `POST /api/offers/:id/accept`).
2. `GET /api/admin/shipments` as admin.
3. Asserts `count === 1`, `shipments[0].id` is 24 hex,
   `shipments[0].cargoTitle` equals the cargo title,
   `shipments[0].status === 'assigned'`,
   `shipments[0]._id` is undefined.

This is the `listShipmentsAdmin` non-empty branch (users + cargos
lookups). Do not assert phone formatting.

If 049 is DONE, the driver must be approved before `POST /api/offers`
or this test 403s.

**Verify**: admin.routes.test.js exit 0.

### Step 8: Full suite + coverage

**Verify**: `cd backend && npm test` → exit 0 (no remaining
driver.routes 21/7 red).

**Verify**: `cd backend && npm run test:coverage` → exit 0, thresholds
still 70/55/70/70. Do not raise them.

## Test plan

- Characterization in Step 1 (multer 500 → 400).
- Helper migration is move-only; no new product assertions except
  Step 6 (prod logs) and Step 7 (admin shipments enrich).
- Pattern: `settings.enforcement.test.js` already uses `makeHelpers`.

## Done criteria

- [ ] `driver.routes.test.js` test 21 is 400 `invalid_file_type`;
      `npm test` exit 0
- [ ] No `app.use` global error handler added (`app.js` still has no
      4-arg middleware)
- [ ] `routes/auth.js` uses `sendError` + an AUTH_ERRORS map; no
      duplicated status/json block
- [ ] `shipmentService.pickEventFields` uses `pickFields`
- [ ] `admin.routes.test.js`, `driver.routes.test.js`,
      `notifications.routes.test.js` import `../helpers` and do not
      define a local `async function register(phone)`
- [ ] `auth.test.js` still has its own register (OTP side effects)
- [ ] Production OTP log test asserts the code is absent; production
      notification log test asserts `title` is absent; both restore
      `NODE_ENV`
- [ ] Admin shipments test covers a non-empty enrich payload with `id`
- [ ] `coverageThreshold` unchanged
- [ ] No `mobile/` / `admin/` app edits
- [ ] `plans/README.md` row for 052 is DONE

## STOP conditions

- Implementing `app.use((err, req, res, next) => ...)` in `app.js`
  (that is 035). Local wrapper on one route only.
- Changing AUTH_ERRORS codes (`otp_invalid` must stay 401).
- Migrating `auth.test.js` and losing cooldown / hash assertions.
- `pickFields` swap on events changes a shipments test status code
  other than staying in the 400 family — revert pickEventFields and
  report.
- Raising coverage thresholds.
- 049 not yet landed and admin bid fixture 403s because you approved
  in helpers globally — do not approve inside
  `registerDriverViaProfile`. Approve only in bid fixtures.

## Maintenance notes

- Later HTTP tests should start from `makeHelpers(app)`. Reviewer
  rejects new local `request-otp` + `verify-otp` loops except in
  `auth.test.js`.
- Multer errors on other future upload routes must use the same
  `handleUpload` wrapper (or extract it then). Until 035, a raw
  `upload.single` will 500.
- Reviewer: confirm `NODE_ENV` restore in `finally`, not only
  `afterEach` (a thrown assertion would otherwise poison the rest of
  `--runInBand`).

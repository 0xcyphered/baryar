# Plan 039: Add a Jest coverage baseline and fill the untested service branches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1232e61..HEAD -- backend/package.json backend/test backend/src/index.js backend/src/services/adminService.js backend/src/services/otpService.js backend/src/services/notificationService.js backend/src/services/storageService.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `backend/package.json` has `"test": "jest --runInBand --forceExit"` and
> **no** `collectCoverage` / `coverageThreshold`; there is no
> `npm run test:coverage` script. Do not STOP just because later commits
> exist.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/038-shared-backend-helpers.md (soft — 038 adds
  util unit tests that raise coverage; run 038 first if both are TODO)
- **Category**: tests
- **Planned at**: commit `1232e61`, 2026-09-05

## Why this matters

Phase 1 booking has a large supertest suite (auth, cargo, driver,
matching, offers, shipments, notifications, admin, settings, storage
limits). What it does **not** have:

1. A **coverage command** or threshold. `package.json` jest config is
   `testMatch` + `globalSetup` only. `npm test` never prints coverage.
   During the 2026-09-05 roadmap audit, `jest --coverage` was not a
   supported script, so regressions in untested branches have no gate.
2. **Direct tests** for several service functions that HTTP tests do not
   reach well:
   - `adminService.ensureAdminBootstrap` (`index.js` only, no test)
   - `adminService.listDrivers` N+1 `Vehicle.countDocuments` per user
     (covered indirectly; the empty-profile / no-vehicle branches are
     easy to miss)
   - `notificationService.deliver` production vs non-production log
     bodies; `notifyEvent` swallow-on-create-failure
   - `otpService.sendOtp` production vs non-production (no code in logs)
   - `storageService.saveBuffer` happy path + `unlinkKey` ENOENT
   - `shipmentService.createForAward` duplicate-key idempotency
     (`err.code === 11000`)
3. A documented **install** note: `express-rate-limit` is in
   `package.json` `dependencies` but a stale `node_modules` (no
   `npm install` after 026) makes the entire route suite fail to load.
   Coverage then reports ~8% because only model tests run.

This plan does **not** chase 100%. It adds `test:coverage` with a
modest threshold that today's suite plus a few targeted tests can
clear, so the next slice cannot silently drop coverage.

## Current state

`backend/package.json` scripts / jest (verbatim):

```json
"scripts": {
  "start": "node src/index.js",
  "dev": "nodemon src/index.js",
  "test": "jest --runInBand --forceExit"
},
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/test/__tests__/**/*.test.js"],
  "globalSetup": "./test/globalSetup.js",
  "globalTeardown": "./test/globalTeardown.js",
  "testTimeout": 30000
}
```

Route tests all start with `require('../setup');` and mint users via OTP
or `User.create` + `jwt.sign`. Model tests (`models.cargo.test.js`,
`models.identity.test.js`) do not load `app.js`.

`adminService.ensureAdminBootstrap` (`backend/src/services/adminService.js`
~391–426): reads `ADMIN_BOOTSTRAP_PHONES` comma list, `normalizeIranPhone`,
`findOneAndUpdate` upsert with `$addToSet: { roles: 'admin' }` and
`$set: { status: 'active' }`. Plan 035 (DEFERRED, security) wants to
stop unblocking blocked admins — **do not change that `$set` here**.
Only test current behaviour.

`notificationService.notifyEvent` swallows create errors and
`console.log`s. `deliver` logs `{ userId, type }` in production and
adds `title` otherwise.

`otpService.sendOtp` logs `{ phone }` in production and `{ phone, code }`
otherwise.

`storageService.test.js` covers reject paths only (too big, bad mime,
empty buffer, traversal). No successful `saveBuffer` + `unlinkKey`.

`shipmentService.createForAward` catches Mongo 11000 on `cargoId` unique
and returns `{ shipment: existing, created: false }`.

Hang workaround (010): `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod`.
Do not switch to `MongoMemoryReplSet`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `cd backend && npm install` | `node -e "require('express-rate-limit')"` succeeds |
| Tests | `cd backend && npm test` | exit 0 |
| Coverage | `cd backend && npm run test:coverage` | exit 0, thresholds pass, summary printed |
| Hang workaround | `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` | memory Mongo starts |

Coverage output **must** write to `backend/coverage/` which is gitignored
in this plan (add `backend/coverage/` to the repo-root `.gitignore`).
Do not commit lcov.

## Scope

**In scope**:

- `backend/package.json` — `test:coverage` script + jest `collectCoverageFrom`
  / `coverageThreshold` / `coverageDirectory`
- `.gitignore` — `backend/coverage/`
- `backend/test/helpers.js` (create) — shared OTP register / cargo body /
  driver+vehicle helpers used by 6+ route files today
- `backend/test/__tests__/admin.bootstrap.test.js` (create)
- `backend/test/__tests__/notificationService.test.js` (create)
- `backend/test/__tests__/otpService.test.js` (create) — production log
  must **not** include the code; do not assert on the code value in
  production. Never print `OTP_FIXED_CODE` in test names as a "secret".
- `backend/test/__tests__/storageService.test.js` (extend happy path)
- `backend/test/__tests__/shipments.routes.test.js` **or** a small
  `shipmentService.test.js` for the 11000 idempotency branch
- Route test files that currently inline `register` /
  `registerDriverViaProfile` / `openCargoBody` — switch them onto
  `../helpers` without changing assertions
- `backend/src/index.js` — only if you extract `ensureAdminBootstrap`
  call into a testable export (it already exports `{ main }`; prefer
  testing `adminService.ensureAdminBootstrap` directly and leave
  `index.js` alone)

**Out of scope**:

- Changing bootstrap `$set: { status: 'active' }` (035).
- Raising thresholds to 90%+ (this plan's numbers are the floor).
- Frontend / Expo / admin Vite coverage.
- Rewriting the supertest suite into unit tests.
- Adding `nyc` or `c8` as extra tools — Jest's built-in v8 coverage
  is enough (`jest` 29 already depends on it).

## Git workflow

- Branch: `advisor/039-backend-coverage-baseline`
- Commits: `test(039): coverage script and service branch tests` then
  `chore(039): mark plan DONE in index`
- Do not push.

## Steps

### Step 1: Make `npm test` green on this machine

If `node -e "require('express-rate-limit')"` fails inside `backend/`:

```
cd backend && npm install
```

That is an install, not a package.json change. Do not add packages.

**Verify**: `cd backend && npm test` → exit 0.

If it still fails for a reason unrelated to coverage, STOP — this plan
cannot set a threshold on a red suite.

### Step 2: Add coverage config (thresholds first as a tripwire)

In `backend/package.json`:

1. Script: `"test:coverage": "jest --runInBand --forceExit --coverage"`
2. Inside the existing `"jest"` object, add:

```json
"collectCoverageFrom": [
  "src/**/*.js",
  "!src/index.js"
],
"coverageDirectory": "coverage",
"coverageReporters": ["text", "text-summary"],
"coverageThreshold": {
  "global": {
    "statements": 70,
    "branches": 55,
    "functions": 70,
    "lines": 70
  }
}
```

`src/index.js` is excluded because it is a listen() process (`app.listen`)
and would need a mocked server. Everything else in `src/` counts.

Add `backend/coverage/` to the repo-root `.gitignore` (there is already
a `backend/uploads/` entry from 030 — put coverage next to it).

Do **not** enable `collectCoverage: true` on the default `npm test` —
that slows every run. Coverage is opt-in via `test:coverage`.

**Verify (may fail thresholds — that is the RED of this plan)**:
`cd backend && npm run test:coverage`
Record the printed global percents. If they already beat 70/55/70/70,
skip Step 3's extra tests except bootstrap + notify swallow (those are
correctness, not coverage padding). If they miss, continue.

If coverage is far below 70% because route tests did not load, you
skipped Step 1.

### Step 3: Extract shared test helpers (no behaviour change)

Six route files copy the same 40–80 lines (`cargo`, `matching`, `offers`,
`shipments`, `notifications`, `settings.enforcement`):

- `async function register(phone)` — request-otp + verify-otp
- `async function registerDriverViaProfile(phone)`
- `function openCargoBody` / `validCargoBody`
- `async function createAndPublishCargo` / `publishCargo`
- `async function createDriverWithVehicle` / `createVehicle`
- `const FIXED_CODE = '123456'`
- `const JWT_SECRET = 'test-secret-do-not-use'`
- `canon(phone) => '+98' + phone.slice(1)`

Create `backend/test/helpers.js` (CommonJS, **single quotes**, no
`require('./setup')` inside the helper module — setup stays the first
line of each test file):

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');

const FIXED_CODE = '123456';
const JWT_SECRET = 'test-secret-do-not-use';

function canon(phone) {
  return `+98${phone.slice(1)}`;
}

function applyTestEnv() {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.OTP_FIXED_CODE = FIXED_CODE;
  process.env.NODE_ENV = 'test';
}

function cargoBody(overrides) {
  return {
    title: 'Test cargo',
    transportMode: 'land',
    origin: { address: 'Tehran', location: { coordinates: [51.39, 35.69] } },
    destination: { address: 'Isfahan', location: { coordinates: [51.68, 32.65] } },
    dimensions: { weightKg: 10000, volumeM3: 20 },
    specialCharacteristics: [],
    pickupAt: '2026-09-10T08:00:00.000Z',
    deliverBy: '2026-09-12T18:00:00.000Z',
    ...overrides,
  };
}

function makeHelpers(app) {
  async function register(phone) {
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone, code: FIXED_CODE });
    if (res.status !== 200) {
      throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { token: res.body.token, userId: res.body.user.id };
  }
  // registerDriverViaProfile, createVehicle, publishCargo — same
  // HTTP sequence as matching.routes.test.js today.
  return { register, /* ... */ };
}

module.exports = {
  FIXED_CODE,
  JWT_SECRET,
  canon,
  applyTestEnv,
  cargoBody,
  makeHelpers,
};
```

Fill in `registerDriverViaProfile`, `createVehicle`, `publishCargo`,
`createAdmin` (the `User.create` + `jwt.sign` pattern from
`settings.enforcement.test.js`) on `makeHelpers(app)` so each test file
does:

```js
require('../setup');
const { createApp } = require('../../src/app');
const { applyTestEnv, makeHelpers, cargoBody } = require('../helpers');

describe('…', () => {
  const app = createApp();
  const { register, publishCargo, createVehicle } = makeHelpers(app);
  beforeAll(applyTestEnv);
  // keep PHONE_* constants local — they must stay unique per file
});
```

**Keep each file's PHONE_* constants.** Colliding phones across files is
fine because `afterEach` wipes collections; colliding phones *inside* a
file is not. Do not invent a global phone registry.

Do **not** rewrite assertions. A helper that throws instead of
`expect(res.status).toBe(200)` on register is acceptable (setup failure
should fail the test loudly).

Migrate at least: `matching.routes.test.js`, `offers.routes.test.js`,
`shipments.routes.test.js`, `cargo.routes.test.js`,
`settings.enforcement.test.js`. Leave `auth.test.js` local (it tests OTP
itself and needs raw request-otp). Leave `phone.test.js` /
`models.*.test.js` / `health.test.js` / `storageService.test.js`.

**Verify**: `cd backend && npm test` still exit 0 after the move.
If a single file goes red, revert that file and STOP rather than
"simplifying" its cargo body (coordinates / titles are load-bearing in
`$near` tests).

### Step 4: Targeted tests for uncovered branches

All new files start with `require('../setup');`.

#### 3a. `backend/test/__tests__/admin.bootstrap.test.js`

```js
require('../setup');
const User = require('../../src/models/User');
const { ensureAdminBootstrap } = require('../../src/services/adminService');

describe('ensureAdminBootstrap', () => {
  const prev = process.env.ADMIN_BOOTSTRAP_PHONES;

  afterEach(() => {
    process.env.ADMIN_BOOTSTRAP_PHONES = prev;
  });

  test('no-ops when env is empty', async () => {
    delete process.env.ADMIN_BOOTSTRAP_PHONES;
    await ensureAdminBootstrap();
    expect(await User.countDocuments()).toBe(0);
  });

  test('upserts listed phones with admin role', async () => {
    process.env.ADMIN_BOOTSTRAP_PHONES = '09121230901, 09121230902';
    await ensureAdminBootstrap();
    const users = await User.find({}).sort({ phone: 1 });
    expect(users).toHaveLength(2);
    expect(users[0].phone).toBe('+989****0901');
    expect(users[0].roles).toEqual(expect.arrayContaining(['admin']));
    expect(users[1].roles).toEqual(expect.arrayContaining(['admin']));
  });

  test('skips invalid phones', async () => {
    process.env.ADMIN_BOOTSTRAP_PHONES = '02122001000,09121230903';
    await ensureAdminBootstrap();
    expect(await User.countDocuments()).toBe(1);
    expect((await User.findOne()).phone).toBe('+989****0903');
  });

  test('is idempotent and keeps extra roles', async () => {
    process.env.ADMIN_BOOTSTRAP_PHONES = '09121230904';
    await User.create({
      phone: '+989****0904',
      roles: ['cargo_owner'],
      phoneVerifiedAt: new Date(),
    });
    await ensureAdminBootstrap();
    await ensureAdminBootstrap();
    const user = await User.findOne({ phone: '+989****0904' });
    expect(user.roles.sort()).toEqual(['admin', 'cargo_owner'].sort());
    expect(await User.countDocuments()).toBe(1);
  });
});
```

Phone fixtures in this file must be unique vs other test files' constants
(pattern: `09121230NNN` is used across the suite — pick `091212309xx`
as above). Canonical form is `+98` + national without leading 0.

Do **not** assert that a previously `blocked` user becomes `active`.
That is 035's fight. If you happen to observe it, leave a comment, do
not "fix" bootstrap.

#### 3b. `backend/test/__tests__/notificationService.test.js`

Cover:

- `notifyEvent` with a missing `cargo._id` (or `Notification.create`
  mocked via jest.spyOn to reject) returns `null` and does not throw.
- `notifyOfferReceived` / `notifyOfferRejected` persist a row with
  `shipmentId: null` (029 already has HTTP tests; a unit test here is
  optional if coverage is already over the line).
- `deliver` in production: spy `console.log`, set
  `process.env.NODE_ENV = 'production'`, call `notifyShipment` (or
  `deliver` if you export it — **today `deliver` is not exported**).
  Either export `deliver` for tests or assert on the log from
  `notifyEvent`. Restore `NODE_ENV` in `afterEach`. The production log
  JSON **must not** contain `title`.

Prefer exporting `deliver` from `notificationService.js` (add to
`module.exports`) so the test can call it with a fake notification
object. That is an additive export, not a behaviour change.

#### 3c. `otpService` production log

Do **not** create a new HTTP test that leaks codes. Unit-test `sendOtp`
the same way: export `sendOtp` (additive) or spy `console.log` around
`requestOtp` with `NODE_ENV=production` and assert the logged string
does not contain `process.env.OTP_FIXED_CODE`. Restore env.

If exporting `sendOtp`, add it to `module.exports` next to
`requestOtp, verifyOtp`.

#### 3d. storageService happy path

In the existing `storageService.test.js`, the `beforeAll` already sets
`UPLOAD_DIR` to a tmp dir. Add:

- `saveBuffer` with a tiny PNG buffer (`Buffer.from([137,80,78,71])` is
  enough — the service does not parse images) and `mimeType: 'image/png'`
  returns `{ storageKey, originalName, mimeType }` where `storageKey`
  starts with `documents/` and does not contain `..`.
- `fs.existsSync` on `path.join(uploadRoot(), storageKey)` is true.
- `unlinkKey(storageKey)` then `unlinkKey(storageKey)` again (ENOENT
  second time is not an error).
- `createReadStream` after unlink throws `not_found` **or** the stream
  errors — match live `createReadStream` (it calls `assertSafeKey` then
  `fs.createReadStream`; missing file emits `error`, does not throw).
  Assert the file is gone after unlink instead of fighting the stream.

#### 3e. createForAward idempotency

Add `backend/test/__tests__/shipmentService.test.js`:

- Create owner, driver, vehicle, cargo, offer documents **via models**
  (not HTTP) — look at `models.cargo.test.js` for Cargo.create shape
  (`origin.location.coordinates: [lng, lat]`).
- First `createForAward({ cargo, offer })` → `{ created: true }`.
- Second call with the same cargo/offer → `{ created: false }` and
  `Shipment.countDocuments({ cargoId: cargo._id }) === 1`.
- `ShipmentEvent` count for `status_change` / `assigned` stays 1
  (idempotent retry must not double-write the assigned event). Read
  `createForAward` — on 11000 it returns existing and **skips** the
  event/notify path. Assert that.

### Step 5: Re-run coverage and adjust only downward if needed

**Verify**: `cd backend && npm run test:coverage`

If global numbers exceed the thresholds in Step 2, leave the thresholds
as specified (70/55/70/70). If a metric is still short **after** Step 3,
you may lower **one** metric by at most 5 points (e.g. branches 55 → 50)
and note the actual number in `plans/README.md` dependency notes. Do
**not** drop below 50 branches / 65 statements. Prefer adding one more
test over lowering.

If numbers are >> 80%, do not raise the floor in this plan (keeps the
next feature slice from failing coverage for a new file). A later plan
can ratchet.

**Verify**: `cd backend && npm test` still exit 0 (no `--coverage`).

### Step 6: Confirm gitignore

**Verify**: `git check-ignore -v backend/coverage` prints a `.gitignore`
rule. `git status` does not list `backend/coverage/`.

## Test plan

- New files in Step 4. Pattern: `storageService.test.js` (direct service
  require, `err.code` assertions) and `settings.enforcement.test.js`
  (env + User.create).
- HTTP tests stay the contract suite; do not duplicate them here.
- Production-log tests must restore `NODE_ENV` so later files in
  `--runInBand` still see `test`.

## Done criteria

- [ ] `backend/package.json` has `test:coverage` and the jest coverage
      keys above (`src/index.js` excluded)
- [ ] `.gitignore` contains `backend/coverage/`
- [ ] `cd backend && npm test` exits 0 (no coverage collection)
- [ ] `cd backend && npm run test:coverage` exits 0 and meets the
      committed threshold
- [ ] `backend/test/helpers.js` exists; matching/offers/shipments/cargo/
      settings.enforcement tests use `makeHelpers` (auth.test.js still local)
- [ ] `ensureAdminBootstrap` has tests (empty env, upsert, skip invalid,
      idempotent)
- [ ] `createForAward` 11000 path has a test
- [ ] storageService happy-path write + unlink tested
- [ ] Production OTP/notification logs do not include the code / title
      (asserted)
- [ ] No `mobile/` / `admin/` edits; bootstrap `$set status` untouched
- [ ] `plans/README.md` row for 039 is DONE

## STOP conditions

- `npm test` is red before you touch coverage — fix install (Step 1) or
  STOP; do not hide failures with a coverage script.
- Thresholds would only pass by excluding `src/services/**` — that
  defeats the plan. Exclude **only** `src/index.js`.
- Temptation to implement 035's bootstrap-blocked-user fix "while
  testing" — STOP. Test current behaviour.
- Adding `istanbul` / `nyc` / `c8` as direct dependencies — STOP; use
  Jest 29 built-in coverage.

## Maintenance notes

- Every later backend plan should run `npm test` (required) and mention
  `npm run test:coverage` as optional. If a new file drops below the
  floor, add tests in that plan rather than lowering 039's numbers.
- Reviewer: the floor is intentionally modest. Reject a PR that sets
  `coverageThreshold` to 0 or removes `collectCoverageFrom`.
- Plan 038's util tests, if already DONE, make this plan's Step 3
  smaller — do not duplicate `fail` / `assertId` tests here.

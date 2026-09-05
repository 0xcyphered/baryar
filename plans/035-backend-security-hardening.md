# Plan 035: Backend security hardening — CORS allowlist, JWT pin, error handler, bootstrap fix (review-driven)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> This plan fixes security/correctness findings from the 2026-09-04 code
> review (score 6/10 backend). It must **not** change any successful
> request's behavior — only failure paths and configuration. The 188-test
> suite is the regression gate.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches auth path; tests must stay green)
- **Depends on**: none of the open plans (027–030 are independent; run this any time — earlier is better)
- **Category**: security + correctness (review findings #1, #3, #6, #7, #9, #11, #17)
- **Planned at**: commit `114fa9a`, 2026-09-05

## Why this matters

The 2026-09-04 code review found, with evidence:

- **#1 HIGH** — `app.js:21` `cors({ origin: true })` echoes every origin:
  any website can make authenticated cross-origin calls against a deployed
  API.
- **#3 MED** — `middleware/auth.js:15` `jwt.verify(token, secret)` does not
  pin `{ algorithms: ['HS256'] }`; a leaked/weak secret would admit
  algorithm-confusion tokens.
- **#6 MED** — `middleware/auth.js:19` `await User.findById(payload.sub)`
  is inside no try/catch; a malformed ObjectId from a corrupted token (it
  is attacker-reachable pre-serialization) or a DB hiccup rejects the
  promise → Express 4 crashes the process.
- **#7 MED** — no global Express error handler: any thrown async error
  outside a route's try/catch (e.g. in the middleware above) yields an HTML
  error page or a crash, not `{ error }` JSON.
- **#9 MED** — `adminService.js` bootstrap `$set: { status: 'active' }`
  runs on every restart: a deliberately blocked admin is silently unblocked
  whenever their phone is in `ADMIN_BOOTSTRAP_PHONES`.
- **#11 MED** — `adminService.listDrivers` issues one `Vehicle.countDocuments`
  per driver (N+1).
- **#17 LOW** — `adminService.listDrivers` hydrates full Mongoose docs it
  immediately serializes; `.lean()` fixes.

Deliberately **out of scope** (review #2, #4, #5, #8, #10, #12–#16, #18):
general rate limiting, OTP log redaction, N+1 in overview, pagination,
DRY refactors — those change behavior or surface area and belong to
separate slices if wanted.

## Current state

`backend/src/app.js:15-22` (createApp head):

```js
function createApp() {
  const app = express();

  app.use(helmet());
  // Permissive CORS for local Expo + Vite. A later plan will lock origins
  // to an allowlist once auth cookies exist.
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '100kb' }));
```

No error-handling middleware exists anywhere in the file; the function ends
with the `/api` 404 catch-all then `return app`.

`backend/src/middleware/auth.js:13-25`:

```js
  let payload;
  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = user;
  return next();
```

`backend/src/services/adminService.js` bootstrap loop (find `ADMIN_BOOTSTRAP`
/ `bootstrapAdmins`):

```js
      await User.findOneAndUpdate(
        { phone },
        {
          $addToSet: { roles: 'admin' },
          $set: { status: 'active' },
          $setOnInsert: { phone, phoneVerifiedAt: new Date() },
        },
        { upsert: true, new: true, runValidators: true }
      );
```

`backend/src/services/adminService.js` `listDrivers` (find the function):

```js
  const users = await User.find({ roles: 'driver' });
  const profiles = await DriverProfile.find({});
  // ...per user:
  const vehicleCount = await Vehicle.countDocuments({ ownerUserId: user._id });
```

Repo conventions: CommonJS, 2-space, single quotes. Tests: 12 suites, 188
tests, `cd backend && npm test` green at plan time.

## Product rules (do not invent others)

- CORS: env-driven allowlist `CORS_ORIGINS` (comma-separated). **Empty/unset
  → keep current permissive behavior** so local dev and the existing test
  suite do not break. Setting the env in production is an ops step, not a
  code behavior change.
- JWT: pin `algorithms: ['HS256']`. Tokens in the wild are already HS256
  (14 signs HS256 by default).
- Auth DB errors → 500 `{ error: 'server_error' }`, never a crash.
- Blocked admin stays blocked across restarts. Bootstrap keeps granting the
  role on first boot (`$setOnInsert` path) but never resurrects `status`.
- Response format `{ error: 'code' }` everywhere — no new shapes.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `cd backend && node --check src/app.js && node --check src/middleware/auth.js && node --check src/services/adminService.js` | exit 0 |
| App boots | `cd backend && node -e "const {createApp}=require('./src/app'); console.log(typeof createApp().listen==='function'?'ok':'fail')"` | `ok` |
| Full suite | `cd backend && npm test` | 188+ pass, 0 fail |
| CORS default | `cd backend && node -e "const {createApp}=require('./src/app'); const a=createApp(); console.log('booted')"` | no throw |

Zero new packages.

## Scope

**In scope**:

- `backend/src/app.js` (CORS allowlist + global error handler)
- `backend/src/middleware/auth.js` (algorithm pin + try/catch around DB)
- `backend/src/services/adminService.js` (bootstrap `$set` removal +
  listDrivers N+1 + `.lean()`)
- `backend/.env.example` (`CORS_ORIGINS=`)
- `backend/test/__tests__/security-hardening.test.js` (new)
- `plans/README.md` (status row)

**Out of scope**:

- `routes/*`, all other services, models — no route-level changes.
- Rate limiting, OTP logs, pagination, DRY refactors (listed above).
- Deployment/ops (setting `CORS_ORIGINS` in real env files).
- Any change to successful-response bodies or status codes.

## Git workflow

- Stay on the current branch. Do not push.
- Commits: `fix(035): security hardening — CORS allowlist, JWT pin, error handler`
  then `chore(035): mark plan DONE in index`.

## Steps

### Step 1: CORS allowlist — `backend/src/app.js`

Replace the cors line:

```js
  // CORS allowlist: CORS_ORIGINS is a comma-separated list of exact origins
  // (e.g. "https://admin.baryar.ir,https://app.baryar.ir"). Unset/empty keeps
  // the permissive dev behavior so Expo/Vite local dev and tests are unaffected.
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: corsOrigins.length === 0 ? true : corsOrigins,
    })
  );
```

`cors` accepts an array and matches exact strings — no wildcard support
needed. Subdomain matching is explicitly out of scope.

**Verify**: `cd backend && node --check src/app.js` → exit 0. App boots.
Existing tests green (they never assert CORS headers).

### Step 2: Global error handler — `backend/src/app.js`

After the `/api` 404 catch-all, **before** `return app`:

```js
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // Mongoose cast/validation errors → 400; everything else → 500 JSON.
    if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
      return res.status(400).json({ error: 'validation_error' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large' });
    }
    return res.status(500).json({ error: 'server_error' });
  });
```

Express 4 error middleware needs the 4-arity signature exactly. Keep it
last so the 404 catch-all still handles unmatched routes first.

**Verify**: `cd backend && node --check src/app.js`. Boot test:
`cd backend && node -e "const {createApp}=require('./src/app'); createApp(); console.log('ok')"`.
Full suite green.

### Step 3: Auth middleware hardening — `backend/src/middleware/auth.js`

```js
  let payload;
  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
  let user;
  try {
    user = await User.findById(payload.sub);
  } catch {
    return res.status(500).json({ error: 'server_error' });
  }
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'unauthorized' });
  }
```

Notes:
- `payload.sub` of a garbage shape simply finds nothing → 401 (existing
  behavior for unknown ids).
- A DB outage now returns 500 JSON instead of crashing.

**Verify**: `cd backend && node --check src/middleware/auth.js`. Full suite
green (every authed test goes through this path — the suite is the
regression gate).

### Step 4: Admin bootstrap — stop resurrecting blocked admins

In the bootstrap `findOneAndUpdate`, **remove** the `$set: { status: 'active' }`
line entirely. Result:

```js
      await User.findOneAndUpdate(
        { phone },
        {
          $addToSet: { roles: 'admin' },
          $setOnInsert: { phone, phoneVerifiedAt: new Date(), status: 'active' },
        },
        { upsert: true, new: true, runValidators: true }
      );
```

- Existing admin (any status): role added if missing; `status` untouched.
- New admin on first boot: created `active`.

**Verify**: `grep -n "\$set: { status: 'active' }" backend/src/services/adminService.js`
→ no hits. Admin routes tests (`admin.routes.test.js`) green.

### Step 5: listDrivers N+1 → one aggregate + lean

Replace the per-user `Vehicle.countDocuments` loop with a single grouped
query. Read the current function first, then:

```js
  const users = await User.find({ roles: 'driver' }).lean();
  const profiles = await DriverProfile.find({}).lean();
  const ownerIds = users.map((u) => u._id);
  const counts = await Vehicle.aggregate([
    { $match: { ownerUserId: { $in: ownerIds } } },
    { $group: { _id: '$ownerUserId', total: { $sum: 1 } } },
  ]);
  const countByOwner = new Map(counts.map((c) => [String(c._id), c.total]));
  // per user: const vehicleCount = countByOwner.get(String(user._id)) || 0;
```

Keep the response shape **identical** (`count`, rows, per-row
`vehicleCount`) — the `admin.routes.test.js` driver-list tests must pass
unchanged.

**Verify**: `cd backend && npm test -- --testPathPattern=admin.routes`
→ all pass. Full suite green.

### Step 6: Tests — `backend/test/__tests__/security-hardening.test.js`

First line `require('../setup');`, pattern of `auth.test.js`. Cases:

1. **CORS default**: with `CORS_ORIGINS` unset, `GET /health` with
   `Origin: http://evil.example` responds `access-control-allow-origin`
   echoing it (permissive dev preserved).
2. **CORS allowlist**: set `process.env.CORS_ORIGINS = 'http://ok.local'` in
   the test, restart-relevant? No — createApp reads env at creation, so
   create a **second** app instance in this test file after setting env;
   `Origin: http://ok.local` → allowed; `Origin: http://evil.example` → no
   `access-control-allow-origin` header. Restore env in `afterAll`.
3. **JWT alg pin**: craft a token signed with the same secret but
   `algorithm: 'none'` (jsonwebtoken supports sign with `alg: none` when
   allowed) → `GET /api/auth/me` → 401. (If the library refuses `none`
   signing, use a `HS512` token — also 401 under the HS256 pin.)
4. **Global error handler**: register a one-off probe route on a scratch
   app (`const a = createApp(); a.use('/boom', async () => { throw new Error('x'); })`
   — mount after creation; supertest `GET /boom` → 500
   `{ error: 'server_error' }` (JSON, not HTML).
5. **Auth DB error → 500, no crash**: mock `User.findById` once
   (`jest.spyOn(User, 'findById').mockRejectedValueOnce(new Error('db down'))`),
   call `GET /api/auth/me` with a valid-shaped token → 500 JSON; restore in
   `afterEach`.

**Verify**: `cd backend && npm test` → 188 existing + new tests all pass.

## Test plan

- New suite above is the test plan.
- Regression: the full 188-test suite must remain green after every step —
  run it after Steps 2–5, not only at the end.

## Done criteria

- [ ] `cd backend && npm test` exits 0 (188+ tests, 0 failures)
- [ ] `grep -n "algorithms" backend/src/middleware/auth.js` → one hit (HS256)
- [ ] `grep -n "CORS_ORIGINS" backend/src/app.js backend/.env.example` → one hit each
- [ ] `grep -c "app.use((err" backend/src/app.js` → 1
- [ ] `grep -n "\$set: { status: 'active' }" backend/src/services/adminService.js` → no hits
- [ ] `grep -n "countDocuments" backend/src/services/adminService.js` → 0 hits (aggregate replaces it)
- [ ] `git status` shows only in-scope files
- [ ] `plans/README.md` status row for 035 updated

## STOP conditions

- The 188-test suite cannot be kept green while applying a step (a behavior
  was load-bearing somewhere not in the review) — report which step.
- `jwt.verify` options object breaks the existing token flow in tests.
- The bootstrap loop shape differs from the excerpt (drift) — re-read and
  reconcile before editing; if the semantics are different, report.
- You are about to add a dependency, change a success status code, or touch
  `routes/`.

## Maintenance notes

- Production deploy must set `CORS_ORIGINS` — add to the ops checklist when
  one exists; `.env.example` documents it.
- The global error handler makes future async middleware safe to add
  without per-route try/catch, but route-level try/catch + `sendXxxError`
  mapping stays the convention (error codes → statuses).
- Remaining review findings (rate limiting #2, pagination #12, DRY #13-16)
  are deliberately deferred; re-audit after 027-030 land.

# Plan 038: Extract shared backend helpers (errors, ObjectIds, field picks, roles)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1232e61..HEAD -- backend/src/services backend/src/routes backend/src/middleware backend/src/utils`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates: every service still
> inlines `function fail` / `function assertId` / `function pickFields`;
> every route still inlines `sendXError` and (except admin) `requireDriver`
> / `requireCargoOwner`. Do not STOP just because later commits exist.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/036-offer-matching-eligibility.md (soft — 036
  touches `matchingService.js`; run 036 first to avoid a merge conflict),
  plans/037-shipment-cargo-read.md (soft — 037 touches `shipments.js` /
  `shipmentService.js`)
- **Category**: tech-debt
- **Planned at**: commit `1232e61`, 2026-09-05

## Why this matters

The Phase 1 backend copied the same 8–15 line helpers into every service
and route as slices landed (014–030). That is now the main reuse debt:

- `fail(code)` — identical in cargo, matching, shipment, notification,
  driver, admin, settings, storage, user (`otpService` uses `otpError`,
  same shape).
- `assertId` / `assertObjectId` — same `/^[0-9a-fA-F]{24}$/` regex, only
  the error code differs (`invalid_cargo_id` vs `invalid_vehicle_id` …).
- `pickFields(body, keys)` — cargo, matching, driver, admin, user,
  shipment (`pickEventFields` is the same loop).
- `MAX_LIST = 100` — copy-pasted in six services.
- `requireDriver` / `requireCargoOwner` — copy-pasted in cargo, matching,
  offers, shipments. `requireAdmin` already lives in
  `middleware/adminGuard.js`.
- `sendXError` — eight near-identical maps (`ValidationError` → 400,
  `err.code` lookup, else 500 `server_error`).

None of this is a product hole. It is why every new route re-implements
HTTP mapping and why a missed ObjectId check is easy. This plan extracts
**behaviour-preserving** helpers, switches call sites, and adds unit
tests for the new modules. No URL, status code, or JSON body changes.

## Current state

Canonical copies (do not "improve" the logic while moving it):

`fail` (from `cargoService.js:14-18`, single quotes):

```js
function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}
```

`assertId` (from `driverService.js:21-23`):

```js
function assertId(id, code) {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) fail(code);
}
```

`pickFields` (from `userService.js:9-16`):

```js
function pickFields(body, keys) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}
```

`requireDriver` (from `routes/matching.js:9-14`, double quotes there —
the extracted middleware must use **single quotes** to match
`middleware/auth.js` / `adminGuard.js`):

```js
function requireDriver(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('driver')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}
```

`sendXError` shape (from `routes/cargo.js:15-31`):

```js
function sendCargoError(res, err) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error' });
  }
  const code = err && err.code;
  const map = { invalid_cargo_id: 400, /* ... */ };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}
```

`otpService.otpError` is the same as `fail` but returns instead of
throws — keep otpService using `fail` after this plan (`throw fail(code)`
or just `fail(code)` which throws). Do not keep `otpError`.

Quote style: **new util/middleware files use single quotes** (match
`utils/phone.js`, `middleware/auth.js`). Existing service files that use
double quotes may `require("../utils/httpError")` with double quotes in
the require string — that is fine; do not reformat the rest of those
files.

`MAX_LIST`: leave the constant **in each service** for this plan. A
shared pagination module is a later slice (list caps may diverge). Do
not extract `MAX_LIST`.

`publicX` serializers stay in their services (they are domain DTOs).
Do not merge `publicUser` / `publicAdminUser` / `publicCargo`.

`adminService.js` `driverServicePublicDocument` is a duplicate of
`driverService.publicDocument` — **in scope**: delete the local copy and
`require('./driverService').publicDocument` (driverService does not
require adminService, so no cycle).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Unit tests | `cd backend && npx jest --runInBand --forceExit test/__tests__/httpError.test.js test/__tests__/objectId.test.js test/__tests__/pickFields.test.js` | exit 0 |
| Full suite | `cd backend && npm test` | exit 0, **same number of tests or more** |
| Load check | `node -e "require('./backend/src/app'); console.log('ok')"` | prints `ok` |

## Scope

**In scope** (create):

- `backend/src/utils/httpError.js` — `fail`, `sendError`
- `backend/src/utils/objectId.js` — `assertId`, `isObjectId`
- `backend/src/utils/pickFields.js` — `pickFields`
- `backend/src/middleware/requireRole.js` — `requireRole(role)`, plus
  `requireDriver` / `requireCargoOwner` wrappers
- `backend/test/__tests__/httpError.test.js`
- `backend/test/__tests__/objectId.test.js`
- `backend/test/__tests__/pickFields.test.js`

**In scope** (edit — replace local copies with requires; no behaviour
change):

- `backend/src/services/cargoService.js`
- `backend/src/services/matchingService.js`
- `backend/src/services/shipmentService.js`
- `backend/src/services/notificationService.js`
- `backend/src/services/driverService.js`
- `backend/src/services/adminService.js`
- `backend/src/services/settingsService.js`
- `backend/src/services/userService.js`
- `backend/src/services/storageService.js`
- `backend/src/services/otpService.js` (`otpError` → `fail`)
- `backend/src/routes/auth.js`
- `backend/src/routes/cargo.js`
- `backend/src/routes/driver.js`
- `backend/src/routes/matching.js`
- `backend/src/routes/offers.js`
- `backend/src/routes/shipments.js`
- `backend/src/routes/notifications.js`
- `backend/src/routes/admin.js`
- `backend/src/routes/settings.js` (optional: its catch is a raw 500;
  switch to `sendError(res, err, {})` so unexpected codes still map)

**Out of scope**:

- Extracting `MAX_LIST` / pagination.
- Merging `public*` serializers.
- Global Express error handler (plan 035).
- Changing any status code or error string.
- Reformatting whole files to a single quote style.
- `mobile/`, `admin/`.
- Adding TypeScript.

## Git workflow

- Branch: `advisor/038-shared-backend-helpers`
- Commits: one commit for the new utils + unit tests, one for call-site
  swaps, then `chore(038): mark plan DONE in index`
- Do not push.

## Steps

### Step 1: Write failing unit tests for the new utils

Create the three test files **first** (TDD). First line of each:
`require('../setup');` even though these tests do not hit Mongo — every
Jest file in this repo does that.

`backend/test/__tests__/httpError.test.js`:

- `fail('not_found')` throws an Error whose `.code` and `.message` are
  `'not_found'`.
- `sendError` with a mock `res` (`status` + `json` jest.fn chain):
  - mongoose-like `{ name: 'ValidationError' }` → 400 `validation_error`
  - `{ code: 'not_found' }` with map `{ not_found: 404 }` → 404 `not_found`
  - `{ code: 'mystery' }` with empty map → 500 `server_error`
  - `null` err → 500 `server_error`
  - `{ code: 'LIMIT_FILE_SIZE' }` with map `{ LIMIT_FILE_SIZE: 413 }` → 413
    (driver upload uses this)

`backend/test/__tests__/objectId.test.js`:

- `isObjectId('0'.repeat(24))` true
- `isObjectId('not-a-id')` false
- `isObjectId(null)` false
- `assertId('not-a-id', 'invalid_cargo_id')` throws `.code === 'invalid_cargo_id'`
- `assertId('a'.repeat(24), 'invalid_cargo_id')` does not throw

`backend/test/__tests__/pickFields.test.js`:

- picks only listed keys
- ignores missing keys
- `pickFields(null, ['a'])` → `{}`
- does not copy `undefined` values (key absent in output)
- does copy empty string / `0` / `false`

**Verify (RED)**:
`cd backend && npx jest --runInBand --forceExit test/__tests__/httpError.test.js`
→ fail with `Cannot find module` for `../../src/utils/httpError`.

### Step 2: Implement the utils

`backend/src/utils/httpError.js`:

```js
function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function sendError(res, err, map) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error' });
  }
  const code = err && err.code;
  const table = map || {};
  const status = table[code] || 500;
  const error = table[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

module.exports = { fail, sendError };
```

`backend/src/utils/objectId.js`:

```js
const { fail } = require('./httpError');
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

function isObjectId(id) {
  return typeof id === 'string' && OBJECT_ID_RE.test(id);
}

function assertId(id, code) {
  if (!isObjectId(id)) fail(code);
}

module.exports = { isObjectId, assertId };
```

`backend/src/utils/pickFields.js`:

```js
function pickFields(body, keys) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

module.exports = { pickFields };
```

`backend/src/middleware/requireRole.js`:

```js
function requireRole(role) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

const requireDriver = requireRole('driver');
const requireCargoOwner = requireRole('cargo_owner');

module.exports = { requireRole, requireDriver, requireCargoOwner };
```

Do **not** replace `middleware/adminGuard.js`. Keep `requireAdmin` as the
existing one-line module so 019/035 greps still work. Optionally re-export
from requireRole later — not in this plan.

**Verify (GREEN)**: the three new test files pass.

### Step 3: Swap service call sites

For each service listed in Scope:

1. Add the requires (`fail` from `../utils/httpError`, `assertId` /
   `isObjectId` from `../utils/objectId`, `pickFields` from
   `../utils/pickFields`).
2. Delete the local `function fail` / `function assertId` /
   `function assertObjectId` / `function pickFields` /
   `function pickEditableFields` wrappers **only if** they are the same
   loop. `cargoService.pickEditableFields` is `pickFields(body, EDITABLE_FIELDS)`
   — replace the function with `pickFields` calls (or
   `const pickEditableFields = (body) => pickFields(body, EDITABLE_FIELDS)`).
3. `matchingService.parseCoordinate` / `parseRadius` / `hasValue` stay —
   they are matching-specific.
4. `shipmentService.pickEventFields` uses `hasOwnProperty` instead of
   `!== undefined` so an explicit `null` location is kept. **Do not
   replace it with `pickFields`** — that would drop `location: null`.
   Leave `pickEventFields` local.
5. `otpService`: `throw otpError('x')` → `fail('x')`. Delete `otpError`.
6. `adminService.driverServicePublicDocument`: replace uses with
   `driverService.publicDocument`. Add
   `const driverService = require('./driverService');` if not present.
   Delete the local function.

After each file, keep quote style of **that file**.

**Verify**: `node -e "require('./backend/src/services/cargoService'); require('./backend/src/services/matchingService'); require('./backend/src/services/adminService'); console.log('ok')"`

Grep gate (must be empty except comments / this plan):

```
rg -n "function fail\(|function assertId\(|function assertObjectId\(|function pickFields\(|function otpError\(|function driverServicePublicDocument\(" backend/src
```

Expected: no matches. `pickEventFields` may remain.

### Step 4: Swap route error mappers and role gates

Each route keeps its **own status map object** (codes differ). Replace
the function body with `sendError`:

```js
const { sendError } = require('../utils/httpError');

const CARGO_ERRORS = {
  invalid_cargo_id: 400,
  validation_error: 400,
  forbidden: 403,
  not_found: 404,
  invalid_status: 409,
  cargo_limit: 409,
};

function sendCargoError(res, err) {
  return sendError(res, err, CARGO_ERRORS);
}
```

Keeping the local `sendCargoError` name is fine so the rest of the file
is a one-line change. Copy each map **verbatim** from the file you edit
(driver has `LIMIT_FILE_SIZE: 413`, `file_too_large: 413`,
`invalid_file_type: 400`, `document_locked: 409`, `plate_in_use: 409`,
`profile_required: 400` — do not drop these).

Replace local `requireDriver` / `requireCargoOwner` with:

```js
const { requireDriver, requireCargoOwner } = require('../middleware/requireRole');
```

`routes/admin.js` keeps `requireAdmin` from `adminGuard.js`.

Grep gate:

```
rg -n "function requireDriver|function requireCargoOwner" backend/src/routes
```

Expected: no matches.

**Verify**: `node -e "require('./backend/src/app'); console.log('ok')"`

### Step 5: Full regression

**Verify**: `cd backend && npm test` → exit 0.

Count tests: before this plan the suite is the 027–034 set (~180+). After,
exactly + the new unit tests. Any existing test failure is a behaviour
change — revert that file and STOP.

## Test plan

- New unit tests in Step 1.
- Existing route tests are the characterization suite — they must stay
  green without edits. Do **not** rewrite route tests in this plan.
- If a route test fails, the map was copied wrong. Diff the map against
  the pre-change file (`git show HEAD:backend/src/routes/<file>.js`).

## Done criteria

- [ ] `backend/src/utils/httpError.js`, `objectId.js`, `pickFields.js` exist
- [ ] `backend/src/middleware/requireRole.js` exists
- [ ] `rg "function fail\\(" backend/src` has no matches
- [ ] `rg "function requireDriver" backend/src/routes` has no matches
- [ ] `adminService` uses `driverService.publicDocument`
- [ ] `otpService` uses `fail`, no `otpError`
- [ ] `pickEventFields` still local in `shipmentService.js`
- [ ] New unit tests pass
- [ ] `cd backend && npm test` exits 0
- [ ] No mobile/admin edits; no status-code changes
- [ ] `plans/README.md` row for 038 is DONE

## STOP conditions

- 036 or 037 still TODO and you would have to merge-edit the same
  helpers they add — wait, or rebase after they land.
- `sendError` would need to attach extra JSON fields (none of today's
  mappers do). Do not expand the payload.
- Circular require: utils must not require services. If a service require
  of `driverService` from `adminService` cycles, STOP and keep the local
  document serializer with a comment.
- Temptation to add a global Express error handler — that is 035.

## Maintenance notes

- New routes should `require` these utils rather than paste another
  `sendFooError`. Mention that in the next backend plan's conventions.
- Plan 039 adds coverage config; these tiny utils should sit at 100%.
- Reviewer: the entire point is a zero-diff HTTP contract. Read the
  Jest output, not the diffs, to judge success.

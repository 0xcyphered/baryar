# Plan 027: Add self-service user profile PATCH and public platform settings

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 39fe0a7..HEAD -- backend/src/routes/auth.js backend/src/services/otpService.js backend/src/models/User.js backend/src/models/SystemSettings.js backend/src/services/settingsService.js backend/src/app.js backend/test/__tests__/auth.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates: `GET /api/auth/me`
> exists, there is **no** `PATCH /api/auth/me`, `User` already has `name` /
> `email` / `nationalId`, and `SystemSettings` already has `supportPhone` /
> `platformName`. Do not STOP just because later commits exist.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/014-phone-otp-auth.md (DONE), plans/019-admin-backend-api.md (DONE — SystemSettings exists)
- **Category**: direction
- **Planned at**: commit `39fe0a7`, 2026-09-05

## Why this matters

V6 Phase 1 §1 still has no write path for the logged-in user:

- **User information management** — administrative and contact details
- **Profile management** — customize and update platform profile settings
- **Contacting customer support** — built-in mechanism to reach help desk
- **Viewing transport-related information** — platform transit / freight guidelines

Plan 014 explicitly deferred profile PATCH (`plans/014-phone-otp-auth.md:180`):
`GET /api/auth/me` is read-only. Admin can already PATCH another user's
`name` / `email` / `nationalId` (`adminService.updateUser`), but the owner
of the account cannot. `SystemSettings.supportPhone` / `platformName` exist
and are writable only under `/api/admin/settings` — a cargo owner or driver
has no public read of the help-desk number.

This plan is **self-service profile + a tiny public settings read**. It does
not add tickets, chat, CMS pages, or admin RBAC.

## Current state

Repo layout at plan time (`39fe0a7` on `main`):

```
backend/src/routes/auth.js                 ← request-otp / verify-otp / GET /me
backend/src/services/otpService.js         ← requestOtp, verifyOtp only
backend/src/models/User.js                 ← name, email, nationalId already exist
backend/src/models/SystemSettings.js       ← platformName, supportPhone, …
backend/src/services/settingsService.js    ← getSettings / putSettings / publicSettings
backend/test/__tests__/auth.test.js        ← OTP + GET /me; no PATCH tests
mobile/src/types.ts                       ← UserProfile { id, phone, name, email, roles, status, phoneVerifiedAt }
mobile/src/screens/ProfileScreen.tsx      ← read-only display of name/phone/email
admin/src/lib/auth.tsx                    ← PublicUser has no nationalId
```

`backend/src/routes/auth.js` today — `publicUser` and the three routes. There
is **no** PATCH. `publicUser` also omits `nationalId` even though the User
model has it:

```js
function publicUser(user) {
  return {
    id: user._id.toString(),
    phone: user.phone,
    name: user.name || '',
    email: user.email || '',
    roles: user.roles,
    status: user.status,
    phoneVerifiedAt: user.phoneVerifiedAt,
  };
}

router.post('/request-otp', authLimiter, async (req, res) => { /* … */ });
router.post('/verify-otp', authLimiter, async (req, res) => { /* … */ });
router.get('/me', auth, async (req, res) => {
  return res.status(200).json({ user: publicUser(req.user) });
});
```

`backend/src/models/User.js` fields that already exist (do **not** add new
schema fields):

```js
phone: { type: String, required: true, trim: true, minlength: 10, maxlength: 16 },
name: { type: String, default: '', trim: true },
email: { type: String, default: '', trim: true, lowercase: true },
nationalId: { type: String, default: '', trim: true },
roles: { type: [String], enum: ROLES, default: () => ['cargo_owner'], /* … */ },
status: { type: String, enum: STATUSES, default: 'active' },
phoneVerifiedAt: { type: Date, default: null },
```

`backend/src/services/adminService.js:72-79` — the allowlist this plan
mirrors for the self-service PATCH (admin already does this for *other*
users; do not change admin):

```js
async function updateUser({ id, body }) {
  const user = await getUser({ id });
  const USER_EDIT_FIELDS = ['name', 'email', 'nationalId'];
  const fields = pickFields(body, USER_EDIT_FIELDS);
  Object.assign(user, fields);
  await user.save();
  return user;
}
```

`backend/src/services/settingsService.js` today — `publicSettings` returns
admin-only fields (`maxActiveCargoPerOwner`, `maintenanceMode`) that must
**not** leak on a public/user endpoint:

```js
function publicSettings(doc) {
  return {
    platformName: doc.platformName || '',
    supportPhone: doc.supportPhone || '',
    defaultCurrency: doc.defaultCurrency || 'IRR',
    maxActiveCargoPerOwner: doc.maxActiveCargoPerOwner || 20,
    maintenanceMode: doc.maintenanceMode || false,
    updatedAt: doc.updatedAt,
  };
}
```

`backend/src/app.js` mounts (order matters — new public settings route must
sit **above** the `/api` 404 catch-all):

```js
app.use('/api/auth', authRoutes);
app.use('/api/cargo', cargoRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found' });
});
```

`backend/src/services/otpService.js` exports `{ requestOtp, verifyOtp }`
only. Profile update does **not** belong in otpService. Put it in a small
new `userService.js` so auth.js stays a thin router.

`backend/test/__tests__/auth.test.js` first line is `require('../setup');`.
`GET /api/auth/me` already asserts the public-user key set:

```js
expect(Object.keys(res.body.user).sort()).toEqual([
  'email', 'id', 'name', 'phone', 'phoneVerifiedAt', 'roles', 'status',
]);
```

Adding `nationalId` to `publicUser` **will break that assertion**. Update it
in the same plan (see Step 5).

Mobile `UserProfile` (`mobile/src/types.ts:31-39`) currently has no
`nationalId`. This plan is **backend-only**; do not edit `mobile/` or
`admin/`. Extra JSON fields are ignored by TS clients until a later UI
slice.

Repo conventions to match:

- CommonJS, 2-space indent, single quotes (match `auth.js` / `cargoService.js`,
  **not** the double-quoted 017/018 files).
- Service errors: `fail(code)` / `otpError(code)` with `err.code`; routes map
  codes to HTTP in `sendAuthError`.
- Field allowlists — never `Object.assign(doc, req.body)`.
- Serializers return `id: user._id.toString()`, never a schema field named `id`.
- Tests: first line `require('../setup');`, `createApp()` + supertest, env
  `JWT_SECRET` + `OTP_FIXED_CODE=123456` + `NODE_ENV=test` in `beforeAll`.
- Jest: `cd backend && npm test` (`jest --runInBand --forceExit`). If memory
  Mongo hangs: `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod`.
- No firebase / bullmq / ioredis / stripe.

V6 bullets this plan covers (`resources/features-roadmap.md`):

```
Phase 1 §1
*   User information management
*   Profile management
*   Viewing transport-related information   ← platformName + defaultCurrency
*   Contacting customer support             ← supportPhone on GET /api/settings
```

Roadmap items this plan does **not** implement:

- Tickets / chat / help-desk queue
- Admin user delete (019 deferred; still deferred)
- Changing `phone` (identity key — would need a new OTP flow)
- Changing `roles` or `status` (admin-only)
- Enforcing `maxActiveCargoPerOwner` / `maintenanceMode` (plan 029)
- Push / SMS / payments (Phase 2)

## Commands you will need

Run from the **repo root** unless a step says `cd backend`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 39fe0a7..HEAD -- backend/src/routes/auth.js backend/src/services/otpService.js backend/src/models/User.js backend/src/models/SystemSettings.js backend/src/services/settingsService.js backend/src/app.js backend/test/__tests__/auth.test.js` | empty, or only unrelated later commits — re-read excerpts if not empty |
| Confirm no PATCH /me | `grep -n "router.patch" backend/src/routes/auth.js \|\| echo none` | `none` |
| Confirm User fields | `cd backend && node -e "const U=require('./src/models/User'); console.log(['name','email','nationalId'].map(k=>!!U.schema.path(k)).join(','))"` | `true,true,true` |
| Syntax | `cd backend && node --check src/services/userService.js && node --check src/routes/auth.js && node --check src/routes/settings.js && node --check src/app.js && node --check src/services/settingsService.js && node --check test/__tests__/auth.test.js && node --check test/__tests__/settings.routes.test.js` | exit 0 |
| App boots | `cd backend && node -e "const {createApp}=require('./src/app'); const a=createApp(); console.log(typeof a.listen==='function'?'ok':'fail')"` | `ok` |
| Tests | `cd backend && npm test -- --testPathPattern='auth.test|settings.routes'` | all pass (existing auth tests + new ones) |
| Full suite | `cd backend && npm test` | all pass (67 existing + new) |

Do **not** run `npm install`. Zero new packages.

## Suggested executor toolkit

- Skills: `amintajeran-project` (Baryar conventions), `node-backend-patterns`
  (allowlists, serializers, error mapper).
- Product checklist: `resources/features-roadmap.md` Phase 1 §1.
- Exemplars: `backend/src/routes/auth.js`, `backend/src/services/cargoService.js`
  (`pickEditableFields` + `fail(code)`), `backend/test/__tests__/auth.test.js`.

## Scope

**In scope** (the only files you should create or modify):

- `backend/src/services/userService.js` (new)
- `backend/src/routes/auth.js` (add PATCH `/me`; include `nationalId` in `publicUser`)
- `backend/src/services/settingsService.js` (add `publicPlatformSettings` helper)
- `backend/src/routes/settings.js` (new — `GET /` public read)
- `backend/src/app.js` (mount `/api/settings` above the `/api` 404)
- `backend/test/__tests__/auth.test.js` (extend — PATCH `/me` + updated key set)
- `backend/test/__tests__/settings.routes.test.js` (new)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `backend/src/models/User.js`, `SystemSettings.js` — no schema changes.
- `backend/src/services/adminService.js`, `backend/src/routes/admin.js` —
  admin already PATCHes other users; do not change it.
- `backend/src/services/otpService.js`, `backend/src/middleware/auth.js`.
- `mobile/`, `admin/`, `webapp/` — backend only. Extra JSON fields are
  backward-compatible.
- Changing phone, roles, status, password, OTP.
- Tickets, chat, CMS, file uploads, matching, shipments.
- Phase 2: SMS, payments, companies, GPS.

## Git workflow

- Branch: stay on the current branch (`main`) unless the operator has already
  checked out an advisor branch. Do **not** push.
- Commit style (from `git log`): `feat(027): add user profile PATCH and public settings`
  then `chore(027): mark plan DONE in index`.
- Never commit `.env` files or secrets.

## Steps

### Step 1: Create `backend/src/services/userService.js`

New file. CommonJS, 2-space, single quotes. Copy the `fail` / `pickFields`
shape from `cargoService.js` (not otpService — otpService throws
`otpError` and must stay OTP-only).

```js
const PROFILE_FIELDS = ['name', 'email', 'nationalId'];

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function pickFields(body, keys) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    phone: user.phone,
    name: user.name || '',
    email: user.email || '',
    nationalId: user.nationalId || '',
    roles: user.roles,
    status: user.status,
    phoneVerifiedAt: user.phoneVerifiedAt,
  };
}

async function updateMe({ user, body }) {
  if (!user) fail('unauthorized');
  const fields = pickFields(body, PROFILE_FIELDS);
  if (Object.keys(fields).length === 0) fail('validation_error');
  if (fields.email !== undefined && typeof fields.email !== 'string') fail('validation_error');
  if (fields.name !== undefined && typeof fields.name !== 'string') fail('validation_error');
  if (fields.nationalId !== undefined && typeof fields.nationalId !== 'string') fail('validation_error');
  // Empty string is allowed (clear the field). Trim. Email is lowercased by the schema.
  if (fields.name !== undefined) fields.name = fields.name.trim();
  if (fields.email !== undefined) fields.email = fields.email.trim();
  if (fields.nationalId !== undefined) fields.nationalId = fields.nationalId.trim();
  Object.assign(user, fields);
  await user.save();
  return user;
}

module.exports = { PROFILE_FIELDS, publicUser, updateMe };
```

Hard rules:

- Do **not** copy `phone`, `roles`, `status`, `phoneVerifiedAt`, `_id` from
  the body. The allowlist is the entire contract.
- Do **not** re-fetch the user — `auth` already loaded `req.user`. Mutate
  that document and `save()` so Mongoose validators run.
- `email` lowercase is already a schema setter (`lowercase: true`). Do not
  add a second unique index on email — email is optional profile text, not
  the identity key.

**Verify**: `cd backend && node --check src/services/userService.js` → exit 0.
`cd backend && node -e "const m=require('./src/services/userService'); console.log(Object.keys(m).sort().join(','))"`
→ `PROFILE_FIELDS,publicUser,updateMe`.

### Step 2: Wire PATCH `/me` in `backend/src/routes/auth.js`

1. `const userService = require('../services/userService');`
2. Replace the local `publicUser` function with a re-export so verify-otp and
   GET /me stay consistent:

```js
const { publicUser, updateMe } = require('../services/userService');
```

   Delete the local `function publicUser` (lines 23–33). `verify-otp` and
   `GET /me` already call `publicUser(user)` / `publicUser(req.user)` — those
   call sites stay, they just resolve to the service helper (which now
   includes `nationalId`).

3. Extend `sendAuthError` map with `unauthorized: 401` (already implied by
   auth middleware, but `updateMe` can throw it) and `validation_error: 400`.
   Keep existing OTP codes.

4. Add the route **after** `GET /me`:

```js
router.patch('/me', auth, async (req, res) => {
  try {
    const user = await updateMe({ user: req.user, body: req.body });
    return res.status(200).json({ user: publicUser(user) });
  } catch (err) {
    return sendAuthError(res, err);
  }
});
```

Do **not** put rate-limit on PATCH /me (authLimiter stays on OTP only).

**Verify**: `cd backend && node --check src/routes/auth.js` → exit 0.
`grep -n "router.patch('/me'" backend/src/routes/auth.js` → one hit.
`grep -n "function publicUser" backend/src/routes/auth.js` → no hits (moved).

### Step 3: Add a public-safe settings serializer

In `backend/src/services/settingsService.js`, add a second serializer that
strips admin-only knobs. Keep `publicSettings` unchanged (admin PUT/GET
still returns the full object).

```js
function publicPlatformSettings(doc) {
  return {
    platformName: doc.platformName || '',
    supportPhone: doc.supportPhone || '',
    defaultCurrency: doc.defaultCurrency || 'IRR',
  };
}
```

Export it: `module.exports = { getSettings, putSettings, publicSettings, publicPlatformSettings };`

Do **not** put `maxActiveCargoPerOwner` or `maintenanceMode` on this object.
Those stay admin-only until plan 029 enforces them server-side.

**Verify**: `cd backend && node --check src/services/settingsService.js` → exit 0.
`cd backend && node -e "const m=require('./src/services/settingsService'); console.log(typeof m.publicPlatformSettings)"`
→ `function`.

### Step 4: Create `backend/src/routes/settings.js` and mount it

New router. **No auth** — support phone is the help-desk number, not a
secret. Match `auth.js` style (single quotes).

```js
const express = require('express');
const settingsService = require('../services/settingsService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const settings = await settingsService.getSettings();
    return res.status(200).json({
      settings: settingsService.publicPlatformSettings(settings),
    });
  } catch (err) {
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
```

In `backend/src/app.js`:

```js
const settingsRoutes = require('./routes/settings');
```

Mount **before** the `/api` 404, after auth is fine:

```js
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
```

(Keep the rest of the mounts as they are.)

**Verify**: `cd backend && node --check src/routes/settings.js && node --check src/app.js` → exit 0.
`grep -n "app.use('/api/settings'" backend/src/app.js` → one line, and its
line number is **less than** `app.use('/api',` catch-all.

### Step 5: Tests

#### 5a. Update `backend/test/__tests__/auth.test.js`

The verify-otp key-set assertion currently omits `nationalId`. Change it to:

```js
expect(Object.keys(res.body.user).sort()).toEqual([
  'email', 'id', 'name', 'nationalId', 'phone', 'phoneVerifiedAt', 'roles', 'status',
]);
```

Add these tests in the same `describe('auth OTP')` (or a sibling
`describe('auth profile')` in the same file — either is fine; keep the
existing helpers / `beforeAll`):

1. `PATCH /api/auth/me` without a token → 401 `{ error: 'unauthorized' }`.
2. `PATCH /api/auth/me` with a valid token and `{ name: 'Ali Reza', email: 'Ali@Example.com', nationalId: '0071234567' }`
   → 200, `user.name === 'Ali Reza'`, `user.email === 'ali@example.com'`
   (schema lowercase), `user.nationalId === '0071234567'`. Subsequent
   `GET /api/auth/me` returns the same values.
3. `PATCH /api/auth/me` with `{ roles: ['admin'], status: 'blocked', phone: '09120000000' }`
   and no allowlisted field → 400 `{ error: 'validation_error' }`. A follow-up
   GET /me still has original `roles: ['cargo_owner']` and original phone.
   (If the body also includes `name: 'x'` plus `roles`, the name **does**
   apply and roles still do not — assert both.)
4. `PATCH /api/auth/me` with `{ name: '' }` clears the name to `''`.
5. Garbage bearer → 401 (same as GET /me).

Reuse the existing `PHONE` / `FIXED_CODE` / `register via request-otp +
verify-otp` pattern. Do not invent a second app instance.

#### 5b. Create `backend/test/__tests__/settings.routes.test.js`

First line: `require('../setup');`. Pattern: `auth.test.js`.

```js
require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const SystemSettings = require('../../src/models/SystemSettings');

describe('public settings', () => {
  const app = createApp();

  test('GET /api/settings returns platformName, supportPhone, defaultCurrency and nothing else', async () => {
    await SystemSettings.findOneAndUpdate(
      { key: 'global' },
      { platformName: 'Baryar', supportPhone: '02112345678', defaultCurrency: 'IRR', maintenanceMode: true, maxActiveCargoPerOwner: 3 },
      { upsert: true }
    );
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({
      platformName: 'Baryar',
      supportPhone: '02112345678',
      defaultCurrency: 'IRR',
    });
    expect(res.body.settings.maintenanceMode).toBeUndefined();
    expect(res.body.settings.maxActiveCargoPerOwner).toBeUndefined();
  });

  test('GET /api/settings works with no document yet (upserts defaults)', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({
      platformName: '',
      supportPhone: '',
      defaultCurrency: 'IRR',
    });
  });
});
```

`getSettings` already upserts the singleton, so the second test is the
empty-DB path (setup.js `deleteMany`s after each test).

**Verify**: `cd backend && node --check test/__tests__/auth.test.js && node --check test/__tests__/settings.routes.test.js` → exit 0.
`cd backend && npm test -- --testPathPattern='auth.test|settings.routes'` → all pass.
Then `cd backend && npm test` → full suite still green.

If MongoMemoryServer hangs: `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod`
once, then re-run. Do not switch to `MongoMemoryReplSet`.

### Step 6: Mark the plan DONE in the index

Update the 027 row in `plans/README.md` to `DONE` after the tests pass.
Commit per Git workflow.

**Verify**: `git status --short` shows only in-scope files (plus the index).
`grep -n "router.patch('/me'" backend/src/routes/auth.js` → one hit.
`grep -n "app.use('/api/settings'" backend/src/app.js` → one hit above the 404.

## Test plan

- New / extended tests listed in Step 5. Structural pattern:
  `backend/test/__tests__/auth.test.js` (OTP register helper, Bearer header,
  exact `{ error }` bodies).
- Cases that must exist:
  - happy-path PATCH name/email/nationalId
  - mass-assignment of roles/status/phone rejected
  - unauthenticated PATCH
  - public settings strips admin knobs even when they are set
  - public settings default document
  - existing GET /me key-set updated for `nationalId`
- Verification: `cd backend && npm test` → all pass, including the new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && node --check src/services/userService.js && node --check src/routes/auth.js && node --check src/routes/settings.js && node --check src/app.js` exits 0
- [ ] `grep -n "router.patch('/me'" backend/src/routes/auth.js` returns one hit
- [ ] `grep -n "app.use('/api/settings'" backend/src/app.js` is a line number **less than** `app.use('/api',`
- [ ] `cd backend && node -e "const m=require('./src/services/userService'); console.log(m.PROFILE_FIELDS.join(','))"` prints `name,email,nationalId`
- [ ] `cd backend && npm test` exits 0; new PATCH /me tests and settings tests exist and pass
- [ ] `grep -n "maxActiveCargoPerOwner\|maintenanceMode" backend/src/routes/settings.js` returns no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 027 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (the codebase has drifted since this plan was written).
- `User` schema no longer has `name` / `email` / `nationalId`, or those
  fields have become unique/required.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching `mobile/` or `admin/` to compile
  (it should not — extra JSON fields are fine).
- You are about to add a new npm dependency, a ticket/chat collection, or
  a way for the user to change `phone` / `roles` / `status`.
- You are about to put `maxActiveCargoPerOwner` or `maintenanceMode` on
  the public settings payload.

## Maintenance notes

- Mobile `ProfileScreen` is still read-only. A later mobile slice should
  call `PATCH /api/auth/me` and extend `UserProfile` with `nationalId`.
  Until then the API is usable from curl / admin-adjacent tools.
- `publicUser` now lives in `userService.js`. `otpService.verifyOtp` still
  returns the raw mongoose user; `routes/auth.js` is the only serializer
  call site. If a future plan serializes users elsewhere, import
  `userService.publicUser` — do not fork a third copy. Admin keeps
  `publicAdminUser` (includes `createdAt` / `updatedAt`).
- Plan 029 will start *enforcing* `maintenanceMode` / cargo caps; this
  plan only *exposes* the public subset of settings.
- Reviewer should confirm the PATCH allowlist cannot accept `roles` or
  `status` even when mixed with a valid `name`.

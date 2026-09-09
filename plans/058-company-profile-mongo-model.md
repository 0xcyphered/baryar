# Plan 058: Add Phase 1 CompanyProfile Mongo model for the MVP transport-company slice

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b672f9c..HEAD -- backend/src/models backend/test/__tests__/models.identity.test.js backend/src/services backend/src/routes resources/features-roadmap.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates: `backend/src/models/User.js` already lists `'transport_company'` in `ROLES` (049 present) and `backend/src/models/CompanyProfile.js` does **not** exist (058 not yet applied). Do not STOP just because the advisor branch was merged.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/049-backend-transport-company-role.md (DONE — `User.ROLES` includes `transport_company`)
- **Category**: direction
- **Planned at**: commit `b672f9c`, 2026-09-08

## Why this matters

On 2026-09-08 the operator promoted **شرکت حمل و نقل / transport companies** from Phase 2 into the Phase 1 MVP (`resources/features-roadmap.md` commit `74c5906`). The roadmap now says a *minimal* corporate registration + fleet-*view* slice ships in Phase 1; staff, fleet CRUD, load allocation, and reporting stay Phase 2.

Plans 049–051 only covered the role enum + mobile chrome:

| Layer | Status |
|-------|--------|
| `User.ROLES` includes `transport_company` | DONE (049) |
| Mobile 3-role picker + company tab | DONE (050) |
| Placeholder company dashboard (reads `useAuth().user.name/phone` only) | DONE (051) |
| Mongo document that can hold a company's legal name, registration numbers, and admin verification | **missing** |

A `transport_company` user today is just a `User` row with a role. There is no 1-1 profile (the `DriverProfile` analogue), so later company-registration / admin-verify slices have nowhere to persist credentials without inventing field names. Phase 1 §5 already names **Registered transport company management** and **Company credential verification** — both need a profile document with `verificationStatus`, the same way 016/019 used `DriverProfile`.

This plan is **schema + indexes + model tests only**. It does not add routes, role-granting, admin verify, mobile forms, or fleet.

## Current state

Repo at `b672f9c` on `main`:

```
baryar/
  resources/features-roadmap.md   ← V6 + 2026-09-08 operator correction
  backend/src/models/             ← 011 + 013 + 014/018/019 extras; NO CompanyProfile
  backend/test/__tests__/models.identity.test.js
  mobile/src/screens/CompanyDashboardScreen.tsx  ← placeholder; out of scope
```

### Roadmap bullets this model must cover (do not "improve" the names)

`resources/features-roadmap.md` Phase 1 intro (lines 20–23) + §8 (line 128) + Phase 2 §2 note (lines 142–144):

```
The three mobile user models for the MVP are:
1. صاحبان کالا / Cargo Owners — generic "user" IS the cargo owner
2. رانندگان / Drivers
3. شرکت حمل و نقل / Transport Companies — promoted from Phase 2 §2
   A minimal corporate registration + fleet-view slice ships in Phase 1;
   staff management, load allocation, reporting remain in Phase 2.

Phase 1 §8: MVP Transport Company Slice — transport_company role in
User.ROLES, mobile company mode, placeholder fleet overview.

Phase 1 §5: Registered transport company management
            Company credential verification

Phase 2 §2: Shipping company registration *(MVP slice in Phase 1)*
            Shipping company data management          ← later API, not this plan
            Fleet / staff / allocation / reporting    ← stay Phase 2
```

049 already landed the role. This plan lands the **registration document**. Fleet-view stays a client placeholder (051) until a later API.

### `User.js` today (049 already applied — do not change ROLES)

```js
// backend/src/models/User.js
// transport_company = شرکت حمل و نقل
const ROLES = ['cargo_owner', 'driver', 'transport_company', 'admin'];
```

OTP still upserts `roles: ['cargo_owner']`. That stays. A company self-identifies later (same decision as 049: do not change the OTP default).

### `DriverProfile.js` — the pattern to copy (full file, 26 lines)

```js
const mongoose = require('mongoose');

const VERIFICATION = ['pending', 'approved', 'rejected'];

const driverProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    licenseNumber: { type: String, default: '', trim: true },
    professionalCardNumber: { type: String, default: '', trim: true },
    verificationStatus: { type: String, enum: VERIFICATION, default: 'pending' },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

driverProfileSchema.index({ userId: 1 }, { unique: true });
driverProfileSchema.index({ verificationStatus: 1 });

driverProfileSchema.statics.VERIFICATION = VERIFICATION;

module.exports = mongoose.model('DriverProfile', driverProfileSchema, 'driver_profiles');
```

`CompanyProfile` is the same shape with company credential strings instead of license numbers. Reuse the same `VERIFICATION` tokens (`pending` / `approved` / `rejected`) — do not invent `verified` / `active` / `kyc_ok`.

### `Document.js` kinds today

```js
const KINDS = [
  'driving_license',
  'vehicle_registration',
  'safety_card',
  'national_id',
  'professional_card',
  'other',
];
```

Phase 1 §5 "Company credential verification" needs at least one company-shaped kind so later upload/admin slices do not stuff legal papers into `other`. Additive only — existing driver tests keep passing.

`driverService.js:197` validates with `Document.KINDS.includes(kind)`, so growing the array automatically accepts the new tokens on the existing JSON stub POST. Do **not** change `driverService.js` in this plan (company uploads get their own route later).

### `Vehicle.js` — do not touch

```js
driverProfileId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'DriverProfile',
  required: true,
},
ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
```

A company-owned fleet vehicle would need `driverProfileId` optional (or a `companyProfileId`). That is Phase 2 fleet management. 051's dashboard already says «ناوگان فعال: به‌زودی». Leave Vehicle required-driver.

### Identity tests today (`backend/test/__tests__/models.identity.test.js`)

First line is `require('../setup');`. Existing cases:

- default `cargo_owner` + unique phone
- reject missing phone
- reject unknown role `'company'` (this still must fail — the real token is `transport_company`)
- accept `transport_company` and pin `User.ROLES` to the four-value array (049)
- DriverProfile 1-1 + unique plate
- Document stub without a buffer
- User has no schema path named `id`

Add company cases next to the 049 transport_company test. Do not rewrite the driver cases.

### Conventions to match

- CommonJS, **2-space indent** (`backend/src/models/DriverProfile.js`, `User.js`). Do not copy XScheduler's 4-space models.
- Closed string enums on the schema, also exported as `Model.statics.X`.
- Collection override where English pluralization is ugly: `mongoose.model('CompanyProfile', schema, 'company_profiles')` (same reason as `'driver_profiles'` / `'cargos'`).
- `{ timestamps: true }` — do **not** add an explicit `createdAt`.
- No schema field named `id` (shadows the Mongoose virtual).
- No field named `type` (Mongoose reserved). Domain names: `verificationStatus`, `kind`.
- Jest: every test file **first line** `require('../setup');`. `npm test` = `jest --runInBand --forceExit` from `backend/`.
- In-memory Mongo is `MongoMemoryServer`, **not** `MongoMemoryReplSet`. If memory Mongo hangs: `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` once. Do not download mongod as part of this plan.
- Quote style: `DriverProfile.js` / `User.js` / `Document.js` use single quotes. Match that.
- Iran-first vocabulary in comments only: شرکت حمل و نقل. Field names stay English identifiers (`legalName`, not `نامشرکت`).

### What the MVP change is NOT (do not build these)

| Item | Why not here |
|------|----------------|
| `Fleet` / `Staff` / `CompanyMember` collections | Phase 2 §2. Operator left them parked. |
| Optional `Vehicle.driverProfileId` / `companyProfileId` on Vehicle | Fleet CRUD is Phase 2; 051 is a placeholder. |
| `companyUserId` on Offer / Shipment | Companies do not bid as a company yet; offers stay `driverUserId`. |
| `POST /api/company/profile` or `requireTransportCompany` | Schema first, same as 011 then 016. A later API plan copies `driverService.upsertProfile`. |
| Granting `transport_company` from OTP verify | 049 decision: default stays `cargo_owner`. |
| Admin `POST /api/admin/companies/:userId/verify` | Needs this model first; copy `verifyDriverProfile` in a later 019-style slice. |
| Mobile CompanyDashboardScreen wiring | 051 already renders `user.name` / `user.phone`. Do not edit `mobile/`. |
| KYC APIs, payments, ratings | Phase 2. |
| Changing `User.nationalId` into a company field | Person کد ملی stays on User. Company شناسه ملی is `companyNationalId` on CompanyProfile. |

## Commands you will need

Run from the **repo root** unless a step says `cd backend`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm 049 role exists | `cd backend && node -e "const U=require('./src/models/User'); console.log(U.ROLES.join(','))"` | `cargo_owner,driver,transport_company,admin` |
| Confirm CompanyProfile missing | `test -f backend/src/models/CompanyProfile.js && echo HAS \|\| echo MISSING` | `MISSING` |
| Syntax | `cd backend && node -c src/models/CompanyProfile.js && node -c src/models/Document.js` | exit 0, no output |
| Load model | `cd backend && node -e "require('./src/models/CompanyProfile'); console.log('ok')"` | `ok` |
| Unit tests | `cd backend && npm test` | exit 0; identity tests include the new company cases |
| No new deps | `grep -E "firebase\|bullmq\|ioredis\|stripe" backend/package.json \|\| true` | empty |
| No `id` path | `cd backend && node -e "const C=require('./src/models/CompanyProfile'); console.log(C.schema.path('id') ? 'BAD' : 'ok')"` | `ok` |
| Health still registered | `grep -n "app.get('/health'" backend/src/app.js` | one match |

Do **not** run `npm install` at the repo root. There is no root `package.json`.

If `mongodb-memory-server` hangs: `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` and retry **once**. Second hang → STOP.

## Suggested executor toolkit

- Skill `amintajeran-project` if present — Phase 1 vs Phase 2 boundary, no `type` field, collection-name override, `MONGOMS_SYSTEM_BINARY`.
- Skill `mongoose-patterns` if present — reserved `type`, no `{ timestamps: true }` + explicit `createdAt`, no schema field named `id`.
- Product source: `resources/features-roadmap.md` Phase 1 intro + §5 + §8. Do **not** follow `resources/features-roadmap-old.md`.

## Scope

**In scope** (the only files you should create or modify):

- `backend/src/models/CompanyProfile.js` (create)
- `backend/src/models/Document.js` (append two kinds)
- `backend/test/__tests__/models.identity.test.js` (add cases)
- `plans/README.md` (status row for 058)

**Out of scope** (do NOT touch, even though they look related):

- `backend/src/models/User.js` — ROLES already correct from 049.
- `backend/src/models/DriverProfile.js`, `Vehicle.js`, `Cargo.js`, `Offer.js`, `Shipment.js`, `ShipmentEvent.js`, `geoPoint.js`, `Notification.js`, `SystemSettings.js`, `OtpChallenge.js`.
- `backend/src/app.js`, `backend/src/index.js`, `backend/src/config/db.js` — do not mount routes, do not `require` the new model from the process.
- `backend/src/services/**`, `backend/src/routes/**`, `backend/src/middleware/requireRole.js` — no `requireTransportCompany`, no company CRUD.
- `backend/test/__tests__/models.cargo.test.js`, `health.test.js`, admin/driver/matching HTTP tests.
- `mobile/**`, `admin/**`. Do not update `mobile/src/types.ts` `DriverDocument.kind` union (client follow-up when upload exists).
- `resources/features-roadmap.md` — already updated; this plan implements the model hole, it does not rewrite the spec.
- Phase 2 collections: Fleet, Staff, Rating, Review, Payment, VehiclePosition, AuditLog, KYC.
- Making `Vehicle.driverProfileId` optional.
- Redis, BullMQ, TypeScript, Docker, migrations, `ensureIndexes` on boot.
- Copying files out of `$HOME/projects/v5`.

## Git workflow

- Branch: `advisor/058-company-profile-mongo-model` from current `main` (`b672f9c` or later if only docs/unrelated commits landed).
- Commit style from this repo:
  - `feat(058): add CompanyProfile model + company document kinds`
  - `chore(058): mark plan DONE in index`
  Earlier examples: `feat(049): add transport_company role to backend User.ROLES + tests`, `feat(013): add Cargo.transportMode enum`.
- Do NOT push or open a PR unless the operator instructed it.

## Domain map (additive)

Existing 011 graph, plus one 1-1 profile:

```
User 1-1 DriverProfile 1-n Vehicle
User 1-1 CompanyProfile          ← NEW (only if roles includes transport_company)
User 1-n Document, Cargo, Offer, Notification
Cargo 1-n Offer
Cargo 1-1 Shipment (unique cargoId)
Shipment 1-n ShipmentEvent
SystemSettings (singleton key: 'global')
```

A User may hold `cargo_owner` and `transport_company` together (same as cargo_owner+driver today). Admin is still a role on User. Do not add a Company *parent* collection that Users belong to — that is staff management (Phase 2).

New / changed enums:

| Model | Field | Values | Default |
|-------|-------|--------|---------|
| CompanyProfile | `verificationStatus` | `pending`, `approved`, `rejected` | `pending` |
| Document | `kind` | existing six **plus** `company_registration`, `transport_license` | required (unchanged) |

English tokens (not Persian):

| Token | Meaning |
|-------|---------|
| `legalName` | نام شرکت |
| `registrationNumber` | شماره ثبت |
| `companyNationalId` | شناسه ملی شرکت (11-digit). Not `User.nationalId` (کد ملی شخص). |
| `economicCode` | کد اقتصادی |
| `company_registration` | آگهی تاسیس / روزنامه رسمی scan |
| `transport_license` | پروانه فعالیت حمل‌ونقل |

Do **not** name fields `name` (collides with `User.name` in later serializers), `id`, `type`, `company` (too vague), or `nationalId` on CompanyProfile (collides with `User.nationalId`).

Credential strings are optional (`default: ''`), same as `DriverProfile.licenseNumber`. `CompanyProfile.create({ userId })` must succeed so a later upsert can create a pending shell.

Indexes (minimum):

- CompanyProfile: unique `userId`; `{ verificationStatus: 1 }`
- Document: existing `{ userId: 1, kind: 1 }` already covers the new kinds. Do not add a unique (userId, kind) — a company may upload more than one `company_registration` over time, same as drivers re-uploading a license.

## Steps

### Step 1: Confirm 049 present, 058 not applied, branch

```bash
git checkout -b advisor/058-company-profile-mongo-model
test -f backend/src/models/User.js && echo user_ok
test -f backend/src/models/CompanyProfile.js && echo HAS || echo MISSING
cd backend && node -e "const U=require('./src/models/User'); if (U.ROLES.indexOf('transport_company') === -1) { process.exit(1) } console.log('role_ok')"
```

**Verify**: `user_ok`, `MISSING`, `role_ok`. If `CompanyProfile.js` already exists, STOP. If `transport_company` is missing from `User.ROLES`, STOP — execute 049 first.

### Step 2: Create `backend/src/models/CompanyProfile.js`

Create the file **exactly** (2-space indent, single quotes, collection `'company_profiles'`):

```js
const mongoose = require('mongoose');

const VERIFICATION = ['pending', 'approved', 'rejected'];

const companyProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    legalName: { type: String, default: '', trim: true },
    registrationNumber: { type: String, default: '', trim: true },
    companyNationalId: { type: String, default: '', trim: true },
    economicCode: { type: String, default: '', trim: true },
    verificationStatus: { type: String, enum: VERIFICATION, default: 'pending' },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

companyProfileSchema.index({ userId: 1 }, { unique: true });
companyProfileSchema.index({ verificationStatus: 1 });

companyProfileSchema.statics.VERIFICATION = VERIFICATION;

module.exports = mongoose.model('CompanyProfile', companyProfileSchema, 'company_profiles');
```

**Verify**:

```bash
cd backend && node -c src/models/CompanyProfile.js
node -e "const C=require('./src/models/CompanyProfile'); console.log([C.modelName, C.collection.name, C.schema.path('id') ? 'HAS_ID' : 'no_id', C.VERIFICATION.join(',')].join(' '))"
```

Expected: exit 0, then `CompanyProfile company_profiles no_id pending,approved,rejected`.

If `collection.name` prints `companyprofiles` (no underscore), the third `mongoose.model` argument was omitted — fix it before continuing.

### Step 3: Append company kinds on `Document.js`

In `backend/src/models/Document.js`, change `KINDS` to:

```js
const KINDS = [
  'driving_license',
  'vehicle_registration',
  'safety_card',
  'national_id',
  'professional_card',
  'company_registration',
  'transport_license',
  'other',
];
```

Keep `'other'` last (it is the catch-all, matching the current file). Do not reorder the existing six. Do not change indexes, `VERIFICATION`, or any other field.

**Verify**:

```bash
cd backend && node -e "const D=require('./src/models/Document'); console.log(D.KINDS.join(','))"
```

Expected: `driving_license,vehicle_registration,safety_card,national_id,professional_card,company_registration,transport_license,other`

### Step 4: Add identity tests

In `backend/test/__tests__/models.identity.test.js`:

1. Add `const CompanyProfile = require('../../src/models/CompanyProfile');` next to the existing `DriverProfile` require (file currently requires User, DriverProfile, Vehicle, Document).
2. After the existing `accepts transport_company role and pins the full ROLES enum` test, add the two tests below. Do not edit the 049 test. Do not remove the `rejects an unknown role` case that uses `roles: ['company']` — `'company'` is still invalid; the real token is `transport_company`.

```js
  it('creates a company profile 1-1 with user and defaults pending verification', async () => {
    const user = await makeUser({
      phone: '+989****7777',
      roles: ['transport_company'],
    });
    const profile = await CompanyProfile.create({
      userId: user._id,
      legalName: 'شرکت حمل نمونه',
      registrationNumber: '12345',
      companyNationalId: '10100000000',
      economicCode: '411111111111',
    });
    expect(profile.verificationStatus).toBe('pending');
    expect(profile.verifiedAt).toBeNull();
    expect(profile.legalName).toBe('شرکت حمل نمونه');
    expect(CompanyProfile.VERIFICATION).toEqual(['pending', 'approved', 'rejected']);
    await expect(CompanyProfile.create({ userId: user._id })).rejects.toThrow();
  });

  it('stores a company_registration document kind without a file buffer', async () => {
    const user = await makeUser({ phone: '+989****8888', roles: ['transport_company'] });
    const doc = await Document.create({
      userId: user._id,
      kind: 'company_registration',
      storageKey: 'uploads/dev/company-reg-1',
      originalName: 'rooznameh.pdf',
      mimeType: 'application/pdf',
    });
    expect(doc.verificationStatus).toBe('pending');
    expect(doc.kind).toBe('company_registration');
    expect(doc.toObject().data).toBeUndefined();

    const license = await Document.create({
      userId: user._id,
      kind: 'transport_license',
    });
    expect(license.kind).toBe('transport_license');

    await expect(
      Document.create({ userId: user._id, kind: 'articles_of_incorporation' })
    ).rejects.toThrow();
  });
```

Phone numbers `+989****7777` / `+989****8888` are unused in this file (existing tests use 1111, 2222, 3333, 4444, 5555). Do not reuse 5555 — the 049 test already owns it.

Also pin the kinds enum once, inside the second new test or as a one-liner in the first — cheapest: add to the company_registration test:

```js
    expect(Document.KINDS).toEqual([
      'driving_license',
      'vehicle_registration',
      'safety_card',
      'national_id',
      'professional_card',
      'company_registration',
      'transport_license',
      'other',
    ]);
```

Keep the first line of the file `require('../setup');`.

**Verify** (run this before the full suite so a schema typo fails fast):

```bash
cd backend && npm test -- --testPathPattern=models.identity
```

Expected: all identity tests pass, including the two new ones. If unique-phone collisions fire, a leftover document from a parallel run is not the cause (`setup.js` `afterEach` wipes collections) — you reused a phone string; pick another.

### Step 5: Full backend suite

```bash
cd backend && npm test
```

Expected: exit 0, all suites green.

Known history: plans 038/052/055 documented a pre-existing multer mime failure that 055 then fixed (`076f911`, 289/289). At plan-time HEAD `b672f9c` that failure should already be gone. Do **not** "fix" unrelated failures by editing `app.js` or adding a global Express error handler (that is deferred plan 035). If a new failure is in `models.identity` or `Document` validation, fix the 058 change. If a failure is in an unrelated file you did not touch, STOP and report.

### Step 6: Grep gates

```bash
# in-scope files only
git diff --stat
git diff -- backend/src/models/User.js backend/src/models/Vehicle.js backend/src/services backend/src/routes mobile admin

# new model has no field named id or type-as-domain
grep -n "id:" backend/src/models/CompanyProfile.js || true
grep -n "company_profiles" backend/src/models/CompanyProfile.js

# kinds landed
grep -n "company_registration" backend/src/models/Document.js
grep -n "transport_license" backend/src/models/Document.js
```

**Verify**:

- `git diff --stat` shows only `CompanyProfile.js` (new), `Document.js`, `models.identity.test.js`. `plans/README.md` is updated in step 7.
- Diff against User / Vehicle / services / routes / mobile / admin is empty.
- `CompanyProfile.js` has no schema path `id:` (the `userId:` line is fine).
- `company_profiles` appears in the `mongoose.model` call.
- Both new kinds appear in `Document.js`.

### Step 7: Mark the plan DONE in the index and commit

1. Commit the model + tests:

```bash
git add backend/src/models/CompanyProfile.js backend/src/models/Document.js backend/test/__tests__/models.identity.test.js
git commit -m "feat(058): add CompanyProfile model + company document kinds"
```

2. In `plans/README.md`:
   - Set the 058 status-table row to `DONE` with a one-line note (`tsc` N/A; report the Jest count, e.g. `feat(058) — N/N green, CompanyProfile 1-1 + two Document kinds`).
   - Do not delete older rows. Do not renumber.

3. Second commit:

```bash
git add plans/README.md
git commit -m "chore(058): mark plan DONE in index"
```

Do not push. Do not execute a follow-up API plan in this branch.

## Test plan

New tests live in `backend/test/__tests__/models.identity.test.js` (same file as 049's role pin). Model after the existing `creates a driver profile 1-1 with user and a vehicle with unique plate` test.

Cases that MUST exist and pass:

- Happy path: `CompanyProfile.create` with `userId` + credential strings → `verificationStatus === 'pending'`, `verifiedAt === null`.
- Unique `userId`: second create for the same user throws (Mongo duplicate key / Mongoose validator — either is fine, same as DriverProfile).
- `CompanyProfile.VERIFICATION` equals `['pending', 'approved', 'rejected']`.
- `Document.create` with `kind: 'company_registration'` succeeds; `kind: 'transport_license'` succeeds; unknown kind `'articles_of_incorporation'` throws.
- `Document.KINDS` equals the eight-token array (six old + two new, `'other'` last).
- Existing 049 test still pins `User.ROLES` to four values.
- Existing `rejects an unknown role` with `roles: ['company']` still throws.

Do not add HTTP tests. Do not add a new test file.

Verification: `cd backend && npm test` → exit 0, including the new identity cases.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f backend/src/models/CompanyProfile.js` succeeds
- [ ] `cd backend && node -e "const C=require('./src/models/CompanyProfile'); console.log(C.collection.name, C.schema.path('id') ? 'BAD' : 'ok', C.VERIFICATION.join(','))"` prints `company_profiles ok pending,approved,rejected`
- [ ] `cd backend && node -e "const D=require('./src/models/Document'); console.log(D.KINDS.join(','))"` prints `driving_license,vehicle_registration,safety_card,national_id,professional_card,company_registration,transport_license,other`
- [ ] `cd backend && npm test` exits 0
- [ ] `grep -n "companyUserId\|companyProfileId" backend/src/models/Vehicle.js backend/src/models/Offer.js backend/src/models/Shipment.js` is empty
- [ ] `git diff --name-only` (uncommitted) is empty after the two commits; committed paths are only the in-scope list plus `plans/README.md`
- [ ] `plans/README.md` status row for 058 is `DONE`
- [ ] `mobile/` and `admin/` are untouched (`git log -1 --name-only` on the feat commit does not list them)

## STOP conditions

Stop and report back (do not improvise) if:

- `backend/src/models/CompanyProfile.js` already exists, or `User.ROLES` does not include `transport_company`.
- The code at the locations in "Current state" does not match the excerpts (drift).
- A step's verification fails twice after a reasonable fix attempt.
- You believe `Vehicle.driverProfileId` must become optional "while you're here" so companies can own trucks — that is Phase 2 fleet. Leave it.
- You believe OTP verify should start granting `transport_company` — 049 forbade that.
- Tests fail in files you did not touch and the failure is not a unique-phone clash in `models.identity.test.js`.
- You are about to add `src/routes/company.js`, `requireTransportCompany`, or edit `mobile/src/types.ts`.
- `mongodb-memory-server` hangs a second time after setting `MONGOMS_SYSTEM_BINARY`.

## Maintenance notes

- Next API slice (not this plan) should copy `driverService.upsertProfile`: `$addToSet: { roles: 'transport_company' }` + `CompanyProfile.findOneAndUpdate`/`create`, allowlist `legalName` / `registrationNumber` / `companyNationalId` / `economicCode`, serialize via a `publicCompanyProfile` helper that returns `id: profile._id.toString()` (never raw `_id`). Granting the role belongs on that upsert, not on OTP, matching how `POST /api/driver/profile` is the only self-service path onto `driver`.
- Next admin slice should copy `adminService.verifyDriverProfile` onto CompanyProfile (`pending`/`approved`/`rejected` + `verifiedAt` + `rejectionReason`). Do not invent a second status machine. Admin list can already `GET /api/admin/users?role=transport_company` (049 test).
- Do not gate matching/offers on CompanyProfile. Matching is still driver-only (`requireDriver` + approved `DriverProfile`, plan 052). A company that wants to bid uses a driver account, or a later Phase 2 allocation slice.
- `Document.KINDS` growth is backward-compatible for the existing driver JSON POST (`KINDS.includes`). Mobile `DriverDocumentsScreen` and `mobile/src/types.ts` still list the old six-kind union — update those only when a company upload screen exists, otherwise TypeScript will not know the new tokens (harmless until a client sends them).
- If pagination of company documents is added, `{ userId: 1, kind: 1 }` is already there. Do not unique that pair.
- Reviewers: confirm no Fleet/Staff collection, no Vehicle change, no OTP default change, no field named `id`/`type`/`nationalId` on CompanyProfile, collection name is `company_profiles`.

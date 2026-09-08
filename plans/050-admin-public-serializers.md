# Plan 050: Serialize all admin JSON through the existing public* helpers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to
> the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row
> for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat baaa248..HEAD -- backend/src/routes/admin.js backend/src/services/adminService.js backend/src/services/cargoService.js backend/src/services/driverService.js backend/test/__tests__/admin.routes.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `GET /api/admin/cargo/:id` still `res.json({ cargo })` (raw document);
> `getDriverDetail` still returns raw `profile` / `vehicles` /
> `documents`; `verifyDocument` still `res.json({ document })` raw.
> Do not STOP just because later commits exist.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/019-admin-backend.md (DONE), plans/038-shared-backend-helpers.md (DONE)
- **Category**: tech-debt + tests
- **Planned at**: commit `baaa248`, 2026-09-06

## Why this matters

Every owner/driver endpoint already returns a DTO with a string `id`
(`publicCargo`, `publicProfile`, `publicVehicle`, `publicDocument`,
`publicAdminUser`). Admin **list** cargo uses `publicCargo`
(`listCargoAdmin` maps it). Admin **list** documents uses
`publicDocument`.

Admin **mutations and some reads** skip the DTO and dump the Mongoose
document:

| Route | Today | Client expects |
|-------|--------|----------------|
| `GET /api/admin/cargo/:id` | raw (`_id`, `__v`) | `AdminCargo.id` |
| `PATCH /api/admin/cargo/:id` | raw | same |
| `POST /api/admin/cargo/:id/cancel` | raw | list page uses `c.id` |
| `GET /api/admin/drivers/:userId` | raw profile/vehicles/documents | DriversPage only uses the list today, but the JSON is still a public contract |
| `POST /api/admin/drivers/:userId/verify` | raw profile | |
| `POST /api/admin/documents/:id/verify` | raw document | DocumentsPage types `AdminDocument.id` |

The admin cargo **list** (`GET /api/admin/cargo`) already serializes
with `publicCargo`, which is why `CargoPage.tsx` works (`c.id` on
cancel/edit). `GET /api/admin/cargo/:id` is unused by the current
Vite page (the page never fetches by id — it expands the list row) so
this is not a live UI break. It **is** an inconsistent API: two
shapes for the same resource, `__v` / nested ObjectIds leaking, and
the explicit test comment
`admin.routes.test.js:363` ("admin returns raw Mongoose doc (has `_id`,
not `id`)") documenting the wart.

Plan 038 already rejected merging `publicUser` / `publicAdminUser` /
`publicCargo`. This plan does **not** merge serializers. It **calls**
the existing ones on the remaining admin responses.

## Current state

`backend/src/routes/admin.js` (verbatim — these three cargo handlers
and the verify handlers):

```js
router.get('/cargo/:id', async (req, res) => {
  const cargo = await adminService.getCargoAdmin({ id: req.params.id });
  return res.status(200).json({ cargo });
});

router.patch('/cargo/:id', async (req, res) => {
  const cargo = await adminService.updateCargoAdmin({ id: req.params.id, body: req.body });
  return res.status(200).json({ cargo });
});

router.post('/cargo/:id/cancel', async (req, res) => {
  const cargo = await adminService.cancelCargoAdmin({ id: req.params.id });
  return res.status(200).json({ cargo });
});
```

`listCargoAdmin` already maps:

```js
return { cargo: cargo.map(cargoService.publicCargo), count: cargo.length };
```

`getDriverDetail` (`adminService.js`):

```js
return {
  user: publicAdminUser(user),
  profile,      // raw DriverProfile
  vehicles,     // raw Vehicle[]
  documents,    // raw Document[]
};
```

`verifyDriverProfile` returns the raw profile; the route does
`res.json({ profile })`.

`verifyDocument` returns the raw document; the route does
`res.json({ document })`. `listDocuments` already maps
`driverService.publicDocument`.

`admin.routes.test.js:353-365` currently asserts the wart:

```js
test('GET /api/admin/cargo/:id returns a specific cargo', async () => {
  // ...
  // admin returns raw Mongoose doc (has _id, not id)
  expect(res.body.cargo._id.toString()).toBe(cargoId);
  expect(res.body.cargo.title).toBe('Get By ID');
});
```

`admin/src/pages/CargoPage.tsx` types `AdminCargo { id: string }` and
only consumes the **list**. After this plan, GET-by-id matches the list.
Do **not** edit the Vite app in this slice.

`publicCargo` / `publicProfile` / `publicVehicle` / `publicDocument`
already exist and are the target shape. Do not rewrite them.

Quote style: `admin.js` and `adminService.js` use **single quotes**.
Match the file.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `cd backend && npx jest --runInBand --forceExit test/__tests__/admin.routes.test.js` | exit 0 |
| Full suite | `cd backend && npm test` | exit 0 (or only the known driver.routes 21/7 red at HEAD) |
| Hang workaround | `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` | memory Mongo starts |

## Scope

**In scope**:

- `backend/src/routes/admin.js` — wrap cargo get/patch/cancel with
  `cargoService.publicCargo`; wrap verify profile / verify document
  with `driverService.publicProfile` / `publicDocument`
- `backend/src/services/adminService.js` — `getDriverDetail` maps
  profile/vehicles/documents through the public helpers (user is
  already `publicAdminUser`)
- `backend/test/__tests__/admin.routes.test.js` — flip `_id` assertions
  to `id`; add `__v` absence checks on the previously-raw payloads

**Out of scope**:

- Merging `publicUser` and `publicAdminUser` (038 rejected this).
- Changing `listShipmentsAdmin` (already a custom enriched DTO with
  `id`).
- File-stream routes (`GET .../documents/:id/file`) — they are bytes,
  not JSON.
- `mobile/` / `admin/` source. The JSON `id` field is backward
  compatible for any client that already read `_id` **only if** they
  also accept `id`. Current admin pages use `id` from lists. If a
  hidden client parsed `_id` on GET-by-id, STOP and report rather
  than keeping both `id` and `_id`.
- Plan 035, 049, 051, 052.

## Git workflow

- Branch: `advisor/050-admin-public-serializers`
- Commits: `fix(050): serialize admin cargo/driver/document JSON via public helpers`
  then `chore(050): mark plan DONE in index`
- Do not push.

## Steps

### Step 1: Rewrite the GET-by-id assertion first (TDD)

In `admin.routes.test.js`, change the GET `/api/admin/cargo/:id` test:

```js
expect(res.body.cargo.id).toBe(cargoId);
expect(res.body.cargo._id).toBeUndefined();
expect(res.body.cargo.__v).toBeUndefined();
expect(res.body.cargo.title).toBe('Get By ID');
```

Add the same `id` / no `_id` / no `__v` checks to:

- PATCH `/api/admin/cargo/:id` (already asserts `title`; add `id`)
- POST `/api/admin/cargo/:id/cancel` (already asserts `status`; add `id`)
- GET `/api/admin/drivers/:userId` — `res.body.user.id`,
  `res.body.profile.id`, each vehicle/document `id` (profile may be
  non-null in this test because `registerDriverViaProfile` created it)
- POST `/api/admin/drivers/:userId/verify` — `res.body.profile.id` and
  `res.body.profile.verificationStatus`
- POST `/api/admin/documents/:id/verify` (approve + reject tests) —
  `res.body.document.id === docId`

**Verify (RED)**:
`npx jest --runInBand --forceExit test/__tests__/admin.routes.test.js`
→ GET-by-id fails (`id` undefined, `_id` present).

### Step 2: Wrap cargo handlers

`routes/admin.js` already requires `adminService`. Require
`cargoService` (it is already required inside adminService; requiring
it from the route is fine and matches how `offers.js` serializes):

```js
const cargoService = require('../services/cargoService');
```

Change the three cargo handlers:

```js
return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
```

Leave `GET /api/admin/cargo` as `res.json(result)` — `listCargoAdmin`
already mapped.

**Verify**: GET-by-id / PATCH / cancel tests now see `id`.

### Step 3: Wrap driver detail + verify profile

In `adminService.getDriverDetail`, after loading:

```js
return {
  user: publicAdminUser(user),
  profile: profile ? driverService.publicProfile(profile) : null,
  vehicles: vehicles.map(driverService.publicVehicle),
  documents: documents.map(driverService.publicDocument),
};
```

`adminService.js` already `require`s `driverService`.

In `routes/admin.js` verify-profile handler:

```js
const driverService = require('../services/driverService');
// ...
return res.status(200).json({ profile: driverService.publicProfile(profile) });
```

Alternatively serialize inside `verifyDriverProfile` before return so
the route stays `res.json({ profile })`. Either is fine; pick **one**
layer (prefer the route, matching cargo) so services still return
mongoose docs for other callers. `verifyDriverProfile` has no other
callers besides this route (grep before choosing). If only the route
calls it, serializing in the route is enough.

**Verify**: GET driver detail and verify-profile tests pass with `id`.

### Step 4: Wrap document verify

Same pattern:

```js
return res.status(200).json({ document: driverService.publicDocument(document) });
```

`listDocuments` is already mapped. Do not double-map.

**Verify**: document approve/reject tests pass with
`res.body.document.id`.

### Step 5: Grep for leftover raw admin JSON

```
rg -n "json\(\{ cargo \}\)|json\(\{ profile \}\)|json\(\{ document \}\)" backend/src/routes/admin.js
```

Expected: no matches (they all go through a public* helper).
`json({ overview })` and `json(result)` and the file-stream path stay.

**Verify**: `cd backend && npm test` as in Commands.

## Test plan

- Characterization flip described in Step 1. Pattern: the existing
  GET-by-id test in `admin.routes.test.js`.
- Do not add a new file.
- List endpoints already assert arrays; leave those assertions.

## Done criteria

- [ ] `GET/PATCH /api/admin/cargo/:id` and
      `POST /api/admin/cargo/:id/cancel` bodies use `cargo.id` (string)
      and do not include `_id` or `__v`
- [ ] `GET /api/admin/drivers/:userId` profile/vehicles/documents use
      `id`
- [ ] `POST /api/admin/drivers/:userId/verify` profile uses `id`
- [ ] `POST /api/admin/documents/:id/verify` document uses `id`
- [ ] `GET /api/admin/cargo` (list) still uses `publicCargo` (no double
      wrap that would stringify twice — `id` stays a 24-char hex)
- [ ] `admin.routes.test.js` no longer expects `_id` on JSON cargo
- [ ] No `mobile/` / `admin/` edits
- [ ] `plans/README.md` row for 050 is DONE

## STOP conditions

- `publicCargo` / `publicProfile` signatures changed since this plan
  (they currently take a mongoose doc and return a plain object).
- An in-repo client (grep `admin/src` and `mobile/src`) reads
  `cargo._id` from an admin GET-by-id. None did at plan time. If you
  find one, STOP and report rather than silently dropping `_id`.
- Temptation to also rewrite `listShipmentsAdmin` field names — STOP.
  That DTO is already `id`-based.
- Merging publicUser/publicAdminUser — STOP (038 rejected).

## Maintenance notes

- Future admin routes must serialize through a `public*` helper. If a
  new field is needed on the admin cargo page, add it to `publicCargo`
  (shared with owner/matching) or add `publicAdminCargo` that extends
  it — do not dump the document again.
- Reviewer: confirm GET list and GET-by-id now share one shape, and
  that `id` is still `cargo._id.toString()` (24 hex), not a virtual.

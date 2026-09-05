# Plan 029: Expand in-app notifications and enforce SystemSettings

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 39fe0a7..HEAD -- backend/src/models/Notification.js backend/src/services/notificationService.js backend/src/services/matchingService.js backend/src/services/cargoService.js backend/src/services/adminService.js backend/src/services/settingsService.js backend/src/app.js backend/src/middleware backend/test/__tests__/notifications.routes.test.js backend/test/__tests__/cargo.routes.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Soft dependency: plan 028 (`rejectPendingOffersForCargo`). If that helper
> is missing, implement the pending-offer reject **inside this plan's
> matchingService edit** using the same `Offer.updateMany` shape 028
> specified — do not STOP solely because 028 is still TODO. If 028 already
> landed, reuse the helper; do not duplicate the updateMany.
> Planned-at SHA is a hint, not a hard STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/018-shipment-lifecycle-notifications.md (DONE), plans/019-admin-backend-api.md (DONE). Soft: 028 (reuse `rejectPendingOffersForCargo` if present).
- **Category**: direction
- **Planned at**: commit `39fe0a7`, 2026-09-05

## Why this matters

V6 Phase 1 notification + admin-settings bullets are only half-wired:

- **Receiving system notifications / operational alerts** (§1)
- **Receiving cargo milestone alerts** (§2)
- **Lifecycle-triggered alerts** (§6) — in-app records exist, but only for
  `shipment_assigned` / `shipment_status`
- **System settings configuration** (§5) — admin can PUT
  `maxActiveCargoPerOwner` and `maintenanceMode`, but nothing reads them
  (`plans/019-admin-backend-api.md` explicitly deferred enforcement)

Today a driver bidding on open cargo produces **zero** owner notification.
Losing bidders are not told the job went elsewhere. An owner can publish
unlimited drafts even when the admin cap is 3. `maintenanceMode: true`
does not stop writes.

Push / SMS stay Phase 2 (pluggable `deliver()` already logs only). This
plan stays in-app + HTTP 503.

## Current state

`backend/src/models/Notification.js` — two types, **both FKs required**:

```js
const TYPES = ['shipment_assigned', 'shipment_status'];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TYPES, required: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true },
    cargoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cargo', required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);
```

Offer-lifecycle rows have no shipment yet. `shipmentId` must become
optional (`default: null`). `cargoId` stays required. Never add a field
named `id`.

`backend/src/services/notificationService.js`:

- `deliver(notification)` — pluggable in-app channel; Phase 2 swaps the
  body. Leave it.
- `notifyShipment({ userId, type, shipment, cargo })` — always sets
  `shipmentId: shipment._id`, never throws.
- `publicNotification` does `notification.shipmentId.toString()` —
  **will throw** once `shipmentId` can be null. Must null-check.
- Exports: `{ notifyShipment, listForUser, markRead, publicNotification }`.

`backend/src/services/matchingService.js`:

- `createOffer` (95–128) — creates the Offer, returns it, no notify.
- `acceptOffer` (181–225) — rejects other pending offers via
  `Offer.updateMany`, then `shipmentService.createForAward` (which
  notifies `shipment_assigned`). Losing drivers get nothing.
- `rejectPendingOffersForCargo` — **may or may not exist** (028). If it
  exists it is notification-free by design so this plan can wrap it.

`backend/src/services/cargoService.js` `createCargo` (54–60) — no cap:

```js
async function createCargo({ ownerUserId, body }) {
  const fields = pickEditableFields(body);
  if (!fields.origin || !fields.destination) fail('validation_error');
  assertTiming(fields.pickupAt, fields.deliverBy);
  const cargo = await Cargo.create({ ...fields, ownerUserId, status: 'draft' });
  return cargo;
}
```

`backend/src/app.js` — no maintenance middleware. Routers: auth, cargo,
driver, matching, offers, shipments, notifications, admin, then `/api` 404.

`backend/src/middleware/auth.js` exports `{ auth }`.
`backend/src/middleware/adminGuard.js` exports `{ requireAdmin }`.

`backend/src/services/settingsService.js` `getSettings()` upserts the
`key: 'global'` singleton (safe to call per request).

`backend/test/__tests__/notifications.routes.test.js` asserts award
notifications have a `shipmentId`. Keep that for `shipment_assigned`.
New offer notifications will have `shipmentId: null`.

Quote style: `notificationService.js` / `matchingService.js` /
`shipmentService.js` use **double quotes**. `cargoService.js` /
`adminService.js` / `app.js` use **single quotes**. Match the file.

## Product rules (do not invent others)

### Notification types after this plan

```
shipment_assigned   already exists — owner + driver on award
shipment_status     already exists — the other party on driver status change
offer_received      NEW — cargo owner when a driver creates a pending offer
offer_rejected      NEW — driver when their pending offer is flipped to rejected
                    (losing bid on award, OR cargo cancelled while pending)
```

Do **not** add `offer_accepted` — the winner already gets
`shipment_assigned`. Do **not** add `offer_withdrawn` (the driver did it).
Do **not** notify the owner that they cancelled their own cargo.

### Settings enforcement

1. `maxActiveCargoPerOwner` (default 20, min 0):
   - Count `Cargo` with `{ ownerUserId, status: { $in: ['draft','open','matched'] } }`.
   - If `count >= cap` → `fail('cargo_limit')` mapped to **409**
     `{ error: 'cargo_limit' }`.
   - Cap `0` means **no new cargo** (strict). Do not treat 0 as unlimited.
   - Applies to `createCargo` only, not publish/update/admin-create.
   - Admin `updateCargoAdmin` / owner PATCH of an existing draft do not
     increment the count.

2. `maintenanceMode` (default false):
   - When true, non-admin `POST`/`PATCH`/`PUT`/`DELETE` under `/api/cargo`,
     `/api/driver`, `/api/matching`, `/api/offers`, `/api/shipments`,
     `/api/notifications` return **503** `{ error: 'maintenance' }`.
   - Allowed during maintenance: `GET`/`HEAD`/`OPTIONS` on those routers,
     all `/api/auth/*`, `GET /api/settings` (027), all `/api/admin/*`,
     `GET /health`.
   - Admin users (role includes `admin`) bypass the 503 so they can still
     operate. They still need a valid Bearer token; the check runs **after**
     `auth`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 39fe0a7..HEAD -- backend/src/models/Notification.js backend/src/services/notificationService.js backend/src/services/matchingService.js backend/src/services/cargoService.js backend/src/app.js` | empty or later unrelated commits |
| Syntax | `cd backend && node --check src/models/Notification.js && node --check src/services/notificationService.js && node --check src/middleware/maintenance.js && node --check src/services/matchingService.js && node --check src/services/cargoService.js && node --check src/app.js` | exit 0 |
| App boots | `cd backend && node -e "const {createApp}=require('./src/app'); console.log(typeof createApp().listen==='function'?'ok':'fail')"` | `ok` |
| Tests | `cd backend && npm test -- --testPathPattern='notifications.routes|cargo.routes|offers.routes|admin.routes'` | all pass |
| Full suite | `cd backend && npm test` | all pass |

Zero new packages.

## Suggested executor toolkit

- Skills: `amintajeran-project`, `node-backend-patterns`.
- Exemplars: `notificationService.notifyShipment` (never-throw + deliver),
  `cargo.js` `sendCargoError` map, `app.js` mount order.

## Scope

**In scope**:

- `backend/src/models/Notification.js` (enum + `shipmentId` optional)
- `backend/src/services/notificationService.js` (`notifyEvent` generalizer
  or a sibling `notifyOffer`; null-safe serializer)
- `backend/src/middleware/maintenance.js` (new)
- `backend/src/app.js` (wire maintenance after `auth` on mutating routers —
  see Step 4; do not globally 503 GET)
- `backend/src/services/matchingService.js` (notify on createOffer;
  notify rejected drivers on acceptOffer; notify rejected drivers from
  `rejectPendingOffersForCargo` if present, else add that helper here)
- `backend/src/services/cargoService.js` (cargo cap on create; cancel
  already calls 028 helper — if 028 missing, call the helper you add)
- `backend/src/routes/cargo.js` (map `cargo_limit: 409`)
- `backend/src/routes/offers.js` / `driver.js` / `shipments.js` /
  `notifications.js` / `matching.js` — only if needed to attach
  maintenance middleware (prefer attaching once in `app.js` via a wrapper;
  see Step 4)
- `backend/test/__tests__/notifications.routes.test.js`
- `backend/test/__tests__/cargo.routes.test.js` (cap + maintenance)
- `plans/README.md`

**Out of scope**:

- Push provider, SMS, email, admin broadcast (Phase 2 §5).
- New Notification HTTP routes (list + mark-read stay).
- Changing shipment status notification copy.
- `mobile/` / `admin/` UI for the new types (clients already render
  `title`/`body`).
- Enforcing `maintenanceMode` by rejecting GET (reads stay up).
- Changing `maxActiveCargoPerOwner` default.

## Git workflow

- Stay on current branch. Do not push.
- Commits: `feat(029): offer notifications and settings enforcement`
  then `chore(029): mark plan DONE in index`.

## Steps

### Step 1: Relax Notification schema

In `backend/src/models/Notification.js`:

```js
const TYPES = [
  'shipment_assigned',
  'shipment_status',
  'offer_received',
  'offer_rejected',
];
```

Change `shipmentId` to:

```js
shipmentId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Shipment',
  default: null,
},
```

`cargoId` stays `required: true`. Keep existing indexes. Keep
`Notification.TYPES = TYPES`.

**Verify**: `cd backend && node --check src/models/Notification.js`
`cd backend && node -e "const N=require('./src/models/Notification'); console.log(N.TYPES.join(','))"`
→ `shipment_assigned,shipment_status,offer_received,offer_rejected`.

### Step 2: Generalize notification writes

In `notificationService.js` (double quotes):

1. Make `publicNotification` null-safe:

```js
shipmentId: notification.shipmentId ? notification.shipmentId.toString() : null,
cargoId: notification.cargoId.toString(),
```

2. Add `notifyEvent({ userId, type, cargo, shipment, title, body })` that
   never throws (same try/catch as `notifyShipment`). Creates a
   Notification with `shipmentId: shipment ? shipment._id : null`,
   `cargoId: cargo._id`, given title/body, then `deliver()`. Return the
   doc or `null` on failure.

3. Keep `notifyShipment` as a thin wrapper so 018 call sites stay:

```js
async function notifyShipment({ userId, type, shipment, cargo }) {
  const cargoTitle = (cargo && cargo.title) || "cargo";
  const body =
    type === "shipment_assigned"
      ? `Cargo "${cargoTitle}" was matched and a shipment was created.`
      : `Cargo "${cargoTitle}" status is now ${shipment.status}.`;
  return notifyEvent({
    userId,
    type,
    cargo,
    shipment,
    title: `Shipment ${shipment.status}`,
    body,
  });
}
```

4. Add `notifyOfferReceived({ ownerUserId, cargo, offer })` and
   `notifyOfferRejected({ driverUserId, cargo, offer })` with fixed copy:

   - received title: `New offer`, body:
     `A driver offered ${offer.priceRial} rial on "${cargo.title || 'cargo'}".`
   - rejected title: `Offer rejected`, body:
     `Your offer on "${cargo.title || 'cargo'}" was rejected.`

   Both call `notifyEvent` with `shipment: null` and the matching type.

5. Export the new functions.

**Verify**: `cd backend && node --check src/services/notificationService.js`
`cd backend && node -e "const m=require('./src/services/notificationService'); console.log(Object.keys(m).sort().join(','))"`
→ includes `notifyEvent,notifyOfferReceived,notifyOfferRejected,notifyShipment,listForUser,markRead,publicNotification`.

### Step 3: Fire notifications from matching (and cancel)

`matchingService.js` (double quotes):

1. `const notificationService = require("./notificationService");`

2. At the end of `createOffer`, after `Offer.create`:

```js
const cargoForNote = cargo; // already loaded
await notificationService.notifyOfferReceived({
  ownerUserId: cargo.ownerUserId,
  cargo,
  offer,
});
return offer;
```

   `notifyOfferReceived` must not throw; createOffer still returns the offer
   if notify fails.

3. In `acceptOffer`, after the `Offer.updateMany` that rejects losers and
   **before** `createForAward`, load the rejected offers and notify each
   driver:

```js
const losers = await Offer.find({
  cargoId: offer.cargoId,
  _id: { $ne: offer._id },
  status: "rejected",
});
for (const loser of losers) {
  await notificationService.notifyOfferRejected({
    driverUserId: loser.driverUserId,
    cargo,
    offer: loser,
  });
}
```

   The winner is **not** in `losers` (`_id $ne`). They still get
   `shipment_assigned` from `createForAward`.

   Narrow the find if you want: `{ status: "rejected", updatedAt: { $gte: a few seconds ago } }`
   is unnecessary in tests (setup.js wipes collections). Keep the simple
   find. Worst case on a cargo that had older rejected bids: those drivers
   get a duplicate `offer_rejected`. Acceptable for Phase 1. Do **not**
   add a processed flag.

4. If `rejectPendingOffersForCargo` exists (028), change it to:

```js
async function rejectPendingOffersForCargo(cargoId, cargoDoc) {
  const pending = await Offer.find({ cargoId, status: "pending" });
  if (pending.length === 0) return;
  await Offer.updateMany(
    { cargoId, status: "pending" },
    { status: "rejected" }
  );
  const cargo = cargoDoc || (await Cargo.findById(cargoId));
  for (const offer of pending) {
    await notificationService.notifyOfferRejected({
      driverUserId: offer.driverUserId,
      cargo,
      offer,
    });
  }
}
```

   If 028 has not landed, add this function and export it, then call it
   from `cargoService.cancelCargo` (when status was `open`) and
   `adminService.cancelCargoAdmin` (always, after save) exactly as 028
   Step 3 specified.

**Verify**: `cd backend && node --check src/services/matchingService.js`
Cycle smoke:
`cd backend && node -e "require('./src/services/matchingService'); require('./src/services/notificationService'); require('./src/services/cargoService'); console.log('ok')"`
→ `ok`.

### Step 4: Maintenance middleware

Create `backend/src/middleware/maintenance.js` (single quotes, match
`auth.js`):

```js
const settingsService = require('../services/settingsService');

async function requireNotMaintenance(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (req.user && Array.isArray(req.user.roles) && req.user.roles.includes('admin')) {
    return next();
  }
  try {
    const settings = await settingsService.getSettings();
    if (settings.maintenanceMode) {
      return res.status(503).json({ error: 'maintenance' });
    }
  } catch (err) {
    return next(err);
  }
  return next();
}

module.exports = { requireNotMaintenance };
```

Wire it **per mutating router after `auth`**, not globally (global would
503 OTP). Each of these files already does `router.use(auth)` or
`router.use(auth, requireRole)`:

| File | Current first `router.use` | Change to |
|------|----------------------------|-----------|
| `routes/cargo.js` | `router.use(auth, requireCargoOwner)` | `router.use(auth, requireNotMaintenance, requireCargoOwner)` |
| `routes/driver.js` | `router.use(auth)` | `router.use(auth, requireNotMaintenance)` |
| `routes/matching.js` | `router.use(auth, requireDriver)` | `router.use(auth, requireNotMaintenance, requireDriver)` |
| `routes/offers.js` | `router.use(auth)` | `router.use(auth, requireNotMaintenance)` |
| `routes/shipments.js` | `router.use(auth)` | `router.use(auth, requireNotMaintenance)` |
| `routes/notifications.js` | `router.use(auth)` | `router.use(auth, requireNotMaintenance)` |

Do **not** add it to `routes/auth.js` or `routes/admin.js` or
`routes/settings.js` (027). Admin mutating routes stay live.

`requireNotMaintenance` must run **after** `auth` so `req.user` exists for
the admin bypass. On cargo.js the owner gate stays after maintenance — a
non-owner still 403s when not in maintenance; in maintenance they 503
first. That is fine (they cannot write anyway).

**Verify**: `cd backend && node --check src/middleware/maintenance.js`
`grep -n "requireNotMaintenance" backend/src/routes/*.js` → hits on the
six files above, **not** on `auth.js` / `admin.js`.

### Step 5: Enforce `maxActiveCargoPerOwner` on create

In `cargoService.createCargo`, after timing assert, before `Cargo.create`:

```js
const settingsService = require('./settingsService'); // top of file

const settings = await settingsService.getSettings();
const cap = settings.maxActiveCargoPerOwner;
const activeCount = await Cargo.countDocuments({
  ownerUserId,
  status: { $in: ['draft', 'open', 'matched'] },
});
if (activeCount >= cap) fail('cargo_limit');
```

In `routes/cargo.js` `sendCargoError` map add `cargo_limit: 409`.

Do not enforce the cap on admin cargo create (there is no admin create).
Do not enforce on publish — a draft already counted.

**Verify**: `grep -n "cargo_limit" backend/src/services/cargoService.js backend/src/routes/cargo.js` → both files.

### Step 6: Tests

**`notifications.routes.test.js`** — add:

1. After a driver `POST /api/offers` (do **not** accept), owner's
   `GET /api/notifications` includes one `type === 'offer_received'` with
   `shipmentId === null` and `cargoId` equal to the cargo.
2. Driver does **not** get `offer_received` for their own bid.
3. Two drivers bid; owner accepts one; the losing driver's notifications
   include `offer_rejected`; the winner's include `shipment_assigned` and
   do **not** include `offer_rejected`.
4. Existing award tests still pass (`shipmentId` present on
   `shipment_assigned`).

**`cargo.routes.test.js`** — add:

5. PUT admin settings `maxActiveCargoPerOwner: 1` via the admin API (mint
   an admin the way `admin.routes.test.js` does — `ADMIN_BOOTSTRAP_PHONES`
   or direct `User.updateOne` `$addToSet roles: 'admin'` then OTP). Create
   one cargo (201), second create is 409 `{ error: 'cargo_limit' }`. Then
   cancel the first (draft cancel does not need offers) and a third create
   succeeds. Keep this in cargo.routes **or** a new
   `backend/test/__tests__/settings.enforcement.test.js` if pulling an
   admin token into cargo.routes is messy. One new file is allowed.

6. Maintenance: set `maintenanceMode: true` via admin PUT. Owner
   `POST /api/cargo` → 503 `{ error: 'maintenance' }`. Owner
   `GET /api/cargo` → 200. `POST /api/auth/request-otp` → 200. Admin
   `PATCH /api/admin/users/:id` still 200. Then turn maintenance off and
   owner POST cargo succeeds.

Do not use a raw `SystemSettings` update in tests that also need the admin
API to stay honest — either path is fine as long as `getSettings()` sees
the value (it reads the singleton). Direct `SystemSettings.updateOne` is
simpler and acceptable.

**Verify**: `cd backend && npm test` with
`MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod` if needed. Do not switch
to ReplSet.

### Step 7: Mark DONE

Update `plans/README.md` 029 row. Commit.

## Test plan

- Cases in Step 6. Pattern: `notifications.routes.test.js` (award helper)
  and `admin.routes.test.js` (settings PUT).
- Regression: existing shipment_assigned / mark-read / unreadCount tests.
- Verification: `cd backend && npm test` → all pass.

## Done criteria

- [ ] `Notification.TYPES` is `shipment_assigned,shipment_status,offer_received,offer_rejected`
- [ ] `shipmentId` is optional; `publicNotification` returns `null` not a throw
- [ ] Owner is notified on `POST /api/offers` (`offer_received`)
- [ ] Losing / cancelled-pending drivers are notified (`offer_rejected`)
- [ ] `createCargo` returns 409 `cargo_limit` when at cap
- [ ] Non-admin writes return 503 `maintenance` when `maintenanceMode` is true; GET and `/api/auth` do not
- [ ] `grep requireNotMaintenance backend/src/routes/auth.js backend/src/routes/admin.js` → no matches
- [ ] `cd backend && npm test` exits 0
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` 029 row updated

## STOP conditions

- Current-state excerpts no longer match.
- A verification command fails twice.
- You are about to integrate FCM / Kavenegar / nodemailer.
- You are about to 503 GET /health or OTP endpoints.
- Circular require explosion; report instead of introducing an events bus.
- You want to add `offer_accepted` / `offer_withdrawn` types — out of scope.

## Maintenance notes

- Plan 027's `GET /api/settings` must stay unauthenticated and
  maintenance-exempt so the app can show "we'll be back" + support phone.
- Duplicate `offer_rejected` on historically-rejected bids for the same
  cargo is a known Phase 1 wart; fix with an `Offer.notifiedRejectedAt`
  in a later slice if it shows up in UX.
- Reviewer: confirm `notifyOffer*` failures cannot fail `createOffer` /
  `acceptOffer` (same swallow as `notifyShipment`).
- Mobile notification screens already display `title`/`body`; new types
  need no client change to be visible.

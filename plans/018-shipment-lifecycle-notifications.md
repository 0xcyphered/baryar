# Plan 018: Add shipment lifecycle + events + in-app notifications API

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` to `DONE (executed by pipeline)` and commit per the
> git policy below.
>
> **Drift check (run first)**:
> `git diff --stat ecb8159..HEAD -- backend/src`
> plus `git status --short backend/src`. If any in-scope file changed since
> `ecb8159` or has uncommitted edits, re-read the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.
>
> **Operator overrides (replace conflicting skill/plan text)**: stay on the
> current branch (no branch creation, no checkout, no worktree, no push).
> Commits ARE allowed and expected. TESTS DEFERRED: never run Jest/npm test,
> never start the API server. Allowed verification: `node --check`, `npm ls`,
> grep/search checks, and the pure-node verify script this plan ships
> (`backend/tmp-verify-018.js` — a temp file, never `git add` it, delete it
> before the final commit). If a gate is a test run, note "deferred to plan
> 026".

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/015-cargo-draft-crud.md, plans/016-driver-onboarding-api.md, plans/017-matching-offers-api.md (all DONE)
- **Category**: feature (backend API)
- **Planned at**: commit `ecb8159`, 2026-09-03

## Why this matters

Phase 1 booking currently ends at the award: `POST /api/offers/:id/accept`
(017) flips the offer to `accepted` and the cargo to `matched`, but nothing
tracks the physical trip afterwards. This plan adds the delivery side: the
award creates a `Shipment`, the driver walks it through a fixed forward
status path logging `ShipmentEvent`s (including customs stops), the owner can
track status/history, and both sides receive in-app `Notification` records on
lifecycle transitions (no push/SMS provider — that stays Phase 2). It
implements these V6 bullets from `resources/features-roadmap.md`:

- Line 89: "Displaying current shipment status: Displays the active
  shipment's status on the user dashboard."
- Line 91: "Event log creation: Allows users to log key shipment events
  (e.g., 'Cargo Loaded', 'Driver departed')."
- Line 93: "Displaying status history logs: Shows a timestamped table of all
  past status changes for a shipment."
- Line 95: "Status transition notification: Automatically dispatches alerts
  when a shipment shifts to a new state."
- Line 97: "Recording key events timestamp: Stores exact time and date of
  major events like customs stop."
- Line 99: "Owner cargo tracking portal: Provides a dedicated lookup feature
  for cargo owners to check active loads."
- §6 Line 112: "Lifecycle-triggered alerts: Sends automated notifications
  based on logistics status changes." (in-app records only; push provider
  integration is §7 Phase 2 and explicitly out of scope)

## Current state

- `backend/src/app.js:42-54` — mounts routes and a final `/api` 404
  catch-all:
  ```js
  app.use('/api/auth', authRoutes);
  app.use('/api/cargo', cargoRoutes);
  app.use('/api/driver', driverRoutes);
  app.use('/api/matching', matchingRoutes);
  app.use('/api/offers', offerRoutes);
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  ```
  New routers MUST be mounted above the `/api` catch-all. The planned file
  (with the two new mounts) greps `app.use('/api` → exactly `8`.
- `backend/src/middleware/auth.js` — `auth(req,res,next)` verifies
  `Authorization: Bearer <JWT>` (`payload.sub` = user id), loads the user,
  rejects `status !== 'active'`, sets `req.user`. Exported as
  `module.exports = { auth }`.
- `backend/src/routes/offers.js` — the router style to copy (CommonJS,
  double quotes, per-route role middleware, service error-code → HTTP map).
  Its `requireDriver` (lines 8–13) and `requireCargoOwner` (lines 15–20):
  ```js
  function requireDriver(req, res, next) {
    if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes("driver")) {
      return res.status(403).json({ error: "forbidden" });
    }
    return next();
  }
  ```
  and `sendOfferError(res, err)` (lines 22–40): maps service error `code`
  strings to HTTP statuses, `ValidationError` → 400, anything else → 500
  `server_error`. Match this pattern.
- `backend/src/services/matchingService.js:178-212` — the award flow 018
  hooks into. Live excerpt of `acceptOffer` (final section):
  ```js
  async function acceptOffer({ userId, offerId }) {
    assertId(offerId, "invalid_offer_id");
    const offer = await Offer.findById(offerId);
    if (!offer) fail("not_found");
    const cargo = await Cargo.findOne({ _id: offer.cargoId, ownerUserId: userId });
    if (!cargo) fail("not_found");
    const cargoUpdate = await Cargo.updateOne(
      { _id: cargo._id, status: "open" },
      { status: "matched" }
    );
    if (cargoUpdate.matchedCount === 0) fail("invalid_status");
    const offerUpdate = await Offer.updateOne(
      { _id: offer._id, status: "pending" },
      { status: "accepted" }
    );
    if (offerUpdate.matchedCount === 0) { /* revert cargo, fail */ }
    await Offer.updateMany(
      { cargoId: offer.cargoId, _id: { $ne: offer._id }, status: "pending" },
      { status: "rejected" }
    );
    const freshOffer = await Offer.findById(offer._id);
    const freshCargo = await Cargo.findById(cargo._id);
    return { offer: freshOffer, cargo: freshCargo };
  }
  ```
  018 appends exactly one call — `await
  shipmentService.createForAward({ cargo, offer });` — after the
  `Offer.updateMany` and before the two fresh fetches. Nothing else in
  `acceptOffer` changes.
- `backend/src/models/Shipment.js` (live, unchanged by 018):
  ```js
  const STATUSES = [
    'assigned', 'loading', 'in_transit', 'at_customs',
    'delivered', 'completed', 'cancelled',
  ];
  // fields: cargoId (ref Cargo, required), offerId (ref Offer, required),
  // ownerUserId (ref User, required), driverUserId (ref User, required),
  // vehicleId (ref Vehicle, required), status (default 'assigned'),
  // pickupAt (Date, default null), deliveredAt (Date, default null)
  shipmentSchema.index({ cargoId: 1 }, { unique: true });
  shipmentSchema.index({ driverUserId: 1, status: 1 });
  shipmentSchema.index({ ownerUserId: 1, status: 1 });
  shipmentSchema.statics.STATUSES = STATUSES;
  ```
  The unique `{ cargoId }` index is the award-idempotency anchor: awarding
  the same cargo twice (retry after partial failure) throws code 11000
  instead of creating a second shipment.
- `backend/src/models/ShipmentEvent.js` (live, unchanged by 018):
  ```js
  const EVENT_TYPES = [
    'status_change', 'cargo_loaded', 'driver_departed',
    'checkpoint', 'customs_stop', 'note',
  ];
  // fields: shipmentId (ref, required), eventType (required),
  // fromStatus (default null), toStatus (default null),
  // note (String, default ''), location (geoPointSchema, default null),
  // occurredAt (Date, required, default Date.now)
  shipmentEventSchema.index({ shipmentId: 1, occurredAt: 1 });
  shipmentEventSchema.statics.EVENT_TYPES = EVENT_TYPES;
  ```
  `location` uses `geoPointSchema` from `backend/src/models/geoPoint.js`:
  `{ type: 'Point', coordinates: [lng, lat] }` with a validator requiring a
  2-element finite-number array — a malformed body fails Mongoose
  validation, which the route maps to 400.
- `backend/src/models/Cargo.js:4` — statuses are
  `['draft', 'open', 'matched', 'cancelled', 'completed']` (exposed as
  `Cargo.STATUSES`). 018 transitions `matched → completed` when a shipment
  completes; no other cargo transitions belong to 018.
- `backend/src/services/otpService.js:19-28` — the pluggable-channel
  precedent `notificationService.deliver` must copy:
  ```js
  // Pluggable OTP channel. Phase 2 (SMS gateway, V6 §9) replaces this function
  // body only — the OtpChallenge store and HTTP contract stay as they are.
  function sendOtp({ phone, code }) {
    if (process.env.NODE_ENV === 'production') {
      console.log(`otp sent ${JSON.stringify({ phone })}`);
      return;
    }
    console.log(`otp sent ${JSON.stringify({ phone, code })}`);
  }
  ```
- `backend/src/services/cargoService.js:10-18` — the service style to copy:
  `fail(code)` helper and `assertObjectId` regex `/^[0-9a-fA-F]{24}$/`.
  `MAX_LIST = 100` everywhere.
- No `Notification` collection exists anywhere in `backend/src` today
  (011/012 deliberately parked it — see plans/README.md "Phase 2 collections
  in 011" rejection). 018 creates it.
- **Recon fact (state production)**: `backend/src/services/otpService.js:113`
  upserts every OTP-verified user with `roles: ['cargo_owner']`, and
  `POST /api/driver/profile` (016) grants the `driver` role — so a user CAN
  hold both roles at once. Shipment listing must therefore be participant
  based (`$or: owner/driver`), not role based: a user may legitimately be
  the owner of one shipment and the driver of another.

**Repo conventions**: backend is CommonJS, 2-space indent, double quotes in
the newer files (`matchingService.js`, `driver.js`), single quotes in older
ones (`cargo.js`, `app.js`) — the routers being copied from (`offers.js`,
`matching.js`) use double quotes; the new model file follows
`backend/src/models/Offer.js` style. `async/await` with try/catch in routes
and `fail(code)` errors in services. Exemplar files:
`backend/src/routes/offers.js`, `backend/src/services/matchingService.js`.
No new npm dependencies (express/mongoose already installed in
`backend/node_modules`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax check each new/modified file | `node --check backend/src/services/shipmentService.js` (repeat for `notificationService.js`, `routes/shipments.js`, `routes/notifications.js`, `models/Notification.js`, `services/matchingService.js`, `app.js`) | exit 0, no output |
| App + schema boot check (no DB needed) | `cd backend && node tmp-verify-018.js` | prints `ok` |
| Deps present | `cd backend && npm ls express mongoose --depth=0` | both listed, no `UNMET` |
| Shipments route count | `grep -c "router\.\(get\|post\|patch\|delete\)" backend/src/routes/shipments.js` | `5` |
| Notifications route count | `grep -c "router\.\(get\|patch\)" backend/src/routes/notifications.js` | `2` |
| Mount order | `grep -n "app.use('/api/shipments'\|app.use('/api/notifications'" backend/src/app.js` | 2 lines, both line numbers < the `app.use('/api',` catch-all line |
| Award hook present | `grep -c "await shipmentService.createForAward" backend/src/services/matchingService.js` | `1` |
| Readiness count | `grep -c "app.use('/api" backend/src/app.js` | `8` |

Notes on the counts, derived mechanically from the planned file text: the
shipments router contains 5 route lines (GET /, GET /:id, GET /:id/events,
POST /:id/status, POST /:id/events); its `requireDriver` and
`module.exports = router;` lines contain no `router.<verb>` token. The
notifications router contains 2 route lines (GET /, PATCH /:id/read).
`app.use('/api` appears 8 times in the planned app.js: `/health`-adjacent
 mounts are 6 role routers (auth, cargo, driver, matching, offers,
shipments, notifications = 7) plus the `/api` catch-all = 8. If your written
file's `grep -c` differs from the number derived here, re-simulate the grep
against your file text; do not adjust the number to match your file.

(TESTS DEFERRED to plan 026 — Jest suites for these endpoints are written
there. Do not create test files in 018. Do not run `npm test`.)

## Scope

**In scope** (the only files you should create or modify):
- `backend/src/models/Notification.js` (create)
- `backend/src/services/notificationService.js` (create)
- `backend/src/services/shipmentService.js` (create)
- `backend/src/routes/shipments.js` (create)
- `backend/src/routes/notifications.js` (create)
- `backend/src/app.js` (add two requires + two mounts)
- `backend/src/services/matchingService.js` (add the award hook — one
  require line, one doc-comment block above `acceptOffer`, one call line
  inside `acceptOffer`; change nothing else)
- `backend/tmp-verify-018.js` (create, temp; NEVER `git add` it — delete
  after the done criteria pass)
- `plans/README.md` (status row + dependency note, per git policy)

**Out of scope** (do NOT touch, even though they look related):
- `backend/src/models/Shipment.js` / `ShipmentEvent.js` / `Cargo.js` /
  `Offer.js` — no schema or index changes. The unique `{ cargoId }` index
  and existing enums are sufficient.
- `backend/src/routes/offers.js` — award flow changes live in
  `matchingService.js` only; the HTTP contract of `POST /api/offers/:id/accept`
  is unchanged (still `{ offer, cargo }`).
- `backend/src/routes/cargo.js` / `cargoService.js` — no auto-cancel of
  shipments when cargo is edited; cargo is `matched` by now so 015's
  draft-only PATCH/DELETE already blocks it.
- Push provider integration, SMS, Telegram/WhatsApp, GPS streaming,
  payments, ratings — Phase 2 (V6 §6 push engine, §9 gateways).
- Admin endpoints (block users, verify documents, trips overview) — plan
  019. In particular there is NO shipment-cancel endpoint in 018.
- `mobile/`, `webapp/`, `admin/` — backend only.

## Git workflow

- Stay on the current branch (`main`). No branch creation, no push.
- Commit style (from `git log`): conventional commits with plan number,
  e.g. `feat(018): add shipment lifecycle + notifications API`.
- Commit 1: the six new backend files + the `app.js` and
  `matchingService.js` edits — `feat(018): add shipment lifecycle + notifications API`.
- Commit 2: `plans/README.md` row flip — `chore(018): mark plan DONE in index`.
- Stage exactly the in-scope files; never commit `.env`, `.pipeline.lock`,
  or `backend/tmp-verify-018.js`.

## Steps

### Step 1: Create `backend/src/models/Notification.js`

New collection (011 parked it deliberately; 018 owns it now). Copy the
schema style of `backend/src/models/Offer.js` (single quotes, `timestamps:
true`, statics constant, indexes):

```js
const mongoose = require('mongoose');

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

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.statics.TYPES = TYPES;

module.exports = mongoose.model('Notification', notificationSchema);
```

`readAt` default null = unread; marking read sets it to a Date. No `type`
beyond the two lifecycle kinds — offer-related notifications are not in
this plan's scope.

**Verify**: `node --check backend/src/models/Notification.js` → exit 0.

### Step 2: Create `backend/src/services/notificationService.js`

Double-quotes style (matches `matchingService.js`). Contents:

```js
const Notification = require("../models/Notification");

const MAX_LIST = 100;

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertId(id, code) {
  if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) fail(code);
}
```

`deliver(notification)` — pluggable in-app channel, mirroring `sendOtp`:
in production log `JSON.stringify({ userId: notification.userId.toString(),
type: notification.type })`; in dev also include `title`. Comment it as the
Phase 2 swap point (push provider / SMS) exactly like the `sendOtp`
comment.

`async function notifyShipment({ userId, type, shipment, cargo })` — NEVER
throws: wrap the whole body in try/catch; on error log
`notification create failed: <err.message>` and return `null`. Creates a
Notification with:
- `userId`, `type` (as passed), `shipmentId: shipment._id`,
  `cargoId: shipment.cargoId`
- `title`: `` `Shipment ${shipment.status}` ``
- `body`: for `shipment_assigned` →
  `` `Cargo "${cargo && cargo.title || "cargo"}" was matched and a shipment was created.` ``;
  otherwise → `` `Cargo "${...}" status is now ${shipment.status}.` ``
Then `deliver(notification)` and return the created record. (The consumer
passes `cargo` only for the title; derive nothing else from it.)

`async function listForUser({ userId, unread })` — when `unread === true`
add `readAt: null` to the query. Fetch `Notification.find(query).sort({
createdAt: -1 }).limit(MAX_LIST)` and
`Notification.countDocuments({ userId, readAt: null })` (both via
`Promise.all`), return `{ notifications, unreadCount }`.

`async function markRead({ userId, id })` — `assertId(id,
"invalid_notification_id")`; find `{ _id: id, userId }` → `not_found` if
missing; if `readAt` is still null set `readAt = new Date()` and save
(idempotent: a second call returns the record without touching it). Return
the notification.

`function publicNotification(notification)` — same style as
`publicCargo`/`publicOffer`: `{ id, type, shipmentId, cargoId, title, body,
readAt, createdAt, updatedAt }` with ObjectIds `.toString()`.

**Verify**: `node --check backend/src/services/notificationService.js` →
exit 0; `grep -c "deliver(notification)" backend/src/services/notificationService.js`
→ `2` (the `function deliver(notification) {` definition line + the one
call inside `notifyShipment` — if your file scores differently, fix the
file, not the count).

### Step 3: Create `backend/src/services/shipmentService.js`

Double-quotes style. Top:

```js
const Cargo = require("../models/Cargo");
const Shipment = require("../models/Shipment");
const ShipmentEvent = require("../models/ShipmentEvent");
const notificationService = require("./notificationService");

const MAX_LIST = 100;
// eventType on custom events is driver-chosen; 'status_change' events are
// service-managed and can never be created through addEvent.
const DRIVER_EVENT_TYPES = [
  "cargo_loaded", "driver_departed", "checkpoint", "customs_stop", "note",
];
const EVENT_FIELDS = ["eventType", "note", "location"];
```

Plus the standard `fail(code)`, `assertId(id, code)` (with
`invalid_shipment_id` / `invalid_cargo_id` at call sites), and
`pickEventFields(body)` over `EVENT_FIELDS`.

`const TRANSITIONS = { assigned: ["loading"], loading: ["in_transit"],
in_transit: ["at_customs", "delivered"], at_customs: ["in_transit"],
delivered: ["completed"], completed: [], cancelled: [] };` — fixed forward
path; `'cancelled'` has no inbound edge (cancellation surface = admin
backend, plan 019).

`async function createForAward({ cargo, offer })` — award hook:
1. `Shipment.create({ cargoId: cargo._id, offerId: offer._id,
   ownerUserId: cargo.ownerUserId, driverUserId: offer.driverUserId,
   vehicleId: offer.vehicleId, status: "assigned" })`.
2. On error `err.code === 11000` (unique cargoId index — a partially
   completed award was retried): fetch the existing
   `Shipment.findOne({ cargoId: cargo._id })` and return
   `{ shipment: existing, created: false }` (skip events + notifications).
   Any other error rethrows.
3. On success create the first `ShipmentEvent`:
   `{ shipmentId: shipment._id, eventType: "status_change", fromStatus:
   null, toStatus: "assigned", note: "" }`.
4. `await notifyParticipants({ shipment, cargo, type: "shipment_assigned" })`
   (both owner and driver hear about the assignment).
5. Return `{ shipment, created: true }`.

`async function listShipments({ userId, status, cargoId })` — query
`{ $or: [{ ownerUserId: userId }, { driverUserId: userId }] }`; validate
`status` against `Shipment.STATUSES` else `validation_error`; validate
`cargoId` with the 24-hex regex else `invalid_cargo_id`; sort
`createdAt: -1`, `limit(MAX_LIST)`.

`async function getForUser({ userId, id })` — 24-hex check (`assertId(id,
"invalid_shipment_id")`), then `Shipment.findOne({ _id: id, $or: [...] })`
→ `not_found` when absent. This is both the participant check and the
existence check (do not leak other users' shipments).

`async function listEvents({ userId, id })` — `getForUser` first, then
`ShipmentEvent.find({ shipmentId: shipment._id }).sort({ occurredAt: 1
}).limit(MAX_LIST)` (chronological, ascending).

`async function transition({ userId, id, toStatus })` — driver-only:
- `getForUser`, then if
  `String(shipment.driverUserId) !== String(userId)` → `forbidden`.
- `toStatus` must be in `Shipment.STATUSES` else `validation_error`.
- `fromStatus = shipment.status`; if `!(TRANSITIONS[fromStatus] ||
  []).includes(toStatus)` → `invalid_status`.
- Mutate: `shipment.status = toStatus`; when `toStatus === "loading"` and
  `pickupAt` is null set `shipment.pickupAt = new Date()`; when
  `toStatus === "delivered"` set `shipment.deliveredAt = new Date()`;
  `await shipment.save()`.
- Create the `status_change` ShipmentEvent with `fromStatus`/`toStatus`.
- When `toStatus === "completed"`:
  `await Cargo.updateOne({ _id: shipment.cargoId, status: "matched" }, {
  status: "completed" })` (conditional update — only a `matched` cargo
  completes; a cargo already `completed` by a prior retry is a no-op).
- Fetch `const cargo = await Cargo.findById(shipment.cargoId)` and
  `await notifyParticipants({ shipment, cargo, type: "shipment_status",
  excludeUserId: userId })` — the acting driver is excluded so the owner
  hears about every transition.
- Return the saved shipment.

`async function addEvent({ userId, id, body })` — driver-only custom
events: same driver check; `pickEventFields`; if
`!DRIVER_EVENT_TYPES.includes(fields.eventType)` → `validation_error`
(this also blocks `status_change` from being forged). Create the
ShipmentEvent with `note` defaulting to `""` and `location` defaulting to
`null` — do NOT accept `occurredAt` from the body; server time only
(roadmap: "Stores exact time and date of major events"). Return the event.

`async function notifyParticipants({ shipment, cargo, type,
excludeUserId })` — build `[shipment.ownerUserId, shipment.driverUserId]`
filtered to drop `excludeUserId` (string-compare both sides), then loop
`await notificationService.notifyShipment({ userId, type, shipment, cargo
})` per recipient.

`function publicShipment(shipment)` — `{ id, cargoId, offerId,
ownerUserId, driverUserId, vehicleId, status, pickupAt, deliveredAt,
createdAt, updatedAt }` (ObjectIds `.toString()`).

`function publicEvent(event)` — `{ id, shipmentId, eventType, fromStatus,
toStatus, note, location, occurredAt, createdAt, updatedAt }`.

Export all: `TRANSITIONS, createForAward, listShipments, getForUser,
listEvents, transition, addEvent, publicShipment, publicEvent`.

**Verify**: `node --check backend/src/services/shipmentService.js` → exit
0; `grep -c "notifyShipment" backend/src/services/shipmentService.js` →
`1` (exactly the one call inside `notifyParticipants` — do not mention the
name anywhere else, including comments; `notifyParticipants` itself is the
only fan-out point).

### Step 4: Wire the award hook into `matchingService.js`

In `backend/src/services/matchingService.js` (live file, double quotes):

1. Add after the existing requires (line 3, after `Vehicle`):
   `const shipmentService = require("./shipmentService");`
2. Replace the comment block directly above `async function acceptOffer`
   (lines 173–177 — the "Award = accept one pending offer..." block) with
   the same three lines plus a fourth stating: "Plan 018 adds the Shipment
   creation + notifications tail via shipmentService.createForAward."
3. Inside `acceptOffer`, between the `Offer.updateMany(...)` (rejected
   others) and the `const freshOffer = await Offer.findById(offer._id);`
   line, insert:

```js
  // Plan 018: awarding a cargo creates the Shipment. Shipment has a unique
  // index on cargoId, so a partially-completed award retry lands in the
  // idempotency catch inside createForAward instead of double-notifying.
  // createForAward never throws for notification problems (they are
  // swallowed inside notificationService), but it CAN throw for real
  // Shipment-validation problems. Validation here is guaranteed by
  // construction (accepted offer + matched cargo from this transaction), so
  // any throw is a server bug — surface it as 500 like any other failure.
  await shipmentService.createForAward({ cargo, offer });
```

Do not change any other line of `acceptOffer` (the atomic flips, the
revert, the `updateMany` rejection all stay exactly as they are), and do
not touch `publicOffer` or the module export list.

**Verify**: `node --check backend/src/services/matchingService.js` → exit
0; `grep -c "await shipmentService.createForAward"
backend/src/services/matchingService.js` → `1`.

### Step 5: Create `backend/src/routes/shipments.js`

Copy the router shape of `routes/offers.js` (double quotes): `auth`
required router-wide via `router.use(auth)`; per-route role middleware for
the driver-only writes. Error mapper codes:
`invalid_shipment_id: 400, invalid_cargo_id: 400, validation_error: 400,
forbidden: 403, not_found: 404, invalid_status: 409`.

Routes (exactly five):

| Route | Gate | Handler | Response |
|-------|------|---------|----------|
| `GET /` | auth | `listShipments({ userId, status: req.query.status, cargoId: req.query.cargoId })` | `200 { shipments: [...publicShipment], count }` |
| `GET /:id` | auth | `getForUser({ userId, id: req.params.id })` | `200 { shipment }` |
| `GET /:id/events` | auth | `listEvents({ userId, id })` | `200 { events: [...publicEvent], count }` |
| `POST /:id/status` | requireDriver | `transition({ userId, id, toStatus: req.body.status })` | `200 { shipment }` |
| `POST /:id/events` | requireDriver | `addEvent({ userId, id, body: req.body })` | `201 { event }` |

`requireDriver` copies `offers.js` verbatim. Comment above the router
gating: "Both owner and driver read shipments; transitions and event
logging are driver-only, so gating is per-route rather than router-wide."

**Verify**: `node --check backend/src/routes/shipments.js` → exit 0;
`grep -c "router\.\(get\|post\|patch\|delete\)"
backend/src/routes/shipments.js` → `5`; `grep -c "router\."
backend/src/routes/shipments.js` → `6` (the 5 routes + 1
`router.use(auth);`; the `requireDriver` function and
`module.exports = router;` lines contain no `router.` token — if your file
scores differently, a comment contains `router.`, so fix the comment).

### Step 6: Create `backend/src/routes/notifications.js`

Same router style (double quotes); `router.use(auth)` — every notification
is the requester's own; no role gates needed.

Routes (exactly two):

| Route | Handler | Response |
|-------|---------|----------|
| `GET /` | `listForUser({ userId: req.user._id, unread: req.query.unread === "true" })` | `200 { notifications: [...publicNotification], count, unreadCount }` |
| `PATCH /:id/read` | `markRead({ userId: req.user._id, id: req.params.id })` | `200 { ok: true }` |

Error mapper codes: `invalid_notification_id: 400, validation_error: 400,
forbidden: 403, not_found: 404`.

**Verify**: `node --check backend/src/routes/notifications.js` → exit 0;
`grep -c "router\.\(get\|patch\)" backend/src/routes/notifications.js` →
`2`; `grep -c "router\." backend/src/routes/notifications.js` → `3` (2
routes + 1 `router.use(auth);`).

### Step 7: Mount the routers in `backend/src/app.js`

Add requires after the existing five and mounts above the `/api` catch-all
(single quotes — this file is single-quote style):

```js
const shipmentRoutes = require('./routes/shipments');
const notificationRoutes = require('./routes/notifications');
// ...
app.use('/api/shipments', shipmentRoutes);
app.use('/api/notifications', notificationRoutes);
```

Keep the mount order: `/api/auth`, `/api/cargo`, `/api/driver`,
`/api/matching`, `/api/offers`, `/api/shipments`, `/api/notifications`,
then the `/api` catch-all.

**Verify**: `grep -n "app.use('/api/shipments'\|
app.use('/api/notifications'" backend/src/app.js` → 2 lines with line
numbers smaller than the `app.use('/api', ...)` line; `grep -c
"app.use('/api" backend/src/app.js` → `8`.

### Step 8: Boot check + commit (backend)

1. Write `backend/tmp-verify-018.js` (temp file, NEVER committed):

```js
const { createApp } = require("./src/app");
const Shipment = require("./src/models/Shipment");
const ShipmentEvent = require("./src/models/ShipmentEvent");
const Notification = require("./src/models/Notification");
const shipmentService = require("./src/services/shipmentService");
const notificationService = require("./src/services/notificationService");

const app = createApp();
const checks = {
  app: typeof app.listen === "function",
  shipmentStatuses:
    Shipment.STATUSES.join(",") ===
    "assigned,loading,in_transit,at_customs,delivered,completed,cancelled",
  eventTypes:
    ShipmentEvent.EVENT_TYPES.includes("status_change") &&
    ShipmentEvent.EVENT_TYPES.includes("customs_stop"),
  notificationTypes: Notification.TYPES.join(",") === "shipment_assigned,shipment_status",
  transitions:
    shipmentService.TRANSITIONS.assigned.join(",") === "loading" &&
    shipmentService.TRANSITIONS.delivered.join(",") === "completed" &&
    shipmentService.TRANSITIONS.cancelled.length === 0,
  shipmentServiceExports: [
    "createForAward", "listShipments", "getForUser", "listEvents",
    "transition", "addEvent", "publicShipment", "publicEvent",
  ].every((k) => typeof shipmentService[k] === "function"),
  notificationServiceExports: [
    "notifyShipment", "listForUser", "markRead", "publicNotification",
  ].every((k) => typeof notificationService[k] === "function"),
};
const ok = Object.values(checks).every(Boolean);
console.log(ok ? "ok" : "fail " + JSON.stringify(checks));
```

(If the sandbox refuses inline `node -e`, this file is the workaround — a
plain `node <file>` invocation. It resolves every require including the
five routers, `Notification`, and both services without touching Mongo.)

2. Run: `cd backend && node tmp-verify-018.js` → prints `ok`.
3. `cd backend && npm ls express mongoose --depth=0` → both listed.
4. Delete the temp file: it must NOT be committed. (If `rm` of a single
   temp file is blocked by the environment approval gate, leave it on disk
   untracked and note it in the run report; `git status` must still show it
   as untracked only.)
5. Commit:

```bash
git add backend/src/models/Notification.js \
  backend/src/services/notificationService.js \
  backend/src/services/shipmentService.js \
  backend/src/routes/shipments.js \
  backend/src/routes/notifications.js \
  backend/src/app.js \
  backend/src/services/matchingService.js
git commit -m "feat(018): add shipment lifecycle + notifications API"
```

**Verify**: `git log --oneline -1` → `feat(018): add shipment lifecycle +
notifications API`; `git status --short` → only `plans/README.md` (next
step) and untracked `.pipeline.lock` / `backend/tmp-verify-018.js` remain.

### Step 9: Update `plans/README.md` and commit

1. Status row: the row for 018 ALREADY EXISTS in the status table (the
   authoring pass added it with status TODO, right after the `017` row).
   Flip only its Status cell to `DONE (executed by pipeline)` — do not add
   a second row. Verify first: `grep -n "| 018" plans/README.md` → exactly
   one row. If it is somehow absent, add:
   `| 018  | Add shipment lifecycle + events + in-app notifications API | P1 | M | 017 | DONE (executed by pipeline) |`
2. Dependency note: `grep -c "018 depends on 017" plans/README.md` — if it
   returns `1`, the note was pre-written by the authoring pass; SKIP
   (appending again would duplicate it and fail this plan's own
   verification). If `0`, append:
   `- 018 depends on 017 (accepted offer + matched cargo from acceptOffer creates the Shipment via shipmentService.createForAward). Fixed forward status path assigned→loading→in_transit→(at_customs↔)→delivered→completed (driver-only POST /api/shipments/:id/status); driver-only ShipmentEvent logging (cargo_loaded/driver_departed/checkpoint/customs_stop/note, server timestamps); chronological GET /api/shipments/:id/events; new Notification collection with in-app-only lifecycle records (shipment_assigned/shipment_status) + GET /api/notifications + PATCH /:id/read; shipment completion flips cargo matched→completed. No cancel (019 admin), no push/SMS (Phase 2).`
3. MVP slice queue row `018 Shipment lifecycle + events + in-app
   notifications API`: `grep -c "(→ 018)" plans/README.md` — if `1`, the
   marker was pre-written by the authoring pass; SKIP. If `0`, append
   ` (→ 018)` to the scope-summary cell, after the existing text (matching
   how 015–017 rows were marked).

Commit: `git add plans/README.md && git commit -m "chore(018): mark plan DONE in index"`.

**Verify**: `grep -n "| 018" plans/README.md` → one row containing `DONE
(executed by pipeline)`; `grep -c "(→ 018)" plans/README.md` → `1`.

## Done criteria

ALL must hold:

- [ ] `node --check` passes for all 7 new/modified backend files (Steps 1–7 verify)
- [ ] `cd backend && node tmp-verify-018.js` prints `ok` (Step 8)
- [ ] `grep -c "router\.\(get\|post\|patch\|delete\)" backend/src/routes/shipments.js` → `5`
- [ ] `grep -c "router\.\(get\|patch\)" backend/src/routes/notifications.js` → `2`
- [ ] `grep -c "await shipmentService.createForAward" backend/src/services/matchingService.js` → `1`
- [ ] Both new `app.use('/api/...')` mounts sit above the `/api` 404 catch-all in `backend/src/app.js`; `grep -c "app.use('/api"` → `8`
- [ ] `grep -n "STATUS\|status" backend/src/services/shipmentService.js | head` shows the fixed-path TRANSITIONS map, and `grep -c "occurredAt" backend/src/services/shipmentService.js` → at least `1` (server-time events)
- [ ] No files outside the in-scope list modified (`git status --short` clean except untracked `.pipeline.lock` / `backend/tmp-verify-018.js`)
- [ ] Two commits exist: `feat(018): add shipment lifecycle + notifications API` and `chore(018): mark plan DONE in index` (via `git log --oneline -3`)
- [ ] `plans/README.md` row 018 = DONE, queue row 018 marked `(→ 018)`
- [ ] Jest tests for these endpoints: **deferred to plan 026** (noted, not a failure)

## STOP conditions

Stop, set the plan row to `BLOCKED (<reason>)` in `plans/README.md`, leave
changes uncommitted (or commit only what already passed verification), and
report if:

- The drift check shows any in-scope file changed since `ecb8159` and the
  "Current state" excerpts no longer match the live code (e.g. `acceptOffer`
  in `matchingService.js` no longer ends with the two fresh fetches, or
  `app.js` mounts differ from the excerpt).
- `backend/node_modules` is missing and `npm install` in `backend/` fails —
  do not fight dependency resolution; report.
- The `Shipment` model lacks `offerId` (required) or the unique `{ cargoId }`
  index, or `ShipmentEvent` lacks `occurredAt`/`EVENT_TYPES` — the service
  design assumes these; inventing schema changes is out of scope.
- The `Cargo` model's `STATUSES` no longer contains `'completed'` (the
  shipment-completion flip target).
- Any step's verification fails twice after a reasonable fix attempt.
- You find yourself needing to modify `cargoService.js`, `routes/cargo.js`,
  `routes/offers.js`, or any model file — that means the plan's boundary is
  wrong; stop instead.

## Maintenance notes

- **019 (admin backend) will build on this**: active-trip monitoring and
  transport-requests overview read `Shipment`; a shipment-cancel endpoint
  and driver blocking are admin-only surfaces — 018 intentionally ships no
  cancel route and gives `'cancelled'` no inbound edge.
- **Driver-side cancel of an assigned shipment is deliberately absent.**
  If product wants it later, it must decide the offer/cargo rollback first
  (offer back to pending? cargo back to open?) — not a simple status flip.
- **Reviewer scrutiny**: (a) `createForAward` idempotency — the 11000 catch
  must return the existing shipment rather than re-notifying; (b)
  `transition` must write the `status_change` event from the SAME mutation
  that flips the status, and the cargo `matched → completed` update must be
  conditional on `status: "matched"`; (c) `notifyShipment` must never throw
  (a notification failure must never 500 a status transition); (d) all
  shipment reads must go through the participant `$or` filter (a user with
  both roles must still only see their own shipments).
- **Notification growth**: there is no retention/pruning — fine for MVP;
  if list volume becomes a problem, add TTL/pagination in 026+.
- **`backend/tmp-verify-018.js`** is a temp verify artifact — delete it
  before the final commit (or leave untracked and say so in the report);
  026 replaces this kind of boot-check with a real Jest suite.

# Plan 032: Mobile notification deep-links and cargo-limit UX (clients for 029 + 028)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Precondition**: plan 029 (offer_received / offer_rejected notifications
> with `shipmentId: null` + maintenance 503) must be DONE, and plan 028
> (cargo_limit from cancel-side is unrelated; 029 owns the 409 mapping) DONE.
> If 029 is TODO, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/029-notifications-settings-enforcement.md (DONE required)
- **Category**: client follow-up (mobile)
- **Planned at**: commit `114fa9a`, 2026-09-05

## Why this matters

Plan 029 adds `offer_received` / `offer_rejected` notification types whose
`shipmentId` is **null**. The mobile NotificationsScreen silently drops the
tap target for those rows (`handlePress` only navigates when
`notif.shipmentId` is truthy), and nothing tells the user what the new types
mean. Separately, 029 returns a new error `cargo_limit` (409) on
`POST /api/cargo` when the owner hits `maxActiveCargoPerOwner` — the mobile
CreateCargoScreen shows a raw English error code instead of a sentence.

## Current state

`mobile/src/types.ts:111-121` — notification type is a bare string and
`shipmentId` is typed non-null:

```ts
export interface AppNotification {
  id: string;
  type: string;
  shipmentId: string;
  cargoId: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Backend 029 contract (verify with drift commands): `shipmentId` is now
`string | null`; new types `offer_received`, `offer_rejected`;
`cargoId` still present on every row.

`mobile/src/screens/NotificationsScreen.tsx:65-79` — navigation gate:

```ts
  const handlePress = async (notif: AppNotification) => {
    if (!notif.readAt) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n))
        );
      } catch {
        // ignore read errors
      }
    }
    if (notif.shipmentId) {
      navigation.navigate('ShipmentDetail' as never, { shipmentId: notif.shipmentId } as never);
    }
  };
```

Type icon map (same file) keys only on shipment types — check the render
section for `ICONS`/`LABELS` maps and extend, do not replace.

`mobile/src/screens/CreateCargoScreen.tsx:103-108` — error surface:

```ts
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'error' in e
        ? String((e as { error: string }).error)
        : 'خطا در ایجاد بار';
      setError(msg);
    } finally {
```

The user literally sees `cargo_limit` / `validation_error` as text.

Navigation: `mobile/App.tsx` defines `MainTabParamList` and a native stack;
`CargoDetail` exists (used by CargoListScreen with `{ cargoId }`). Verify the
exact route name in App.tsx before wiring (grep below).

## Product rules (do not invent others)

- `offer_received` → owner → tap goes to the **cargo detail** of `cargoId`
  (offers list lives there).
- `offer_rejected` → driver → tap goes to the **cargo detail** too (they can
  re-bid from matching, but the cargo context is the useful target).
- Shipment types keep navigating to ShipmentDetail. Rows with neither id are
  tappable but only mark-read.
- Error copy is a **fixed map**, no i18n framework.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend drift check | `grep -n "offer_received" backend/src/models/Notification.js && grep -n "cargo_limit" backend/src/services/cargoService.js` | one hit each |
| Route names | `grep -n "CargoDetail" mobile/App.tsx \| head -5` | the stack route name for cargo detail |
| Typecheck | `cd mobile && npx tsc --noEmit` | exit 0 |
| Lint | `cd mobile && npm run lint` | exit 0 |

Zero new packages.

## Scope

**In scope**:

- `mobile/src/types.ts` (`shipmentId: string | null`)
- `mobile/src/screens/NotificationsScreen.tsx` (deep-link + type icons/labels)
- `mobile/src/screens/CreateCargoScreen.tsx` (error copy map)
- `mobile/src/screens/EditCargoScreen.tsx` (same copy map, if it surfaces
  publish errors the same way — check; if it has no such catch, skip)
- `plans/README.md` (status row)

**Out of scope**:

- Navigation type param lists (`as never` cleanup is a separate UX plan).
- Admin / backend files.
- Push notifications (Phase 2).
- NotificationsScreen visual redesign beyond icons/labels/deep-links.

## Git workflow

- Stay on the current branch. Do not push.
- Commits: `feat(032): mobile notification deep-links and cargo-limit copy`
  then `chore(032): mark plan DONE in index`.

## Steps

### Step 1: Type — `mobile/src/types.ts`

```ts
export interface AppNotification {
  id: string;
  type: string;
  shipmentId: string | null;   // 029: offer_* rows have no shipment
  cargoId: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Verify**: `cd mobile && npx tsc --noEmit` → fix fallout: any screen doing
`notif.shipmentId` non-null operations must narrow (`if (notif.shipmentId)`).
NotificationsScreen already narrows. CargoDetailScreen/ShipmentDetailScreen
do not construct AppNotifications from literals — expect zero or near-zero
fallout.

### Step 2: Deep-link — `mobile/src/screens/NotificationsScreen.tsx`

1. Add type → icon + Persian label maps (extend the existing maps):

```ts
const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  shipment_assigned: { icon: 'truck-outline', color: COLORS.blue, label: 'سفر جدید' },
  shipment_status: { icon: 'navigate-outline', color: COLORS.blue, label: 'وضعیت سفر' },
  offer_received: { icon: 'hand-left-outline', color: '#f59e0b', label: 'پیشنهاد جدید' },
  offer_rejected: { icon: 'close-circle-outline', color: COLORS.red, label: 'پیشنهاد رد شد' },
};
```

   Use it in the row render (icon by `type`, fallback
   `notifications-outline` / gray). If the file already has its own ICONS
   map, merge instead of duplicating.

2. `handlePress` routing:

```ts
    if (notif.shipmentId) {
      navigation.navigate('ShipmentDetail' as never, { shipmentId: notif.shipmentId } as never);
      return;
    }
    if (notif.cargoId) {
      navigation.navigate('CargoDetail' as never, { cargoId: notif.cargoId } as never);
    }
```

   Confirm the real route name from the App.tsx grep (could be `CargoTab` +
   nested stack — adapt to what exists; the param is `{ cargoId }` per
   CargoListScreen's existing navigate call).

**Verify**: `cd mobile && npx tsc --noEmit` && `npm run lint` → exit 0.

### Step 3: Error copy — `mobile/src/screens/CreateCargoScreen.tsx`

Replace the raw code display with a map:

```ts
const CARGO_ERROR_COPY: Record<string, string> = {
  cargo_limit: 'به سقف بارهای فعال مجاز رسیده‌اید. بارهای قدیمی را لغو کنید.',
  validation_error: 'اطلاعات بار کامل نیست.',
  unauthorized: 'برای ادامه دوباره وارد شوید.',
};

// in catch:
const code = e && typeof e === 'object' && 'error' in e
  ? String((e as { error: string }).error)
  : '';
setError(CARGO_ERROR_COPY[code] || 'خطا در ایجاد بار');
```

If `EditCargoScreen` has the identical raw-code pattern, apply the same map
(duplicate the small map locally — a shared constants module is plan 034's
job, not this plan's).

**Verify**: `cd mobile && npx tsc --noEmit` && `npm run lint` → exit 0.

## Test plan

No mobile test infra. Manual verification:

- Trigger a driver bid on your cargo (or seed via curl) → owner's
  notification list shows «پیشنهاد جدید» row → tap → cargo detail opens.
- Accept another driver's offer → the losing driver sees «پیشنهاد رد شد» →
  tap → cargo detail.
- Hit the cargo cap (set `maxActiveCargoPerOwner` low in admin settings) →
  create attempt shows the Persian cap message, not `cargo_limit`.

## Done criteria

- [ ] `cd mobile && npx tsc --noEmit` exits 0
- [ ] `cd mobile && npm run lint` exits 0
- [ ] `grep -n "string | null" mobile/src/types.ts` → one hit (shipmentId)
- [ ] `grep -n "CargoDetail" mobile/src/screens/NotificationsScreen.tsx` → present
- [ ] `grep -n "cargo_limit" mobile/src/screens/CreateCargoScreen.tsx` → present (copy map)
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` status row for 032 updated

## STOP conditions

- Plan 029 not DONE (no `offer_received` in the Notification model).
- The cargo detail route/params in App.tsx do not match this plan's
  assumption and re-navigation architecture is needed — report.
- `tsc --noEmit` fallout outside the in-scope files.

## Maintenance notes

- When the shared-constants plan (034) lands, fold TYPE_META and
  CARGO_ERROR_COPY into it.
- Push notifications remain Phase 2; this is in-app only.

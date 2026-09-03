# Plan 024: Mobile cargo-owner flow — create cargo, manage drafts, view offers, track shipments

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3153d48..HEAD -- mobile/App.tsx mobile/src/types.ts mobile/src/config.ts mobile/src/theme.ts mobile/src/services/apiClient.ts mobile/src/context/AuthContext.tsx mobile/src/screens/*.tsx mobile/src/components/*.tsx mobile/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plan 023 (mobile auth — DONE), plan 015 (cargo CRUD API — DONE), plan 017 (offers API — DONE), plan 018 (shipment lifecycle — DONE)
- **Category**: direction
- **Planned at**: commit `3153d48`, 2026-09-04

## Why this matters

The mobile app currently only has auth screens and a map measurement tool. Cargo owners have no way to create cargo, manage drafts, view incoming driver offers, or track shipment progress from the mobile app. This plan adds the complete cargo-owner workflow: creating cargo with map-based origin/destination pickers, managing draft/published cargoes, viewing and awarding driver offers, and tracking shipment status with event timelines. This is the core user-facing value of the Baryar MVP.

## Current state

Repo layout at plan time (`3153d48` on `main`):

```
mobile/
  App.tsx                                    ← auth + main navigator (AuthStack + MainStack)
  package.json                               ← no @react-navigation/bottom-tabs yet
  src/
    config.ts                                ← API_BASE (localhost:4000 / 10.0.2.2:4000)
    theme.ts                                 ← COLORS, TEHRAN
    types.ts                                 ← Waypoint, SearchResult, SegmentDistance, MapMode, UserProfile
    services/
      apiClient.ts                           ← apiFetch, setAuthToken, clearAuthToken, getAuthToken
      authApi.ts                             ← requestOtp, verifyOtp, getMe
    context/
      AuthContext.tsx                         ← AuthProvider, useAuth (user, signIn, verifyOtp, signOut)
    screens/
      OtpRequestScreen.tsx                   ← phone input + send code
      OtpVerifyScreen.tsx                    ← OTP code input + verify
      ProfileScreen.tsx                      ← user info + sign out
    components/
      MapCanvas.native.tsx                   ← MapLibre map with waypoints + segments
      MapCanvas.tsx / MapCanvas.web.tsx      ← platform fallbacks
      SearchBar.tsx                          ← Nominatim search bar
      WaypointsSheet.tsx                     ← bottom sheet for waypoint list
```

### Navigation structure today (App.tsx lines 65–110):

```tsx
function AppNavigator() {
  const { user, isLoading } = useAuth();
  const AuthStack = createNativeStackNavigator<AuthStackParamList>();
  const MainStack = createNativeStackNavigator<MainStackParamList>();

  if (isLoading) { /* loading spinner */ }

  if (!user) {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="OtpRequest"> ... </AuthStack.Screen>
        <AuthStack.Screen name="OtpVerify"> ... </AuthStack.Screen>
      </AuthStack.Navigator>
    );
  }

  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Map" component={AppRoot} />
      <MainStack.Screen name="Profile">
        {({ navigation }) => <ProfileScreen onBack={() => navigation.goBack()} />}
      </MainStack.Screen>
    </MainStack.Navigator>
  );
}
```

### Backend API endpoints this plan calls (all exist, all DONE):

**Cargo CRUD (plan 015 — `/api/cargo`):**
| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | `/api/cargo` | `{ title, description, transportMode, origin, destination, dimensions, specialCharacteristics, pickupAt, deliverBy }` | `{ cargo: {...} }` 201 | cargo_owner |
| GET | `/api/cargo` | — (query: `status`) | `{ cargo: [...], count }` 200 | cargo_owner |
| GET | `/api/cargo/:id` | — | `{ cargo: {...} }` 200 | cargo_owner |
| PATCH | `/api/cargo/:id` | `{ title?, description?, ... }` | `{ cargo: {...} }` 200 | cargo_owner |
| DELETE | `/api/cargo/:id` | — | `{ ok: true }` 200 | cargo_owner |
| POST | `/api/cargo/:id/publish` | — | `{ cargo: {...} }` 200 | cargo_owner |
| POST | `/api/cargo/:id/cancel` | — | `{ cargo: {...} }` 200 | cargo_owner |

Cargo status lifecycle: `draft → (publish) → open → (accept offer) → matched → (shipment completed) → completed`. Cancel: `draft|open → cancelled`.

**Offers (plan 017 — `/api/offers`):**
| Method | Path | Response | Auth |
|--------|------|----------|------|
| GET | `/api/offers/cargo/:cargoId/offers` | `{ offers: [...], count }` 200 | cargo_owner |
| POST | `/api/offers/:id/accept` | `{ offer: {...}, cargo: {...} }` 200 | cargo_owner |

**Shipments (plan 018 — `/api/shipments`):**
| Method | Path | Response | Auth |
|--------|------|----------|------|
| GET | `/api/shipments?status=&cargoId=` | `{ shipments: [...], count }` 200 | any |
| GET | `/api/shipments/:id` | `{ shipment: {...} }` 200 | any |
| GET | `/api/shipments/:id/events` | `{ events: [...], count }` 200 | any |

**Notifications (plan 018 — `/api/notifications`):**
| Method | Path | Response | Auth |
|--------|------|----------|------|
| GET | `/api/notifications?unread=true` | `{ notifications: [...], count, unreadCount }` 200 | any |
| PATCH | `/api/notifications/:id/read` | `{ ok: true }` 200 | any |

### Cargo model fields (from `backend/src/models/Cargo.js`):

```js
{
  ownerUserId: ObjectId (required),
  title: String (default ''),
  description: String (default ''),
  transportMode: String (enum: land/sea/air/rail/multimodal, default 'land'),
  origin: { address: String, location: { type: 'Point', coordinates: [lng, lat] } },  // required
  destination: { address: String, location: { type: 'Point', coordinates: [lng, lat] } },  // required
  dimensions: {
    weightKg: Number (min 0, default 0),
    volumeM3: Number (min 0, default 0),
    lengthCm: Number (min 0, default 0),
    widthCm: Number (min 0, default 0),
    heightCm: Number (min 0, default 0),
  },
  specialCharacteristics: [String] (enum: hazardous/fragile/refrigerated/livestock/oversized/other),
  pickupAt: Date (default null),
  deliverBy: Date (default null),
  status: String (enum: draft/open/matched/cancelled/completed, default 'draft'),
  // timestamps: true (createdAt, updatedAt)
}
```

### Offer model fields (from `backend/src/models/Offer.js`):

```js
{
  cargoId: ObjectId (required),
  driverUserId: ObjectId (required),
  vehicleId: ObjectId (required),
  priceRial: Number (min 0, required),
  note: String (default ''),
  status: String (enum: pending/accepted/rejected/withdrawn, default 'pending'),
  // timestamps: true
}
```

### Shipment model fields (from `backend/src/models/Shipment.js`):

```js
{
  cargoId: ObjectId (required, unique index),
  offerId: ObjectId (required),
  ownerUserId: ObjectId (required),
  driverUserId: ObjectId (required),
  vehicleId: ObjectId (required),
  status: String (enum: assigned/loading/in_transit/at_customs/delivered/completed/cancelled),
  pickupAt: Date (default null),
  deliveredAt: Date (default null),
  // timestamps: true
}
```

### ShipmentEvent model fields (from `backend/src/models/ShipmentEvent.js`):

```js
{
  shipmentId: ObjectId (required),
  eventType: String (status_change or cargo_loaded/driver_departed/checkpoint/customs_stop/note),
  fromStatus: String (null for initial),
  toStatus: String (null for custom events),
  note: String (default ''),
  location: { type: 'Point', coordinates: [lng, lat] } (null default),
  occurredAt: Date (default now),
  // timestamps: true
}
```

### MapLibre map infrastructure:

`mobile/src/components/MapCanvas.native.tsx` uses `@maplibre/maplibre-react-native` with an OSM raster tile style. The key imports are:

```tsx
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
```

The OSM_STYLE is defined inline (lines 39–50). The Map component uses `<Map mapStyle={OSM_STYLE} onPress={...}>` with `<Camera ref={cameraRef} initialViewState={{ center: TEHRAN, zoom: 12 }} />`.

### Repo conventions:

- TypeScript with strict mode
- React Native + Expo 57
- `@react-navigation/native` v7 + `@react-navigation/native-stack` v7
- Vazirmatn font (Persian RTL): `Vazirmatn_400Regular`, `Vazirmatn_500Medium`, `Vazirmatn_700Bold`
- RTL forced at module scope: `I18nManager.allowRTL(true); I18nManager.forceRTL(true);`
- COLORS from `src/theme.ts`
- `useSafeAreaInsets()` for safe areas
- Ionicons from `@expo/vector-icons`
- `apiFetch<T>(path, options)` for all API calls (handles JWT injection + 401 clear)
- Persian UI text throughout (Farsi)

### Exemplar screen pattern (from OtpRequestScreen.tsx):

```tsx
import React, { useState } from 'react';
import { ... } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme';

interface Props { ... }
export default function ScreenName({ ... }: Props) {
  const insets = useSafeAreaInsets();
  // state, handlers...
  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* header, body, buttons */}
    </View>
  );
}
// StyleSheet at bottom
```

### Feature roadmap bullets this plan implements:

```
Phase 1 §1: Submitting transport requests, Submitting cargo/load details, Managing cargo/load records
Phase 1 §2: Cargo registry, Setting origin/destination, Specifying physical dimensions,
  Specifying special characteristics, Specifying pickup/delivery timing,
  Viewing transport requests status list, Viewing incoming carrier offers,
  Selecting service provider
Phase 1 §4: Displaying current shipment status, Status transition notification,
  Owner cargo tracking portal
Phase 1 §6: Lifecycle-triggered alerts
Phase 1 §7: Map-based address selection and location picking
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 3153d48..HEAD -- mobile/` | empty or only later commits |
| Install tabs dep | `cd mobile && npx expo install @react-navigation/bottom-tabs` | exit 0 |
| Syntax check | `cd mobile && npx tsc --noEmit 2>&1 \| head -30` | exit 0, no errors |
| Check new files exist | `ls mobile/src/services/cargoApi.ts mobile/src/services/offersApi.ts mobile/src/services/shipmentsApi.ts mobile/src/services/notificationsApi.ts mobile/src/screens/CargoListScreen.tsx mobile/src/screens/CreateCargoScreen.tsx mobile/src/screens/EditCargoScreen.tsx mobile/src/screens/CargoDetailScreen.tsx mobile/src/screens/OffersScreen.tsx mobile/src/screens/ShipmentListScreen.tsx mobile/src/screens/ShipmentDetailScreen.tsx mobile/src/screens/LocationPickerScreen.tsx mobile/src/screens/NotificationsScreen.tsx` | all 13 files listed |
| Check nav structure | `grep -c "Tab.Screen" mobile/App.tsx` | 4 (Map, Cargo, Shipments, Notifications) |
| Check apiClient unchanged | `grep -c "apiFetch" mobile/src/services/apiClient.ts` | 1 (the function definition) |

## Scope

**In scope** (the only files you should create or modify):

- `mobile/package.json` (add `@react-navigation/bottom-tabs`)
- `mobile/src/types.ts` (add Cargo, Offer, Shipment, ShipmentEvent, Notification types)
- `mobile/App.tsx` (replace MainStack with bottom tabs + inner stacks)
- `mobile/src/services/cargoApi.ts` (new — cargo CRUD calls)
- `mobile/src/services/offersApi.ts` (new — owner-side offer calls)
- `mobile/src/services/shipmentsApi.ts` (new — shipment + events calls)
- `mobile/src/services/notificationsApi.ts` (new — notification calls)
- `mobile/src/screens/LocationPickerScreen.tsx` (new — full-screen map for picking origin/destination)
- `mobile/src/screens/CreateCargoScreen.tsx` (new — cargo creation form)
- `mobile/src/screens/CargoListScreen.tsx` (new — list user's cargoes)
- `mobile/src/screens/CargoDetailScreen.tsx` (new — view cargo + status + offers button)
- `mobile/src/screens/EditCargoScreen.tsx` (new — edit draft cargo)
- `mobile/src/screens/OffersScreen.tsx` (new — view + accept offers for a cargo)
- `mobile/src/screens/ShipmentListScreen.tsx` (new — list shipments)
- `mobile/src/screens/ShipmentDetailScreen.tsx` (new — shipment status + event timeline)
- `mobile/src/screens/NotificationsScreen.tsx` (new — notification list)
- `plans/README.md` (status row for 024)

**Out of scope** (do NOT touch, even though they look related):

- `mobile/src/components/MapCanvas.native.tsx` — the existing map component is for the measure/explore tool; the location picker is a new, simpler screen.
- `mobile/src/components/MapCanvas.tsx` / `MapCanvas.web.tsx` — web fallbacks.
- `mobile/src/components/SearchBar.tsx` / `WaypointsSheet.tsx` — measurement UI.
- `mobile/src/hooks/useUserLocation.ts` — GPS hook, unrelated.
- `mobile/src/screens/OtpRequestScreen.tsx` / `OtpVerifyScreen.tsx` / `ProfileScreen.tsx` — auth/profile, keep as-is.
- `mobile/src/services/authApi.ts` / `apiClient.ts` — auth plumbing, keep as-is.
- `mobile/src/context/AuthContext.tsx` — auth state, keep as-is.
- `backend/**` — no backend changes. All APIs exist.
- Driver flow screens (plan 025).
- Any file outside `mobile/` and `plans/README.md`.

## Git workflow

- Branch: stay on current `main` (no branch creation per operator override)
- Commit message style: `feat(024): add mobile cargo-owner flow screens and navigation`
- Two commits: implementation, then index update.
- Do NOT push.

## Product / design decisions (locked for this plan)

1. **Bottom tabs for main area.** The current MainStack (Map + Profile) is replaced with a bottom tab navigator containing 4 tabs: Map (نقشه), My Cargoes (بارهای من), Shipments (حمل‌ونقل‌ها), Notifications (اعلان‌ها). The Profile screen remains accessible via an icon/button in the tab header (not a separate tab).

2. **Persian tab labels.** All UI text is Persian (Farsi), matching existing screens. Tab labels: نقشه, بارها, حمل‌ونقل, اعلان‌ها.

3. **LocationPickerScreen for origin/destination.** A full-screen MapLibre map (same OSM_STYLE as MapCanvas.native.tsx) where the user taps to place a single marker, then confirms. Two modes passed via route params: `mode: 'origin' | 'destination'`. Returns `{ lat, lng, address: '' }` via navigation params callback. The address field is left empty (reverse geocoding is out of scope; the backend accepts the GeoJSON point).

4. **Cargo creation flow.** Two-step: first pick origin (LocationPickerScreen), then destination (LocationPickerScreen), then fill the form (CreateCargoScreen). The CreateCargoScreen shows the selected origin/destination as tappable chips that re-open the picker. The form has: title (optional), description (optional), transport mode (dropdown: land/sea/air/rail/multimodal), dimensions (5 number inputs), special characteristics (multi-select chips), pickup date, delivery deadline. On submit: `POST /api/cargo`, then navigate back to CargoListScreen.

5. **Cargo statuses shown to owners.** The CargoListScreen shows cargoes grouped/filtered by status. Tabs or filter chips: همه (all), پیش‌نویس (draft), باز (open), تطبیق‌یافته (matched), لغو‌شده (cancelled), تکمیل‌شده (completed).

6. **Offers screen for open cargoes.** When a cargo is `open`, the CargoDetailScreen shows a "پیشنهادها" (Offers) button that navigates to OffersScreen. OffersScreen lists pending offers from drivers with price and note. The owner taps "انتخاب" (select) to accept, which calls `POST /api/offers/:id/accept`. A confirmation alert appears before accepting.

7. **Shipment tracking.** ShipmentListScreen lists shipments where the current user is the owner. ShipmentDetailScreen shows the shipment status badge, cargo title, driver info, and a chronological event timeline (status_change events as a stepped list with arrows, custom events as additional entries).

8. **Notifications.** NotificationsScreen lists all notifications with unread indicator (blue dot). Tapping a notification marks it read and navigates to the relevant shipment detail if possible. The badge count on the tab icon shows `unreadCount`.

9. **No pull-to-refresh or infinite scroll yet.** Simple list with the API's default limit (100). This keeps the MVP simple; pagination can be added later.

10. **Error handling.** All screens show Persian error messages for common API errors (`validation_error`, `not_found`, `invalid_status`, `forbidden`). Network errors show "خطا در اتصال به سرور". Loading states use `ActivityIndicator`.

## Steps

### Step 1: Install bottom tabs dependency

```bash
cd mobile && npx expo install @react-navigation/bottom-tabs
```

**Verify**: `grep "bottom-tabs" mobile/package.json` → shows the dependency.

### Step 2: Add API response types to types.ts

Append the following types to `mobile/src/types.ts` (after the existing `UserProfile` interface):

```ts
/** Cargo owner destination for origin/destination fields. */
export interface CargoPlace {
  address: string;
  location: { type: 'Point'; coordinates: [number, number] };
}

export interface CargoDimensions {
  weightKg: number;
  volumeM3: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface Cargo {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  transportMode: 'land' | 'sea' | 'air' | 'rail' | 'multimodal';
  origin: CargoPlace;
  destination: CargoPlace;
  dimensions: CargoDimensions;
  specialCharacteristics: string[];
  pickupAt: string | null;
  deliverBy: string | null;
  status: 'draft' | 'open' | 'matched' | 'cancelled' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Offer {
  id: string;
  cargoId: string;
  driverUserId: string;
  vehicleId: string;
  priceRial: number;
  note: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

export interface Shipment {
  id: string;
  cargoId: string;
  offerId: string;
  ownerUserId: string;
  driverUserId: string;
  vehicleId: string;
  status: 'assigned' | 'loading' | 'in_transit' | 'at_customs' | 'delivered' | 'completed' | 'cancelled';
  pickupAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentEvent {
  id: string;
  shipmentId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string;
  location: { type: 'Point'; coordinates: [number, number] } | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

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

Note: `AppNotification` is used instead of `Notification` to avoid colliding with any React Native or browser globals.

**Verify**: `grep -c "export interface Cargo " mobile/src/types.ts` → `1`.

### Step 3: Create API service files

Create 4 new service files. Each uses `apiFetch` from `apiClient.ts`. No auth logic — just typed API wrappers.

**3a. `mobile/src/services/cargoApi.ts`:**

```ts
import { apiFetch } from './apiClient';
import type { Cargo } from '../types';

interface CargoListResponse { cargo: Cargo[]; count: number; }
interface CargoSingleResponse { cargo: Cargo; }
interface DeleteResponse { ok: true; }

export async function listCargo(status?: string): Promise<Cargo[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiFetch<CargoListResponse>(`/api/cargo${qs}`);
  return res.cargo;
}

export async function getCargo(id: string): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>(`/api/cargo/${id}`);
  return res.cargo;
}

export async function createCargo(body: {
  title?: string;
  description?: string;
  transportMode?: string;
  origin: { address: string; location: { type: 'Point'; coordinates: [number, number] } };
  destination: { address: string; location: { type: 'Point'; coordinates: [number, number] } };
  dimensions?: Record<string, number>;
  specialCharacteristics?: string[];
  pickupAt?: string | null;
  deliverBy?: string | null;
}): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>('/api/cargo', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.cargo;
}

export async function updateCargo(id: string, body: Record<string, unknown>): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>(`/api/cargo/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.cargo;
}

export async function deleteCargo(id: string): Promise<void> {
  await apiFetch<DeleteResponse>(`/api/cargo/${id}`, { method: 'DELETE' });
}

export async function publishCargo(id: string): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>(`/api/cargo/${id}/publish`, {
    method: 'POST',
  });
  return res.cargo;
}

export async function cancelCargo(id: string): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>(`/api/cargo/${id}/cancel`, {
    method: 'POST',
  });
  return res.cargo;
}
```

**3b. `mobile/src/services/offersApi.ts`:**

```ts
import { apiFetch } from './apiClient';
import type { Offer, Cargo } from '../types';

interface OfferListResponse { offers: Offer[]; count: number; }
interface AcceptResponse { offer: Offer; cargo: Cargo; }

export async function listCargoOffers(cargoId: string): Promise<Offer[]> {
  const res = await apiFetch<OfferListResponse>(`/api/offers/cargo/${cargoId}/offers`);
  return res.offers;
}

export async function acceptOffer(offerId: string): Promise<{ offer: Offer; cargo: Cargo }> {
  const res = await apiFetch<AcceptResponse>(`/api/offers/${offerId}/accept`, {
    method: 'POST',
  });
  return res;
}
```

**3c. `mobile/src/services/shipmentsApi.ts`:**

```ts
import { apiFetch } from './apiClient';
import type { Shipment, ShipmentEvent } from '../types';

interface ShipmentListResponse { shipments: Shipment[]; count: number; }
interface ShipmentSingleResponse { shipment: Shipment; }
interface EventListResponse { events: ShipmentEvent[]; count: number; }

export async function listShipments(params?: { status?: string; cargoId?: string }): Promise<Shipment[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.cargoId) qs.set('cargoId', params.cargoId);
  const query = qs.toString();
  const res = await apiFetch<ShipmentListResponse>(`/api/shipments${query ? '?' + query : ''}`);
  return res.shipments;
}

export async function getShipment(id: string): Promise<Shipment> {
  const res = await apiFetch<ShipmentSingleResponse>(`/api/shipments/${id}`);
  return res.shipment;
}

export async function listShipmentEvents(id: string): Promise<ShipmentEvent[]> {
  const res = await apiFetch<EventListResponse>(`/api/shipments/${id}/events`);
  return res.events;
}
```

**3d. `mobile/src/services/notificationsApi.ts`:**

```ts
import { apiFetch } from './apiClient';
import type { AppNotification } from '../types';

interface NotificationListResponse {
  notifications: AppNotification[];
  count: number;
  unreadCount: number;
}

export async function listNotifications(unreadOnly?: boolean): Promise<{
  notifications: AppNotification[];
  unreadCount: number;
}> {
  const qs = unreadOnly ? '?unread=true' : '';
  const res = await apiFetch<NotificationListResponse>(`/api/notifications${qs}`);
  return { notifications: res.notifications, unreadCount: res.unreadCount };
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
}
```

**Verify**: `grep -l "apiFetch" mobile/src/services/cargoApi.ts mobile/src/services/offersApi.ts mobile/src/services/shipmentsApi.ts mobile/src/services/notificationsApi.ts` → 4 files.

### Step 4: Create LocationPickerScreen

Create `mobile/src/screens/LocationPickerScreen.tsx`. This is a full-screen MapLibre map where the user taps to select a single point.

The screen:
- Receives route params: `{ mode: 'origin' | 'destination', initial?: { lat: number; lng: number } }`
- Shows a MapLibre `<Map>` with the same OSM raster style used in MapCanvas.native.tsx (copy the `OSM_STYLE` constant inline — it's only 8 lines)
- On map press, places/moves a single marker at the tapped coordinates
- Has a "تأیید" (confirm) button at the bottom that returns the selected `{ lat, lng }` via `route.params.onSelect(lat, lng)` callback or via `navigation.navigate()` back with params
- Shows the selected coordinates at the bottom
- RTL layout, Persian text: title is "انتخاب مبدأ" or "انتخاب مقصد" depending on mode

**Design pattern**: Use the `useNavigation` hook to pass data back. The caller (CreateCargoScreen/EditCargoScreen) passes a callback. However, React Navigation v7 prefers passing data via `navigation.goBack()` + route params or via a shared state. The simplest pattern: the picker screen calls `navigation.goBack()` after the caller passes an `onSelect` callback in the route params.

Implementation approach — store the callback outside React navigation to avoid serialization issues:

```tsx
// In CreateCargoScreen, before navigating:
import { useNavigation } from '@react-navigation/native';
// Store the callback in a module-level ref or pass via context.
// Simplest: use a global callback map keyed by a random ID.
```

Actually, a simpler approach for React Navigation: the caller navigates to LocationPicker, and the picker calls `navigation.goBack()` then triggers a callback stored in a module-level variable. The caller sets this before navigating.

The cleanest Expo/RN pattern for this:

```tsx
// In the caller (CreateCargoScreen):
const pickLocation = (mode: 'origin' | 'destination') => {
  setPendingMode(mode);
  navigation.navigate('LocationPicker', { mode });
};

// In LocationPickerScreen:
const route = useRoute<RouteProp<{ LocationPicker: { mode: string } }, 'LocationPicker'>>();
// ... on confirm:
navigation.goBack();
// Use a global callback registry:
setTimeout(() => {
  locationPickerCallbacks.get(route.params.mode)?.(lat, lng);
}, 100);
```

OR — even simpler — pass the result back as route params and use `useEffect` in the parent to react. But that requires the parent to navigate to a "result" screen.

**Recommended pattern** (consistent with React Navigation docs): Use a `React.useCallback` ref passed via a module-level map:

```tsx
// At the top of LocationPickerScreen.tsx:
type LocationCallback = (lat: number, lng: number) => void;
const callbacks = new Map<string, LocationCallback>();

export function registerLocationCallback(key: string, cb: LocationCallback) {
  callbacks.set(key, cb);
  return () => callbacks.delete(key);
}

export function triggerLocationCallback(key: string, lat: number, lng: number) {
  callbacks.get(key)?.(lat, lng);
}
```

Then in CreateCargoScreen, before navigating: `registerLocationCallback('origin', (lat, lng) => setOrigin({ lat, lng }))`.
In LocationPickerScreen, on confirm: `triggerLocationCallback(route.params.mode, lat, lng); navigation.goBack();`.

This is clean and avoids serialization issues. Export the helpers from LocationPickerScreen.tsx.

**Verify**: `grep -c "LocationPickerScreen" mobile/src/screens/LocationPickerScreen.tsx` → at least 2 (the default export and the callback helpers).

### Step 5: Create CreateCargoScreen

Create `mobile/src/screens/CreateCargoScreen.tsx`. This is a scrollable form screen for creating a new cargo.

Structure:
- Header: "ایجاد بار جدید" with back button
- Two tappable rows for origin/destination showing selected location (or placeholder text "روی نقشه انتخاب کنید") — tapping opens LocationPickerScreen
- TextInput fields: title (optional), description (optional, multiline)
- Transport mode: 5 chips (land/sea/air/rail/multimodal) with active state
- Dimensions section (5 number inputs in a grid): weightKg, volumeM3, lengthCm, widthCm, heightCm
- Special characteristics: 6 toggle chips (hazardous/fragile/refrigerated/livestock/oversized/other)
- Pickup date: simple date input (TextInput with YYYY-MM-DD format, no date picker library)
- Delivery deadline: same
- "ایجاد بار" (Create Cargo) button at bottom
- Loading state, error display

On submit:
1. Validate origin and destination are selected (error if not)
2. Call `createCargo({ ... })` from cargoApi
3. On success: `navigation.goBack()` (returns to CargoListScreen which refetches)

Key state variables:
```ts
const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);
const [title, setTitle] = useState('');
const [description, setDescription] = useState('');
const [transportMode, setTransportMode] = useState<string>('land');
const [dimensions, setDimensions] = useState({ weightKg: 0, volumeM3: 0, lengthCm: 0, widthCm: 0, heightCm: 0 });
const [specials, setSpecials] = useState<string[]>([]);
const [pickupAt, setPickupAt] = useState('');
const [deliverBy, setDeliverBy] = useState('');
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Verify**: `grep -c "createCargo" mobile/src/screens/CreateCargoScreen.tsx` → at least 1.

### Step 6: Create EditCargoScreen

Create `mobile/src/screens/EditCargoScreen.tsx`. Nearly identical to CreateCargoScreen but:
- Receives route params: `{ cargoId: string }`
- On mount: fetches cargo via `getCargo(cargoId)` and pre-fills all fields
- Submit calls `updateCargo(cargoId, { ... })` instead of `createCargo`
- Title: "ویرایش بار" (Edit Cargo)
- Only allows editing while cargo is `draft` (show error otherwise)
- Origin/destination are read-only (cannot change after creation — display as text, not tappable)

**Verify**: `grep -c "updateCargo" mobile/src/screens/EditCargoScreen.tsx` → at least 1.

### Step 7: Create CargoListScreen

Create `mobile/src/screens/CargoListScreen.tsx`. This is the main cargo tab screen.

Structure:
- Header: "بارهای من" (My Cargoes) + a "+" FAB to navigate to CreateCargoScreen
- Filter chips row: همه | پیش‌نویس | باز | تطبیق‌یافته | لغو‌شده | تکمیل‌شده
- FlatList of cargo cards, each showing:
  - Title (or "بدون عنوان" if empty)
  - Origin → Destination (address or coordinates)
  - Transport mode badge
  - Status badge (colored: draft=gray, open=blue, matched=green, cancelled=red, completed=green)
  - Created date (formatted in Persian)
- On card tap: navigate to CargoDetailScreen
- Pull-to-refresh (use `RefreshControl`)
- Empty state: "هنوز باری ثبت نکرده‌اید" (No cargo registered yet) + a button to create

The screen fetches cargo on mount and on filter change:
```ts
const [cargoes, setCargoes] = useState<Cargo[]>([]);
const [filter, setFilter] = useState<string | undefined>(undefined);
const [refreshing, setRefreshing] = useState(false);

useEffect(() => {
  loadCargoes();
}, [filter]);

async function loadCargoes() {
  try {
    const data = await listCargo(filter);
    setCargoes(data);
  } catch { /* show error */ }
}
```

**Verify**: `grep -c "listCargo" mobile/src/screens/CargoListScreen.tsx` → at least 1.

### Step 8: Create CargoDetailScreen

Create `mobile/src/screens/CargoDetailScreen.tsx`. Shows full cargo details + actions.

Receives route params: `{ cargoId: string }`.

Structure:
- Header: cargo title + back button
- Info section: origin, destination, transport mode, dimensions, special characteristics, pickup/delivery dates
- Status badge (large, colored)
- Action buttons based on status:
  - `draft`: "ویرایش" (Edit → EditCargoScreen), "انتشار" (Publish → confirm → publishCargo), "حذف" (Delete → confirm → deleteCargo)
  - `open`: "پیشنهادها" (Offers → OffersScreen), "لغو" (Cancel → confirm → cancelCargo)
  - `matched`: "مشاهده حمل‌ونقل" (View Shipment → ShipmentDetailScreen — needs to look up shipment by cargoId)
  - `cancelled`/`completed`: read-only, no action buttons
- Loading state, error handling

For matched status, to navigate to the shipment: call `listShipments({ cargoId: cargoId })` to find the shipment for this cargo, then navigate to ShipmentDetailScreen with that shipment ID.

**Verify**: `grep -c "publishCargo\|cancelCargo\|deleteCargo" mobile/src/screens/CargoDetailScreen.tsx` → at least 2.

### Step 9: Create OffersScreen

Create `mobile/src/screens/OffersScreen.tsx`. Lists incoming driver offers for a specific cargo.

Receives route params: `{ cargoId: string, cargoTitle: string }`.

Structure:
- Header: "پیشنهادها — {cargoTitle}"
- FlatList of offer cards, each showing:
  - Driver user ID (abbreviated)
  - Price in Rial (formatted with commas)
  - Note (if any)
  - Status badge
  - "انتخاب" (Select) button — only visible for `pending` offers
- On "انتخاب" tap: show Alert.alert confirmation, then call `acceptOffer(offerId)`
- On accept success: navigate back to CargoDetailScreen (cargo status changed to matched)
- Empty state: "هنوز پیشنهادی دریافت نکرده‌اید" (No offers received yet)
- Pull-to-refresh

**Verify**: `grep -c "acceptOffer" mobile/src/screens/OffersScreen.tsx` → at least 1.

### Step 10: Create ShipmentListScreen

Create `mobile/src/screens/ShipmentListScreen.tsx`. Lists shipments where the user is the owner.

Structure:
- Header: "حمل‌ونقل‌ها" (Shipments)
- Filter chips: همه | در حال بارگیری | در حال حمل | گمرک | تحویل‌شده | تکمیل‌شده
- FlatList of shipment cards, each showing:
  - Cargo title (need to store/display — the shipment model has cargoId but not title; for MVP, show cargoId abbreviated)
  - Status badge (colored, Persian label)
  - Created date
  - Pickup / Delivery dates if present
- On card tap: navigate to ShipmentDetailScreen
- Pull-to-refresh
- Empty state: "هنوز حمل‌ونقلی ندارید" (No shipments yet)

Note: The shipment model doesn't store cargo title. For the MVP list, display the cargo ID (first 8 chars). A future enhancement could populate titles via a backend aggregation endpoint.

**Verify**: `grep -c "listShipments" mobile/src/screens/ShipmentListScreen.tsx` → at least 1.

### Step 11: Create ShipmentDetailScreen

Create `mobile/src/screens/ShipmentDetailScreen.tsx`. Shows shipment status + event timeline.

Receives route params: `{ shipmentId: string }`.

Structure:
- Header: "جزئیات حمل‌ونقل" + back button
- Status badge (large, colored, centered)
- Info section: Cargo ID, Offer ID, Driver ID, Vehicle ID (abbreviated), Pickup time, Delivery time
- Event timeline (FlatList or ScrollView):
  - Each event is a row with: timestamp, event type label (Persian), from→to status (for status_change), note (if any)
  - Status change events shown as a stepped list with colored dots and connecting line
  - Custom events (cargo_loaded, driver_departed, checkpoint, customs_stop, note) shown with different icons
- Pull-to-refresh

Event type translations:
```
status_change → تغییر وضعیت
cargo_loaded → بارگیری
driver_departed → حرکت راننده
checkpoint → نقطه کنترل
customs_stop → توقف گمرک
note → یادداشت
```

Status translations:
```
assigned → تخصیص‌یافته
loading → در حال بارگیری
in_transit → در حال حمل
at_customs → در گمرک
delivered → تحویل‌شده
completed → تکمیل‌شده
cancelled → لغو‌شده
```

**Verify**: `grep -c "listShipmentEvents" mobile/src/screens/ShipmentDetailScreen.tsx` → at least 1.

### Step 12: Create NotificationsScreen

Create `mobile/src/screens/NotificationsScreen.tsx`.

Structure:
- Header: "اعلان‌ها" (Notifications)
- FlatList of notification items, each showing:
  - Title (bold)
  - Body text
  - Unread indicator (blue dot on left side if `readAt === null`)
  - Created date (relative: "۲ ساعت پیش" or just formatted date)
- On item tap: mark as read, then navigate to ShipmentDetailScreen if shipmentId exists
- Pull-to-refresh
- Empty state: "اعلانی ندارید" (No notifications)

**Verify**: `grep -c "markNotificationRead" mobile/src/screens/NotificationsScreen.tsx` → at least 1.

### Step 13: Rewrite App.tsx navigation

Modify `mobile/App.tsx` to replace the simple MainStack with bottom tabs.

The current App.tsx structure (lines 1–423) must be modified. Key changes:

1. Add imports for new screens and bottom tabs:
```tsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CargoListScreen from './src/screens/CargoListScreen';
import CreateCargoScreen from './src/screens/CreateCargoScreen';
import EditCargoScreen from './src/screens/EditCargoScreen';
import CargoDetailScreen from './src/screens/CargoDetailScreen';
import OffersScreen from './src/screens/OffersScreen';
import ShipmentListScreen from './src/screens/ShipmentListScreen';
import ShipmentDetailScreen from './src/screens/ShipmentDetailScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import LocationPickerScreen from './src/screens/LocationPickerScreen';
```

2. Replace `MainStackParamList` with tab + nested stack param lists:

```tsx
type MainTabParamList = {
  MapTab: undefined;
  CargoTab: undefined;
  ShipmentsTab: undefined;
  NotificationsTab: undefined;
};

type CargoStackParamList = {
  CargoList: undefined;
  CreateCargo: undefined;
  EditCargo: { cargoId: string };
  CargoDetail: { cargoId: string };
  Offers: { cargoId: string; cargoTitle: string };
  LocationPicker: { mode: 'origin' | 'destination' };
};

type ShipmentStackParamList = {
  ShipmentList: undefined;
  ShipmentDetail: { shipmentId: string };
};

type RootStackParamList = {
  MainTabs: undefined;
  Profile: undefined;
};
```

3. Replace `AppNavigator` function. The `MainStack` becomes a `RootStack` (to keep Profile as a full-screen overlay). The tab navigator contains 4 tabs:

```tsx
function AppNavigator() {
  const { user, isLoading } = useAuth();
  const RootStack = createNativeStackNavigator<RootStackParamList>();

  if (isLoading) { /* existing loading spinner */ }

  if (!user) {
    /* existing AuthStack */
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={MainTabs} />
      <RootStack.Screen name="Profile">
        {({ navigation }) => <ProfileScreen onBack={() => navigation.goBack()} />}
      </RootStack.Screen>
    </RootStack.Navigator>
  );
}

function MainTabs() {
  const Tabs = createBottomTabNavigator<MainTabParamList>();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.blue,
        tabBarInactiveTintColor: COLORS.gray,
        tabBarStyle: { paddingBottom: 4, height: 56 },
        tabBarLabelStyle: { fontFamily: 'Vazirmatn_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="MapTab"
        component={MapStackScreen}
        options={{
          tabBarLabel: 'نقشه',
          tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="CargoTab"
        component={CargoStackScreen}
        options={{
          tabBarLabel: 'بارها',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ShipmentsTab"
        component={ShipmentStackScreen}
        options={{
          tabBarLabel: 'حمل‌ونقل',
          tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'اعلان‌ها',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}
```

4. Each tab with sub-screens uses a nested stack:

```tsx
function MapStackScreen() {
  const S = createNativeStackNavigator();
  return (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name="Map" component={AppRoot} />
    </S.Navigator>
  );
}

function CargoStackScreen() {
  const S = createNativeStackNavigator<CargoStackParamList>();
  return (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name="CargoList" component={CargoListScreen} />
      <S.Screen name="CreateCargo" component={CreateCargoScreen} />
      <S.Screen name="EditCargo" component={EditCargoScreen} />
      <S.Screen name="CargoDetail" component={CargoDetailScreen} />
      <S.Screen name="Offers" component={OffersScreen} />
      <S.Screen name="LocationPicker" component={LocationPickerScreen} />
    </S.Navigator>
  );
}

function ShipmentStackScreen() {
  const S = createNativeStackNavigator<ShipmentStackParamList>();
  return (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name="ShipmentList" component={ShipmentListScreen} />
      <S.Screen name="ShipmentDetail" component={ShipmentDetailScreen} />
    </S.Navigator>
  );
}
```

5. The profile button in the AppRoot (existing FAB on line 295) navigates to `'Profile'` on the RootStack. The existing `navigation.navigate('Profile' as never)` must change to `navigation.getParent()?.navigate('Profile')` because Profile is now on the parent RootStack, not the current tab's stack. Alternatively, restructure so the profile button navigates up to RootStack.

**Verify**: `grep -c "Tab.Screen" mobile/App.tsx` → 4.

### Step 14: Syntax check and verify

```bash
cd mobile && npx tsc --noEmit 2>&1 | head -50
```

If tsc reports errors in the new files, fix them. Common issues:
- Missing imports
- Type mismatches with apiFetch generics
- Route prop typing issues (use `any` if needed to unblock)

**Verify**: `npx tsc --noEmit` exits 0 (or only pre-existing warnings from MapCanvas web fallbacks).

### Step 15: Verify all files exist

```bash
ls -la mobile/src/services/cargoApi.ts mobile/src/services/offersApi.ts mobile/src/services/shipmentsApi.ts mobile/src/services/notificationsApi.ts mobile/src/screens/LocationPickerScreen.tsx mobile/src/screens/CreateCargoScreen.tsx mobile/src/screens/CargoListScreen.tsx mobile/src/screens/CargoDetailScreen.tsx mobile/src/screens/EditCargoScreen.tsx mobile/src/screens/OffersScreen.tsx mobile/src/screens/ShipmentListScreen.tsx mobile/src/screens/ShipmentDetailScreen.tsx mobile/src/screens/NotificationsScreen.tsx
```

All 13 files should exist.

**Verify**: `grep -l "export default" mobile/src/screens/*.tsx | wc -l` → at least 10 (all screen files have default exports).

### Step 16: Update plans/README.md

Add a new row to the status table:

```
| 024  | Mobile cargo-owner flow screens and navigation | P1 | L | 023, 015 | DONE (executed by pipeline) |
```

And append "(→ 024)" to the 024 queue row.

## Test plan

No test files are created in this plan. Testing is deferred to plan 026 (full MVP test & debug pass).

Verification in this plan is limited to:
- TypeScript compilation (`tsc --noEmit`)
- File existence checks
- Structural grep checks (correct imports, API calls, navigation structure)
- No Jest, no Expo start, no dev servers

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd mobile && npx tsc --noEmit` exits 0 (or only pre-existing warnings)
- [ ] All 13 new files exist (4 service files + 9 screen files)
- [ ] `grep -c "Tab.Screen" mobile/App.tsx` → 4
- [ ] `grep -l "apiFetch" mobile/src/services/cargoApi.ts mobile/src/services/offersApi.ts mobile/src/services/shipmentsApi.ts mobile/src/services/notificationsApi.ts` → 4 files
- [ ] Each screen file has `export default` (grep check)
- [ ] `grep "Cargo\|Offer\|Shipment\|AppNotification" mobile/src/types.ts | grep "export interface" | wc -l` → 5
- [ ] `grep "bottom-tabs" mobile/package.json` → found
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated for 024

## STOP conditions

Stop and report back (do not improvise) if:

- `@react-navigation/bottom-tabs` fails to install (e.g., Expo SDK version mismatch).
- `@maplibre/maplibre-react-native` imports in LocationPickerScreen fail to resolve (the package is installed at `^11.3.8` but may need a specific import path).
- The navigation refactor in App.tsx breaks the existing auth flow (AuthStack rendering).
- Any backend API returns unexpected response shapes (e.g., the Cargo CRUD endpoints changed since plan 015).
- `tsc --noEmit` produces errors in new files that cannot be fixed within the in-scope files.
- The plan requires more than 15 files modified/created (scope creep indicator).

## Maintenance notes

- Future plan 025 (driver flow) will add screens to the CargoTab/ShipmentsTab stacks and potentially a new "Matching" tab or section.
- The LocationPickerScreen callback pattern (module-level map) is a pragmatic React Navigation v7 approach. If Expo Router is adopted later, this should be refactored to use URL-based params.
- The CargoDetailScreen's "view shipment" lookup (listShipments filtered by cargoId) is an N+1 pattern. A future backend enhancement could add `GET /api/cargo/:id/shipment` to resolve this.
- Pull-to-refresh is implemented via `RefreshControl` on FlatList — standard React Native pattern. No state management library (Zustand, Redux) is added; all state is local to each screen.
- Notification badge count (unread count) is fetched on the NotificationsScreen mount. A global unread count badge on the tab icon would require lifting state to AuthContext or a shared context — deferred to a later enhancement.

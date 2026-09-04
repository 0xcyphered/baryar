# Plan 025: Mobile driver flow — onboarding, matching cargo, offer submission, trip management

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 68471c0..HEAD -- mobile/App.tsx mobile/src/types.ts mobile/src/services/*.ts mobile/src/screens/*.tsx mobile/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plan 023 (mobile auth + API client — DONE), plan 016 (driver onboarding API — DONE), plan 017 (matching + offers API — DONE), plan 018 (shipment lifecycle API — DONE)
- **Category**: direction
- **Planned at**: commit `68471c0`, 2026-09-04

## Why this matters

The mobile app currently only serves cargo owners: create cargo, view offers, track shipments. Drivers have no mobile surface to register as a driver, browse open cargo matching their vehicle, submit price bids, or manage active trip status and checkpoint logging. All the backend APIs exist (plans 016/017/018), but no mobile screen calls them. This plan adds the complete driver workflow: onboarding, vehicle management, matching, offers, and trip lifecycle — the other half of the Baryar MVP booking loop.

## Current state

Repo layout at plan time (`68471c0` on `main`):

```
mobile/
  App.tsx                                    ← 4-tab navigator (Map, Cargo, Shipments, Notifications) + auth + root stack
  package.json                               ← @react-navigation/bottom-tabs already installed
  src/
    config.ts                                ← API_BASE (localhost:4000 / 10.0.2.2:4000)
    theme.ts                                 ← COLORS, TEHRAN
    types.ts                                 ← Waypoint, SearchResult, SegmentDistance, MapMode, UserProfile,
                                                Cargo, CargoPlace, CargoDimensions, Offer, Shipment,
                                                ShipmentEvent, AppNotification
    services/
      apiClient.ts                           ← apiFetch<T>(path, options) with Bearer JWT injection
      authApi.ts                             ← requestOtp, verifyOtp, getMe
      cargoApi.ts                            ← listCargo, getCargo, createCargo, updateCargo, etc.
      offersApi.ts                           ← listCargoOffers, acceptOffer (owner-side only)
      shipmentsApi.ts                        ← listShipments, getShipment, listShipmentEvents
      notificationsApi.ts                    ← listNotifications, markRead
    context/
      AuthContext.tsx                         ← AuthProvider, useAuth (user, signIn, verifyOtp, signOut)
    screens/
      OtpRequestScreen.tsx                   ← phone input
      OtpVerifyScreen.tsx                    ← OTP verify
      ProfileScreen.tsx                      ← user info + sign out
      CargoListScreen.tsx                    ← owner's cargo list
      CreateCargoScreen.tsx                  ← create cargo form
      EditCargoScreen.tsx                    ← edit draft cargo
      CargoDetailScreen.tsx                  ← cargo detail + offers button
      OffersScreen.tsx                       ← owner-side incoming offers
      ShipmentListScreen.tsx                 ← list all shipments (owner + driver)
      ShipmentDetailScreen.tsx               ← shipment detail + event timeline (read-only)
      NotificationsScreen.tsx                ← notification list
      LocationPickerScreen.tsx               ← map-based origin/destination picker
    components/                              ← MapCanvas, SearchBar, WaypointsSheet
    hooks/                                   ← useUserLocation
    utils/                                   ← distance, geocoding, haptics, persian, routing
```

### Navigation structure today (App.tsx lines 62–176):

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
      <Tabs.Screen name="MapTab" component={MapStackScreen}
        options={{ tabBarLabel: 'نقشه', tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="CargoTab" component={CargoStackScreen}
        options={{ tabBarLabel: 'بارها', tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="ShipmentsTab" component={ShipmentStackScreen}
        options={{ tabBarLabel: 'حمل‌ونقل', tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="NotificationsTab" component={NotificationsScreen}
        options={{ tabBarLabel: 'اعلان‌ها', tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} /> }} />
    </Tabs.Navigator>
  );
}
```

### Backend API endpoints this plan calls (all exist, all DONE):

**Driver profile + vehicles + documents (plan 016 — `/api/driver`):**

| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | `/api/driver/profile` | `{ licenseNumber?, professionalCardNumber? }` | `{ profile: {...} }` 201/200 | any (grants driver role) |
| GET | `/api/driver/profile` | — | `{ profile: {...} }` 200 | driver |
| POST | `/api/driver/vehicles` | `{ vehicleType, plate, capacityWeightKg?, capacityVolumeM3?, year? }` | `{ vehicle: {...} }` 201 | driver |
| GET | `/api/driver/vehicles` | — | `{ vehicles: [...], count }` 200 | driver |
| PATCH | `/api/driver/vehicles/:id` | `{ vehicleType?, capacityWeightKg?, capacityVolumeM3?, year?, status? }` | `{ vehicle: {...} }` 200 | driver |
| DELETE | `/api/driver/vehicles/:id` | — | `{ ok: true }` 200 | driver |
| POST | `/api/driver/documents` | `{ kind, vehicleId?, storageKey?, originalName?, mimeType? }` | `{ document: {...} }` 201 | driver |
| GET | `/api/driver/documents` | — (query: `kind`) | `{ documents: [...], count }` 200 | driver |
| DELETE | `/api/driver/documents/:id` | — | `{ ok: true }` 200 | driver |

**Matching (plan 017 — `/api/matching`):**

| Method | Path | Query | Response | Auth |
|--------|------|-------|----------|------|
| GET | `/api/matching/cargo` | `vehicleId?`, `lat?`, `lng?`, `radiusKm?` | `{ cargo: [...], count }` 200 | driver |

**Offers (plan 017 — `/api/offers`):**

| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | `/api/offers` | `{ cargoId, vehicleId, priceRial, note? }` | `{ offer: {...} }` 201 | driver |
| GET | `/api/offers` | — | `{ offers: [...], count }` 200 | driver |
| PATCH | `/api/offers/:id` | `{ priceRial?, note? }` | `{ offer: {...} }` 200 | driver |
| DELETE | `/api/offers/:id` | — | `{ ok: true }` 200 | driver |

**Shipments (plan 018 — `/api/shipments`):**

| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| GET | `/api/shipments` | — (query: `status?`) | `{ shipments: [...], count }` 200 | any |
| GET | `/api/shipments/:id` | — | `{ shipment: {...} }` 200 | any |
| GET | `/api/shipments/:id/events` | — | `{ events: [...], count }` 200 | any |
| POST | `/api/shipments/:id/status` | `{ status }` | `{ shipment: {...} }` 200 | driver |
| POST | `/api/shipments/:id/events` | `{ eventType, note?, location? }` | `{ event: {...} }` 201 | driver |

### Vehicle model fields (from `backend/src/models/Vehicle.js`):

```js
{
  driverProfileId: ObjectId (ref DriverProfile, required),
  ownerUserId: ObjectId (ref User, required),
  vehicleType: String (enum: truck/trailer/van/reefer/tanker/other, default 'truck'),
  plate: String (required, unique, uppercase),
  capacityWeightKg: Number (min 0, default 0),
  capacityVolumeM3: Number (min 0, default 0),
  year: Number (default null),
  status: String (enum: active/inactive, default 'active'),
  // timestamps: true
}
```

### DriverProfile model fields (from `backend/src/models/DriverProfile.js`):

```js
{
  userId: ObjectId (ref User, required, unique),
  licenseNumber: String (default ''),
  professionalCardNumber: String (default ''),
  verificationStatus: String (enum: pending/approved/rejected, default 'pending'),
  verifiedAt: Date (default null),
  rejectionReason: String (default ''),
  // timestamps: true
}
```

### Document model fields (from `backend/src/models/Document.js`):

```js
{
  userId: ObjectId (ref User, required),
  vehicleId: ObjectId (ref Vehicle, default null),
  kind: String (enum: driving_license/vehicle_registration/safety_card/national_id/professional_card/other, required),
  storageKey: String (default ''),
  originalName: String (default ''),
  mimeType: String (default ''),
  verificationStatus: String (enum: pending/approved/rejected, default 'pending'),
  reviewedAt: Date (default null),
  reviewerUserId: ObjectId (default null),
  rejectionReason: String (default ''),
  // timestamps: true
}
```

### Shipment status transition path (driver-only, from `backend/src/services/shipmentService.js`):

```js
const TRANSITIONS = {
  assigned: ["loading"],
  loading: ["in_transit"],
  in_transit: ["at_customs", "delivered"],
  at_customs: ["in_transit"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};
```

### Repo conventions:

- TypeScript with strict mode
- React Native + Expo 57
- `@react-navigation/native` v7 + `@react-navigation/native-stack` v7 + `@react-navigation/bottom-tabs` v7
- Vazirmatn font (Persian RTL): `Vazirmatn_400Regular`, `Vazirmatn_500Medium`, `Vazirmatn_700Bold`
- RTL forced at module scope: `I18nManager.allowRTL(true); I18nManager.forceRTL(true);`
- COLORS from `src/theme.ts`
- `useSafeAreaInsets()` for safe areas
- Ionicons from `@expo/vector-icons`
- `apiFetch<T>(path, options)` for all API calls (handles JWT injection + 401 clear)
- Persian UI text throughout (Farsi)
- Each screen: default export function, StyleSheet at bottom, header with back button using `Ionicons name="arrow-forward"`

### Exemplar screen pattern (from ShipmentDetailScreen.tsx):

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
// api imports...

export default function SomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as { someId?: string };

  const [data, setData] = useState<DataType | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => { /* fetch + set states */ }, [deps]);
  useEffect(() => { setLoading(true); loadData(); }, [loadData]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  if (loading && !refreshing) return <ActivityIndicator ... />;
  if (error || !data) return <ErrorView ... />;

  return (
    <ScrollView style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>عنوان صفحه</Text>
        <View style={{ width: 24 }} />
      </View>
      {/* body */}
    </ScrollView>
  );
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: COLORS.bg }, ... });
```

### Feature roadmap bullets this plan implements:

```
Phase 1 §3 (Drivers Section):
  Driver registration, Driver information completion,
  Registering vehicle specifications, Managing vehicle specifications,
  Uploading vehicle licenses, Uploading driver licenses, Submitting required documents,
  Viewing matching transport requests, Receiving direct cargo transport offers,
  Managing transport proposals, Accepting transportation requests,
  Viewing cargo parameters, Viewing route destinations,
  Managing active trip status, Logging transit checkpoints,
  Viewing past trip history
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 68471c0..HEAD -- mobile/` | empty or only later commits |
| Syntax check | `cd mobile && npx tsc --noEmit 2>&1 \| head -30` | exit 0, no errors |
| Check new files exist | `ls mobile/src/services/driverApi.ts mobile/src/services/matchingApi.ts mobile/src/screens/DriverOnboardingScreen.tsx mobile/src/screens/DriverVehiclesScreen.tsx mobile/src/screens/DriverDocumentsScreen.tsx mobile/src/screens/MatchingCargoScreen.tsx mobile/src/screens/SubmitOfferScreen.tsx mobile/src/screens/DriverOffersScreen.tsx mobile/src/screens/DriverShipmentDetailScreen.tsx` | all 9 files listed |
| Check nav structure | `grep -c "Tab.Screen" mobile/App.tsx` | 5 (Map, Cargo, Driver, Shipments, Notifications) |
| Check types added | `grep -c "export interface DriverProfile" mobile/src/types.ts` | 1 |

## Scope

**In scope** (the only files you should create or modify):

- `mobile/src/types.ts` (add DriverProfile, Vehicle, Document types)
- `mobile/src/services/driverApi.ts` (new — driver profile, vehicles, documents API calls)
- `mobile/src/services/matchingApi.ts` (new — matching cargo + offer CRUD API calls)
- `mobile/src/services/shipmentsApi.ts` (add `transitionShipment` and `addShipmentEvent` functions)
- `mobile/src/screens/DriverOnboardingScreen.tsx` (new — create driver profile)
- `mobile/src/screens/DriverVehiclesScreen.tsx` (new — list/add/edit vehicles)
- `mobile/src/screens/DriverDocumentsScreen.tsx` (new — list document stubs)
- `mobile/src/screens/MatchingCargoScreen.tsx` (new — browse open cargo + submit offer)
- `mobile/src/screens/SubmitOfferScreen.tsx` (new — enter price/note for a cargo)
- `mobile/src/screens/DriverOffersScreen.tsx` (new — list driver's offers + withdraw)
- `mobile/src/screens/DriverShipmentDetailScreen.tsx` (new — shipment detail + status transitions + checkpoint events)
- `mobile/App.tsx` (add Driver tab + DriverStackScreen + new param lists)
- `plans/README.md` (status row for 025)

**Out of scope** (do NOT touch, even though they look related):

- `mobile/src/components/MapCanvas*.tsx`, `SearchBar.tsx`, `WaypointsSheet.tsx` — map measurement UI.
- `mobile/src/hooks/useUserLocation.ts` — GPS hook.
- `mobile/src/screens/OtpRequestScreen.tsx` / `OtpVerifyScreen.tsx` / `ProfileScreen.tsx` — auth/profile, keep as-is.
- `mobile/src/screens/CargoListScreen.tsx` / `CreateCargoScreen.tsx` / `EditCargoScreen.tsx` / `CargoDetailScreen.tsx` / `OffersScreen.tsx` — cargo-owner screens, keep as-is.
- `mobile/src/screens/ShipmentListScreen.tsx` / `ShipmentDetailScreen.tsx` — cargo-owner shipment screens, keep as-is. The driver reuses ShipmentListScreen (already shows both roles' shipments) but gets a separate DriverShipmentDetailScreen for status transitions.
- `mobile/src/screens/LocationPickerScreen.tsx` — location picker, keep as-is.
- `mobile/src/screens/NotificationsScreen.tsx` — notifications, keep as-is.
- `mobile/src/services/authApi.ts` / `apiClient.ts` — auth plumbing, keep as-is.
- `mobile/src/context/AuthContext.tsx` — auth state, keep as-is.
- `backend/**` — no backend changes. All APIs exist.
- `mobile/src/utils/**` — utilities, keep as-is.
- `mobile/src/theme.ts`, `mobile/src/config.ts` — config, keep as-is.
- Any file outside `mobile/` and `plans/README.md`.

## Git workflow

- Branch: stay on current `main` (no branch creation per operator override)
- Commit message style: `feat(025): add mobile driver flow — onboarding, matching, offers, trips`
- Two commits: implementation, then index update.
- Do NOT push.

## Product / design decisions (locked for this plan)

1. **5th bottom tab for drivers.** The current 4 tabs gain a 5th: "رانندگی" (Driving) with icon `car-sport-outline`. Placed after CargoTab and before ShipmentsTab. The tab is always visible regardless of role — tapping it shows the onboarding screen if no driver profile exists, or the driver dashboard if it does.

2. **Persian UI text.** All new screen labels and text in Farsi, matching existing screens. Tab label: رانندگی. Sub-labels: پروفایل راننده, وسایل نقلیه, اسناد, فهرست بار, پیشنهادهای من, ثبت پیشنهاد, جزئیات حمل‌ونقل.

3. **Driver tab navigation stack.** `DriverStackScreen` wraps all driver screens:
   - `DriverOnboarding` — create/update driver profile (first screen if no profile)
   - `DriverDashboard` — hub with sections: matching cargo, my offers, my shipments, vehicles, documents
   - `DriverVehicles` — list vehicles, add new vehicle inline
   - `DriverDocuments` — list document stubs by kind
   - `MatchingCargo` — list open cargo (optionally filtered by vehicle + proximity)
   - `SubmitOffer` — fill price + note + select vehicle for a specific cargo
   - `DriverOffers` — list own offers with status badges + withdraw
   - `DriverShipmentDetail` — shipment detail with status transition buttons + checkpoint event form

4. **Driver onboarding flow.** First tap on the Driver tab: if `user.roles` does not include `'driver'`, show DriverOnboardingScreen. Form fields: `licenseNumber` (text input), `professionalCardNumber` (text input). Submit calls `POST /api/driver/profile` which grants the `driver` role. On success, navigate to DriverDashboard.

5. **Driver dashboard.** A ScrollView with section cards: "فهرست بار" (Matching Cargo) → navigates to MatchingCargoScreen; "پیشنهادهای من" (My Offers) → navigates to DriverOffersScreen; "حمل‌ونقل‌های من" (My Shipments) → navigates to ShipmentListScreen (reuses existing screen which already shows both roles); "وسایل نقلیه" (Vehicles) → navigates to DriverVehiclesScreen; "اسناد" (Documents) → navigates to DriverDocumentsScreen. A "ویرایش پروفایل" (Edit Profile) button at top that re-opens the onboarding form pre-filled.

6. **Matching cargo screen.** Lists open cargo from `GET /api/matching/cargo`. Optional filters: select a vehicle from the driver's vehicle list (adds `vehicleId` query param) + optional GPS proximity (lat/lng/radiusKm). Each cargo card shows: title, origin → destination, transport mode badge, weight, status. Tap a cargo → navigates to SubmitOfferScreen. Pull-to-refresh supported.

7. **Submit offer screen.** Shows cargo details (read-only) at top. Form: select vehicle (dropdown from driver's vehicles), `priceRial` (number input), `note` (optional text input). Submit calls `POST /api/offers`. On success, show toast and navigate to DriverOffersScreen.

8. **Driver offers screen.** Lists all offers from `GET /api/offers` (driver-only endpoint). Each offer card shows: cargo title (fetched separately or shown as ID), price, status badge (پذیرفته‌شده/ردشده/در انتظار/لغوشده), date. Status colors: pending=yellow, accepted=green, rejected=red, withdrawn=gray. Pending offers have a "لغو" (withdraw) button that calls `DELETE /api/offers/:id` with confirmation alert. Pull-to-refresh.

9. **Driver shipment detail.** Extends the read-only ShipmentDetailScreen pattern but adds driver actions: status transition buttons and checkpoint event form. The transition buttons show the next valid states based on `TRANSITIONS[currentStatus]`. Each button calls `POST /api/shipments/:id/status`. Below the event timeline, a "افزودن رویداد" (Add Event) section: dropdown for eventType (cargo_loaded, driver_departed, checkpoint, customs_stop, note), text input for note, submit calls `POST /api/shipments/:id/events`. On success, refresh the event list.

10. **Vehicle management.** DriverVehiclesScreen lists vehicles. An "افزودن وسیله" (Add Vehicle) button opens an inline form (or modal sheet) with: vehicleType (dropdown: truck/trailer/van/reefer/tanker/other), plate (text input, uppercase), capacityWeightKg (number), capacityVolumeM3 (number), year (number, optional). Submit calls `POST /api/driver/vehicles`. Each vehicle card shows: plate, type, capacity. Swipe-to-delete with confirmation (calls `DELETE /api/driver/vehicles/:id`).

11. **Document stubs.** DriverDocumentsScreen lists documents. Shows documents grouped by kind with verification status badges. An "افزودن سند" (Add Document) button opens a form: kind (dropdown from Document.KINDS), optional vehicleId (dropdown from driver's vehicles), storageKey/originalName/mimeType (text inputs — file upload is Phase 2; these are metadata stubs). Submit calls `POST /api/driver/documents`.

12. **Error handling.** Same as 024: Persian error messages for common API errors. Network errors show "خطا در اتصال به سرور". Loading states use `ActivityIndicator`.

## Steps

### Step 1: Add TypeScript types to types.ts

Append to `mobile/src/types.ts` (after the existing `AppNotification` interface):

```ts
/** Driver profile from the 016 backend model. */
export interface DriverProfile {
  id: string;
  userId: string;
  licenseNumber: string;
  professionalCardNumber: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  verifiedAt: string | null;
  rejectionReason: string;
  createdAt: string;
  updatedAt: string;
}

/** Vehicle from the 016 backend model. */
export interface Vehicle {
  id: string;
  driverProfileId: string;
  ownerUserId: string;
  vehicleType: 'truck' | 'trailer' | 'van' | 'reefer' | 'tanker' | 'other';
  plate: string;
  capacityWeightKg: number;
  capacityVolumeM3: number;
  year: number | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

/** Document stub from the 016 backend model. */
export interface DriverDocument {
  id: string;
  userId: string;
  vehicleId: string | null;
  kind: 'driving_license' | 'vehicle_registration' | 'safety_card' | 'national_id' | 'professional_card' | 'other';
  storageKey: string;
  originalName: string;
  mimeType: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewerUserId: string | null;
  rejectionReason: string;
  createdAt: string;
  updatedAt: string;
}
```

**Verify**: `grep -c "export interface DriverProfile" mobile/src/types.ts` → `1`

### Step 2: Create driverApi.ts service

Create `mobile/src/services/driverApi.ts`:

```ts
import { apiFetch } from './apiClient';
import type { DriverProfile, Vehicle, DriverDocument } from '../types';

interface ProfileResponse { profile: DriverProfile; }
interface VehicleListResponse { vehicles: Vehicle[]; count: number; }
interface VehicleResponse { vehicle: Vehicle; }
interface DocumentListResponse { documents: DriverDocument[]; count: number; }
interface DocumentResponse { document: DriverDocument; }
interface DeleteResponse { ok: true; }

export async function upsertDriverProfile(body: {
  licenseNumber?: string;
  professionalCardNumber?: string;
}): Promise<DriverProfile> {
  const res = await apiFetch<ProfileResponse>('/api/driver/profile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.profile;
}

export async function getDriverProfile(): Promise<DriverProfile> {
  const res = await apiFetch<ProfileResponse>('/api/driver/profile');
  return res.profile;
}

export async function createVehicle(body: {
  vehicleType: string;
  plate: string;
  capacityWeightKg?: number;
  capacityVolumeM3?: number;
  year?: number | null;
}): Promise<Vehicle> {
  const res = await apiFetch<VehicleResponse>('/api/driver/vehicles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.vehicle;
}

export async function listVehicles(): Promise<Vehicle[]> {
  const res = await apiFetch<VehicleListResponse>('/api/driver/vehicles');
  return res.vehicles;
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiFetch<DeleteResponse>(`/api/driver/vehicles/${id}`, { method: 'DELETE' });
}

export async function createDocument(body: {
  kind: string;
  vehicleId?: string | null;
  storageKey?: string;
  originalName?: string;
  mimeType?: string;
}): Promise<DriverDocument> {
  const res = await apiFetch<DocumentResponse>('/api/driver/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.document;
}

export async function listDocuments(kind?: string): Promise<DriverDocument[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const res = await apiFetch<DocumentListResponse>(`/api/driver/documents${qs}`);
  return res.documents;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiFetch<DeleteResponse>(`/api/driver/documents/${id}`, { method: 'DELETE' });
}
```

**Verify**: `grep -c "export async function" mobile/src/services/driverApi.ts` → `8`

### Step 3: Create matchingApi.ts service

Create `mobile/src/services/matchingApi.ts`:

```ts
import { apiFetch } from './apiClient';
import type { Cargo, Offer } from '../types';

interface CargoListResponse { cargo: Cargo[]; count: number; }
interface OfferListResponse { offers: Offer[]; count: number; }
interface OfferResponse { offer: Offer; }
interface DeleteResponse { ok: true; }

export async function listMatchingCargo(params?: {
  vehicleId?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<Cargo[]> {
  const qs = new URLSearchParams();
  if (params?.vehicleId) qs.set('vehicleId', params.vehicleId);
  if (params?.lat !== undefined) qs.set('lat', String(params.lat));
  if (params?.lng !== undefined) qs.set('lng', String(params.lng));
  if (params?.radiusKm !== undefined) qs.set('radiusKm', String(params.radiusKm));
  const query = qs.toString();
  const res = await apiFetch<CargoListResponse>(`/api/matching/cargo${query ? '?' + query : ''}`);
  return res.cargo;
}

export async function createOffer(body: {
  cargoId: string;
  vehicleId: string;
  priceRial: number;
  note?: string;
}): Promise<Offer> {
  const res = await apiFetch<OfferResponse>('/api/offers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.offer;
}

export async function listMyOffers(): Promise<Offer[]> {
  const res = await apiFetch<OfferListResponse>('/api/offers');
  return res.offers;
}

export async function withdrawOffer(id: string): Promise<void> {
  await apiFetch<DeleteResponse>(`/api/offers/${id}`, { method: 'DELETE' });
}
```

**Verify**: `grep -c "export async function" mobile/src/services/matchingApi.ts` → `4`

### Step 4: Add shipment transition + event functions to shipmentsApi.ts

Append to the existing `mobile/src/services/shipmentsApi.ts` (after the existing `listShipmentEvents` function):

```ts
interface ShipmentSingleResponse { shipment: Shipment; }
interface EventResponse { event: ShipmentEvent; }

export async function transitionShipment(id: string, toStatus: string): Promise<Shipment> {
  const res = await apiFetch<ShipmentSingleResponse>(`/api/shipments/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: toStatus }),
  });
  return res.shipment;
}

export async function addShipmentEvent(id: string, body: {
  eventType: string;
  note?: string;
  location?: { type: 'Point'; coordinates: [number, number] };
}): Promise<ShipmentEvent> {
  const res = await apiFetch<EventResponse>(`/api/shipments/${id}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.event;
}
```

Note: you will need to add `ShipmentSingleResponse` and `EventResponse` — but `ShipmentSingleResponse` already exists at the top of the file. Only `EventResponse` is new. Check the existing file before writing; if `ShipmentSingleResponse` is already declared, do not re-declare it.

**Verify**: `grep -c "export async function" mobile/src/services/shipmentsApi.ts` → `5` (3 existing + 2 new)

### Step 5: Create DriverOnboardingScreen.tsx

Create `mobile/src/screens/DriverOnboardingScreen.tsx`. Follows the exemplar screen pattern.

Props: `{ onDone: () => void }` (called after successful profile creation to navigate to DriverDashboard).

Form fields:
- `licenseNumber` (TextInput, placeholder: "شماره گواهینامه")
- `professionalCardNumber` (TextInput, placeholder: "شماره کارت حرفه‌ای")

Submit button ("ثبت‌نام راننده") calls `upsertDriverProfile({ licenseNumber, professionalCardNumber })`. On success, call `onDone()`. On error, show Persian error message.

If the user already has a driver profile (passed via route param or pre-fetched), pre-fill the form fields.

**Verify**: `cd mobile && npx tsc --noEmit 2>&1 | grep -c "DriverOnboardingScreen"` → `0` (no errors)

### Step 6: Create DriverVehiclesScreen.tsx

Create `mobile/src/screens/DriverVehiclesScreen.tsx`.

- Lists vehicles from `listVehicles()`
- Each card: vehicleType badge, plate (bold), capacityWeightKg + "کیلوگرم", year
- "افزودن وسیله" (Add Vehicle) button at top → toggles inline form:
  - vehicleType (Picker/dropdown: truck/trailer/van/reefer/tanker/other with Persian labels)
  - plate (TextInput, auto-uppercase)
  - capacityWeightKg (TextInput, number)
  - capacityVolumeM3 (TextInput, number)
  - year (TextInput, number, optional)
  - Submit button calls `createVehicle(...)`, refreshes list
- Swipe-to-delete (or long-press → confirm → deleteVehicle)
- Empty state: "هنوز وسیله‌ای ثبت نشده"

**Verify**: `cd mobile && npx tsc --noEmit 2>&1 | grep -c "DriverVehiclesScreen"` → `0`

### Step 7: Create DriverDocumentsScreen.tsx

Create `mobile/src/screens/DriverDocumentsScreen.tsx`.

- Lists documents from `listDocuments()`
- Groups by kind with Persian section headers:
  - driving_license → گواهینامه رانندگی
  - vehicle_registration → سند وسیله نقلیه
  - safety_card → کارت معاینه فنی
  - national_id → کارت ملی
  - professional_card → کارت حرفه‌ای
  - other → سایر
- Each card shows: kind label, originalName (if set), verificationStatus badge (پذیرش‌شده/ردشده/در انتظار)
- "افزودن سند" (Add Document) button → inline form:
  - kind (dropdown)
  - vehicleId (optional, dropdown from driver's vehicles)
  - storageKey / originalName / mimeType (text inputs)
  - Submit calls `createDocument(...)`, refreshes list
- Delete button on pending documents only (calls `deleteDocument`)
- Empty state: "هنوز سندی ثبت نشده"

**Verify**: `cd mobile && npx tsc --noEmit 2>&1 | grep -c "DriverDocumentsScreen"` → `0`

### Step 8: Create MatchingCargoScreen.tsx

Create `mobile/src/screens/MatchingCargoScreen.tsx`.

- Loads open cargo from `listMatchingCargo()`
- Optional filter: select vehicle from dropdown (fetched via `listVehicles()`), which passes `vehicleId` to the API
- Optional GPS proximity: button to use current location (lat/lng) with default radiusKm=50
- Each cargo card shows: title (or "بدون عنوان"), origin.address → destination.address, transportMode badge (land/sea/air/rail/multimodal with Persian labels), dimensions.weightKg + "کیلوگرم"
- Tap cargo → navigates to SubmitOfferScreen with `{ cargoId, cargoTitle, cargo }`
- Pull-to-refresh
- Empty state: "باری برای پیشنهاد یافت نشد"
- Back button → navigates to DriverDashboard

**Verify**: `cd mobile && npx tsc --noEmit 2>&1 | grep -c "MatchingCargoScreen"` → `0`

### Step 9: Create SubmitOfferScreen.tsx

Create `mobile/src/screens/SubmitOfferScreen.tsx`.

Route params: `{ cargoId: string; cargoTitle: string }`

- Shows cargo title and origin→destination at top (read-only)
- Form:
  - vehicleId (dropdown from `listVehicles()`)
  - priceRial (TextInput, number, placeholder: "قیمت پیشنهادی (ریال)")
  - note (TextInput, optional, placeholder: "یادداشت")
- Submit button ("ارسال پیشنهاد") calls `createOffer({ cargoId, vehicleId, priceRial, note })`
- On success: show alert "پیشنهاد شما ثبت شد" and navigate back
- Validation: vehicleId and priceRial required, priceRial must be positive number

**Verify**: `cd mobile && npx tsc --noEmit 2>&1 | grep -c "SubmitOfferScreen"` → `0`

### Step 10: Create DriverOffersScreen.tsx

Create `mobile/src/screens/DriverOffersScreen.tsx`.

- Lists offers from `listMyOffers()`
- Each offer card shows:
  - cargoId (truncated, tappable → navigates to a cargo detail or matching screen)
  - priceRial (formatted with Persian number helpers from `../utils/persian`)
  - note (if non-empty)
  - Status badge with colors: pending=yellow "در انتظار", accepted=green "پذیرفته‌شده", rejected=red "ردشده", withdrawn=gray "لغوشده"
  - Created date (formatted with toLocaleDateString('fa-IR'))
- Pending offers have a "لغو پیشنهاد" (Withdraw) button → Alert.alert confirmation → calls `withdrawOffer(id)` → refreshes list
- Pull-to-refresh
- Empty state: "هنوز پیشنهادی ارسال نکرده‌اید"

**Verify**: `cd mobile && npx tsc --noEmit 2>&1 | grep -c "DriverOffersScreen"` → `0`

### Step 11: Create DriverShipmentDetailScreen.tsx

Create `mobile/src/screens/DriverShipmentDetailScreen.tsx`.

This is similar to the existing `ShipmentDetailScreen.tsx` but adds driver-specific actions:

- Loads shipment + events (same as ShipmentDetailScreen)
- Shows: status badge, info card (cargo, offer, vehicle IDs), event timeline (same as ShipmentDetailScreen)
- **NEW — Status transition section** (below event timeline):
  - Reads `TRANSITIONS[currentStatus]` from a local constant matching the backend:
    ```ts
    const TRANSITIONS: Record<string, string[]> = {
      assigned: ['loading'],
      loading: ['in_transit'],
      in_transit: ['at_customs', 'delivered'],
      at_customs: ['in_transit'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    };
    const STATUS_LABELS: Record<string, string> = {
      assigned: 'تخصیص‌یافته',
      loading: 'در حال بارگیری',
      in_transit: 'در حال حمل',
      at_customs: 'در گمرک',
      delivered: 'تحویل‌شده',
      completed: 'تکمیل‌شده',
      cancelled: 'لغو‌شده',
    };
    ```
  - Shows buttons for each valid next status. Each button calls `transitionShipment(id, nextStatus)`, shows confirmation Alert, refreshes on success
- **NEW — Add Event section** (below status buttons):
  - Dropdown/picker for eventType: cargo_loaded="بارگیری", driver_departed="حرکت راننده", checkpoint="نقطه کنترل", customs_stop="توقف گمرک", note="یادداشت"
  - TextInput for note (placeholder: "یادداشت رویداد")
  - Submit button calls `addShipmentEvent(id, { eventType, note })` → refreshes event list

**Verify**: `cd mobile && npx tsc --noEmit 2>&1 | grep -c "DriverShipmentDetailScreen"` → `0`

### Step 12: Update App.tsx navigation

Modify `mobile/App.tsx` to add the 5th Driver tab and its stack navigator:

1. Import the new screens and the driver API:
   ```tsx
   import DriverOnboardingScreen from './src/screens/DriverOnboardingScreen';
   import DriverVehiclesScreen from './src/screens/DriverVehiclesScreen';
   import DriverDocumentsScreen from './src/screens/DriverDocumentsScreen';
   import MatchingCargoScreen from './src/screens/MatchingCargoScreen';
   import SubmitOfferScreen from './src/screens/SubmitOfferScreen';
   import DriverOffersScreen from './src/screens/DriverOffersScreen';
   import DriverShipmentDetailScreen from './src/screens/DriverShipmentDetailScreen';
   ```

2. Add new param lists after the existing ones:
   ```tsx
   type DriverStackParamList = {
     DriverOnboarding: undefined;
     DriverDashboard: undefined;
     DriverVehicles: undefined;
     DriverDocuments: undefined;
     MatchingCargo: undefined;
     SubmitOffer: { cargoId: string; cargoTitle: string };
     DriverOffers: undefined;
     DriverShipmentDetail: { shipmentId: string };
   };
   ```

3. Add `DriverTab: undefined` to `MainTabParamList`:
   ```tsx
   type MainTabParamList = {
     MapTab: undefined;
     CargoTab: undefined;
     DriverTab: undefined;
     ShipmentsTab: undefined;
     NotificationsTab: undefined;
   };
   ```

4. Create `DriverStackScreen` component (after `ShipmentStackScreen`):
   ```tsx
   function DriverStackScreen() {
     const S = createNativeStackNavigator<DriverStackParamList>();
     const [isDriver, setIsDriver] = useState<boolean | null>(null);
     const { user } = useAuth();

     useEffect(() => {
       if (user) setIsDriver(user.roles.includes('driver'));
     }, [user]);

     if (isDriver === null) {
       return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
         <ActivityIndicator size="large" color={COLORS.blue} />
       </View>;
     }

     return (
       <S.Navigator screenOptions={{ headerShown: false }}>
         {!isDriver ? (
           <S.Screen name="DriverOnboarding">
             {({ navigation }) => (
               <DriverOnboardingScreen onDone={() => setIsDriver(true)} />
             )}
           </S.Screen>
         ) : (
           <>
             <S.Screen name="DriverDashboard">
               {({ navigation }) => (
                 <DriverDashboardScreen onNavigate={(screen: string, params?: any) => navigation.navigate(screen as any, params)} />
               )}
             </S.Screen>
             <S.Screen name="DriverVehicles" component={DriverVehiclesScreen} />
             <S.Screen name="DriverDocuments" component={DriverDocumentsScreen} />
             <S.Screen name="MatchingCargo" component={MatchingCargoScreen} />
             <S.Screen name="SubmitOffer" component={SubmitOfferScreen} />
             <S.Screen name="DriverOffers" component={DriverOffersScreen} />
             <S.Screen name="DriverShipmentDetail" component={DriverShipmentDetailScreen} />
           </>
         )}
       </S.Navigator>
     );
   }
   ```

   **NOTE**: The `DriverDashboardScreen` is a simple inline component (not a separate file) that renders a ScrollView with navigation cards. Define it in `App.tsx`:

   ```tsx
   function DriverDashboardScreen({ onNavigate }: { onNavigate: (screen: string, params?: any) => void }) {
     const insets = useSafeAreaInsets();
     const { user } = useAuth();
     return (
       <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }}
         contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}>
         <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
           <Text style={{ fontSize: 17, fontFamily: 'Vazirmatn_700Bold', color: COLORS.textDark }}>رانندگی</Text>
         </View>
         {/* Profile edit card */}
         <Pressable style={dashStyles.card} onPress={() => onNavigate('DriverOnboarding')}>
           <Ionicons name="person-outline" size={20} color={COLORS.blue} />
           <Text style={dashStyles.cardText}>ویرایش پروفایل راننده</Text>
           <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
         </Pressable>
         {/* Matching */}
         <Pressable style={dashStyles.card} onPress={() => onNavigate('MatchingCargo')}>
           <Ionicons name="search-outline" size={20} color={COLORS.green} />
           <Text style={dashStyles.cardText}>فهرست بار</Text>
           <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
         </Pressable>
         {/* My Offers */}
         <Pressable style={dashStyles.card} onPress={() => onNavigate('DriverOffers')}>
           <Ionicons name="pricetag-outline" size={20} color="#f59e0b" />
           <Text style={dashStyles.cardText}>پیشنهادهای من</Text>
           <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
         </Pressable>
         {/* Vehicles */}
         <Pressable style={dashStyles.card} onPress={() => onNavigate('DriverVehicles')}>
           <Ionicons name="car-outline" size={20} color={COLORS.blue} />
           <Text style={dashStyles.cardText}>وسایل نقلیه</Text>
           <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
         </Pressable>
         {/* Documents */}
         <Pressable style={dashStyles.card} onPress={() => onNavigate('DriverDocuments')}>
           <Ionicons name="document-text-outline" size={20} color={COLORS.red} />
           <Text style={dashStyles.cardText}>اسناد</Text>
           <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
         </Pressable>
       </ScrollView>
     );
   }

   const dashStyles = StyleSheet.create({
     card: {
       flexDirection: 'row', alignItems: 'center', gap: 12,
       backgroundColor: COLORS.white, borderRadius: 12,
       paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10,
       shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
       shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
     },
     cardText: { flex: 1, fontSize: 14, fontFamily: 'Vazirmatn_500Medium', color: COLORS.textDark },
   });
   ```

5. Add the DriverTab to `MainTabs` (between CargoTab and ShipmentsTab):
   ```tsx
   <Tabs.Screen
     name="DriverTab"
     component={DriverStackScreen}
     options={{
       tabBarLabel: 'رانندگی',
       tabBarIcon: ({ color, size }) => <Ionicons name="car-sport-outline" size={size} color={color} />,
     }}
   />
   ```

6. Add `import { useState, useEffect } from 'react';` if not already imported (check first — it likely already has `useState`).

**Verify**: `grep -c "Tab.Screen" mobile/App.tsx` → `5`

**Verify**: `grep "DriverTab" mobile/App.tsx` → shows the DriverTab.Screen definition

### Step 13: Type check

```bash
cd mobile && npx tsc --noEmit 2>&1 | head -30
```

Fix any TypeScript errors. Common issues:
- Missing imports
- Wrong type for navigation params
- `useRoute()` params typing

**Verify**: exit 0, no errors.

### Step 14: Verify all files exist

```bash
ls mobile/src/services/driverApi.ts mobile/src/services/matchingApi.ts mobile/src/screens/DriverOnboardingScreen.tsx mobile/src/screens/DriverVehiclesScreen.tsx mobile/src/screens/DriverDocumentsScreen.tsx mobile/src/screens/MatchingCargoScreen.tsx mobile/src/screens/SubmitOfferScreen.tsx mobile/src/screens/DriverOffersScreen.tsx mobile/src/screens/DriverShipmentDetailScreen.tsx
```

All 9 files must be listed.

**Verify**: all 9 files exist.

### Step 15: Update plans/README.md

Update the status row for plan 025 to "DONE (executed by pipeline)".

Add a dependency note:
```
- 025 depends on 023 (mobile auth + apiClient + AuthContext) and 016/017/018 (driver profile, matching/offers, shipment lifecycle APIs). Adds the driver tab with onboarding, vehicle management, document stubs, matching cargo browsing, offer submission, and active trip management with status transitions and checkpoint events. No backend changes.
```

Update the queue row for 025 to mark it written.

## Test plan

Tests are deferred to plan 026 (the final test/debug pass). This plan's verification gates are:
- `npx tsc --noEmit` exits 0 (TypeScript strict mode catches type errors)
- All new files exist and are importable
- Navigation structure has 5 tabs
- API service files have the correct number of exported functions
- No files outside the in-scope list are modified

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd mobile && npx tsc --noEmit` exits 0
- [ ] `ls mobile/src/services/driverApi.ts mobile/src/services/matchingApi.ts` — both exist
- [ ] `ls mobile/src/screens/DriverOnboardingScreen.tsx mobile/src/screens/DriverVehiclesScreen.tsx mobile/src/screens/DriverDocumentsScreen.tsx mobile/src/screens/MatchingCargoScreen.tsx mobile/src/screens/SubmitOfferScreen.tsx mobile/src/screens/DriverOffersScreen.tsx mobile/src/screens/DriverShipmentDetailScreen.tsx` — all 7 exist
- [ ] `grep -c "Tab.Screen" mobile/App.tsx` → `5`
- [ ] `grep -c "export async function" mobile/src/services/driverApi.ts` → `8`
- [ ] `grep -c "export async function" mobile/src/services/matchingApi.ts` → `4`
- [ ] `grep -c "export async function" mobile/src/services/shipmentsApi.ts` → `5`
- [ ] `grep -c "export interface DriverProfile" mobile/src/types.ts` → `1`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 025 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- You discover that `POST /api/driver/profile` does not exist or has a different response shape than documented.
- `GET /api/matching/cargo` returns a different shape than `{ cargo: [...], count }`.
- `POST /api/shipments/:id/status` or `POST /api/shipments/:id/events` are not mounted or return different shapes.
- The existing `App.tsx` navigation structure has changed significantly (e.g., tabs were reorganized, new screens added).
- `@react-navigation/bottom-tabs` is not installed.

## Maintenance notes

- The `DriverShipmentDetailScreen` duplicates some code from `ShipmentDetailScreen` (status labels, event timeline rendering). A future refactor could extract shared components (`StatusBadge`, `EventTimeline`) but that is out of scope for this plan.
- The `TRANSITIONS` constant in `DriverShipmentDetailScreen` mirrors the backend's `shipmentService.TRANSITIONS`. If the backend adds new statuses, both must be updated.
- Document stubs store metadata only — actual file upload to an object store is Phase 2.
- Vehicle management has no edit screen yet (only add + delete). A `DriverVehicleEditScreen` could be added later.
- The matching cargo list does not implement infinite scroll — limited to 100 results by the backend.

# Plan 040: Mobile post-login role selection (user / cargo owner / driver)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git log --oneline -3 -- mobile/App.tsx mobile/src/context/AuthContext.tsx`
> and confirm the "Current state" excerpts below still match. On a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (client-only; zero backend changes)
- **Depends on**: plans/023 (mobile auth), plans/024/025/031/032/034 (all DONE)
- **Category**: mobile UX / operator direction
- **Planned at**: HEAD `a587526`, 2026-09-07
- **Operator directive (2026-09-07)**: mobile-first focus. Before anything
  else, add a role selection step after login for the THREE mobile user
  models. Related screens must be pleasant and simple, fully consistent with
  the shipped MVP implementation.

## Why this matters

The roadmap (`resources/features-roadmap.md` V6 Phase 1) defines exactly
three mobile-facing user models:

- **§1 کاربر (User app)** — submit transport requests, submit/load details,
  view + track request status, transport history, notifications, support
- **§2 صاحب کالا (Cargo owner)** — full cargo registry (map picking,
  dimensions, specials), incoming offers, awarding a carrier
- **§3 راننده (Driver)** — onboarding, vehicles, documents, matching,
  bidding, active trip management

The **admin is NOT a mobile role** — §5 is a web panel only (`admin/` Vite
app). Do not add any admin surface to the mobile app in this plan.

Today the app dumps every authenticated user into the same 5-tab bottom bar
(نقشه / بارها / رانندگی / حمل‌ونقل / اعلان‌ها) with no onboarding choice, and
`verifyOtp` upserts everyone as `['cargo_owner']`. A driver-only person sees
owner tabs and vice versa. This plan adds a one-time, changeable role
selection that filters the tab bar to match the chosen experience.

## Design (LOCKED — do not deviate)

- Three client-side modes: `'user' | 'cargo_owner' | 'driver'` (type
  `AppRole`). This is a **presentation-layer preference only** — no backend
  role changes, no new API, no new model. `driver` mode still requires the
  existing 016 onboarding gate (`DriverStackScreen` isDriver check already
  handles showing `DriverOnboardingScreen` when the user lacks the role).
- New `RoleChoiceScreen` (full-screen, RTL, Vazirmatn, three large cards +
  CTA). Shown **once** right after OTP verify / first app open with a valid
  token but no stored choice. Existing upgraded users see it once too —
  intended.
- Visible tabs per mode (order = tab bar order; first = initial tab):

| Mode        | Tabs (initial first)                                        |
|-------------|--------------------------------------------------------------|
| user        | نقشه (MapTab), حمل‌ونقل (ShipmentsTab), اعلان‌ها (NotificationsTab) |
| cargo_owner | نقشه, بارها (CargoTab), حمل‌ونقل, اعلان‌ها                    |
| driver      | نقشه, رانندگی (DriverTab), حمل‌ونقل, اعلان‌ها                 |

- `user` mode keeps §1 "submitting transport requests" reachable: a
  prominent **«ثبت درخواست حمل»** button at the top of `ShipmentListScreen`
  navigates to `CreateCargo` (rendered inside the Shipment stack too).
- Switching later: a **«حالت استفاده»** section in `ProfileScreen` with the
  three options; selecting calls `setActiveRole`. All modes include Profile
  via the existing entry point.
- Persistence: `expo-secure-store` key `active_role` (same store the auth
  context already uses). Cleared on `signOut` so a fresh login re-asks.
- Remount trick: `<Tabs.Navigator key={activeRole}
  initialRouteName={...}>` so a role change re-renders the correct tab set
  immediately (bottom-tabs `initialRouteName` only applies on mount).

## Current state (verified at `a587526`)

`mobile/src/context/AuthContext.tsx` — state + persistence shape:

```tsx
const USER_KEY = 'auth_user';
const USER_KEY_EXP = 'auth_user_exp';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  signIn: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (fields: {...}) => Promise<void>;
}
```

Mount effect validates the token via `getMe()` and caches the user in
SecureStore; `verifyOtpFn` stores token+user; `signOut` clears both.
`isLoading` gates `AppNavigator`.

`mobile/App.tsx` — tab bar (all 5 tabs unconditional):

```tsx
export type MainTabParamList = {
  MapTab: undefined;
  CargoTab: undefined;
  DriverTab: undefined;
  ShipmentsTab: undefined;
  NotificationsTab: undefined;
};
```

`MainTabs()` renders `Tabs.Navigator` with MapTab/CargoTab/DriverTab/
ShipmentsTab/NotificationsTab (labels نقشه/بارها/رانندگی/حمل‌ونقل/اعلان‌ها).
Root navigator:

```tsx
export type RootStackParamList = {
  MainTabs: undefined;
  Profile: undefined;
};
```

`AppNavigator()`: `!user` → AuthStack (OtpRequest/OtpVerify); else
RootStack(MainTabs, Profile). `DriverStackScreen` already falls back to
`DriverOnboardingScreen` when `!user.roles.includes('driver')` — keep.

`mobile/src/theme.ts` exports `COLORS = { blue, green, red, gray, grayLight,
bg, white, textDark, textMid }`. Fonts: `Vazirmatn_400Regular /
_500Medium / _700Bold` (loaded in `App()`). Haptics: `hapticLight,
hapticMedium` from `src/utils/haptics`. Shared label/color maps live in
`src/utils/constants.ts` (034). `src/services/settingsApi.ts` and the
support block in ProfileScreen are the style reference for "fetch + silent
fail" UX.

Backend fact (no changes allowed): `verifyOtp` upserts every user with
`roles: ['cargo_owner']`; `driver` is granted only by
`POST /api/driver/profile`. The mobile selection must NOT try to mutate
roles server-side.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `cd mobile && npx tsc --noEmit` | exit 0 |
| Lint (optional gate) | `cd mobile && npm run lint` | no new errors |
| Drift grep | `grep -c "Tabs.Screen" mobile/App.tsx` | 5 |

Do NOT run the backend Jest suite (backend untouched). Do NOT start Expo.

## Scope

**In scope**:

- `mobile/src/types.ts` — add `AppRole`
- `mobile/src/utils/constants.ts` — add `ROLE_META` (label, tagline, icon
  name, accent color per role)
- `mobile/src/context/AuthContext.tsx` — `activeRole` + `setActiveRole` +
  SecureStore persistence (`active_role` key), cleared on signOut
- `mobile/src/screens/RoleChoiceScreen.tsx` — NEW
- `mobile/App.tsx` — `RoleChoice` root screen when `user && !activeRole`;
  tab filtering + `key={activeRole}` remount; `CreateCargo` added to
  `ShipmentStackParamList` + Shipment stack
- `mobile/src/screens/ShipmentListScreen.tsx` — «ثبت درخواست حمل» CTA
- `mobile/src/screens/ProfileScreen.tsx` — «حالت استفاده» switcher section

**Out of scope**:

- Any backend change (routes, models, OTP upsert roles) — forbidden
- Any admin mobile surface (admin is web-only, roadmap §5)
- New cargo-owner vs user backend distinction (both are `cargo_owner`
  server-side; the modes differ only in UX)
- Driver onboarding redesign (existing screen reused as-is)
- Push notifications, GPS, payments (Phase 2)
- `admin/` and `webapp/` — untouched

## Git workflow

- Stay on `main` (operator policy). No branch, no push.
- Plan-writing commit (already applied by the operator session):
  `feat(040): write mobile role-selection plan`
- Implementation commits:
  `feat(040): add post-login role selection for user/cargo-owner/driver`
  then `chore(040): mark plan DONE in index`
- Never rewrite history; follow-up fixes get their own commit.

## Steps

### Step 1: Types + role metadata

`mobile/src/types.ts` — add near `UserProfile`:

```ts
/** Client-side experience mode. NOT a backend role. */
export type AppRole = 'user' | 'cargo_owner' | 'driver';
```

`mobile/src/utils/constants.ts` — add (match existing map style):

```ts
import type { AppRole } from '../types';

export const ROLE_META: Record<AppRole, {
  label: string; tagline: string; icon: string; color: string;
}> = {
  user: {
    label: 'کاربر',
    tagline: 'ارسال درخواست حمل و پیگیری مرسولات',
    icon: 'person-outline',
    color: COLORS.blue,
  },
  cargo_owner: {
    label: 'صاحب کالا',
    tagline: 'ثبت بار، دریافت پیشنهاد و انتخاب شرکت حمل',
    icon: 'cube-outline',
    color: COLORS.green,
  },
  driver: {
    label: 'راننده',
    tagline: 'یافتن بار و مدیریت سفرهای حمل',
    icon: 'car-sport-outline',
    color: COLORS.red,
  },
};

/** Allowed tab names per mode, in bar order (first = initial tab). */
export const ROLE_TABS: Record<AppRole, readonly (keyof MainTabParamList)[]> = {
  user: ['MapTab', 'ShipmentsTab', 'NotificationsTab'],
  cargo_owner: ['MapTab', 'CargoTab', 'ShipmentsTab', 'NotificationsTab'],
  driver: ['MapTab', 'DriverTab', 'ShipmentsTab', 'NotificationsTab'],
};
```

`MainTabParamList` is exported from `App.tsx` — to avoid a circular import,
move the `MainTabParamList` type into `mobile/src/navigation/types.ts`
(034 created it for exactly this) and re-export from `App.tsx`
(`export type { MainTabParamList } from './src/navigation/types';` keeps
existing imports working). Check `navigation/types.ts` first — if it
already re-exports param lists, follow its pattern.

**Verify**: `grep -n "AppRole" mobile/src/types.ts` → 1 hit.

### Step 2: AuthContext role persistence

In `AuthContext.tsx`:

- `const ROLE_KEY = 'active_role';`
- Add to `AuthState`: `activeRole: AppRole | null;` and
  `setActiveRole: (role: AppRole) => Promise<void>;`
- State: `const [activeRole, setActiveRoleState] = useState<AppRole | null>(null);`
- Mount effect: after reading `storedToken` (before or after the cached-user
  read is fine, but BEFORE `setIsLoading(false)` paths complete), read
  `SecureStore.getItemAsync(ROLE_KEY)` and if it is one of the three valid
  values set it. Every `return`/`finally` path in that effect must leave
  role loading settled (read it early, right after `storedToken`).
- `setActiveRole`: validate the value, `setActiveRoleState(role)`,
  `await SecureStore.setItemAsync(ROLE_KEY, role)`.
- `verifyOtpFn`: do NOT set a role — leaving `null` is what triggers the
  choice screen for a fresh login. (If the same device re-logs the same
  user after signOut, asking again is intended.)
- `signOut`: add `await SecureStore.deleteItemAsync(ROLE_KEY);` and
  `setActiveRoleState(null);`.

**Verify**: `npx tsc --noEmit` (may still fail until App.tsx uses the new
fields — run the full check again after Step 4).

### Step 3: RoleChoiceScreen (NEW file)

`mobile/src/screens/RoleChoiceScreen.tsx`. Structure:

- Props: `{ onDone: () => void }`
- Full-screen `COLORS.bg` background, safe-area padding
  (`useSafeAreaInsets`), `ScrollView` so small screens scroll.
- Header: «به بریار خوش آمدید» (Vazirmatn_700Bold, 22) + subtitle
  «می‌خواهید چطور از بریار استفاده کنید؟» (Vazirmatn_400Regular, 14,
  COLORS.textMid).
- Three `Pressable` cards from `ROLE_META` (in AppRole order): icon in a
  tinted circle (`role.color` at low alpha via `rgba` — hardcode a light
  tint per color, do not compute), label (700Bold 16), tagline (400Regular
  13, textMid). Selected card: 2px border in `role.color` + light
  background; unselected: `COLORS.white`, radius 14, the same soft shadow
  as `dashStyles.card` in App.tsx. `hapticLight()` on press.
- Local state `selected: AppRole | null` (default `null`); CTA button
  «ادامه» (full width, `COLORS.blue`, white 700Bold text, disabled +
  grayed until a card is selected) → `hapticMedium()` then
  `await setActiveRole(selected)` then `onDone()`.
- Footer hint: «بعداً می‌توانید از پروفایل تغییر دهید» (11, gray).
- RTL: the app already forces RTL globally; use plain flexDirection row and
  let RTL mirror it. No I18nManager calls.
- Loading state while saving: `ActivityIndicator` inside the CTA.

**Verify**: `grep -c "Pressable" mobile/src/screens/RoleChoiceScreen.tsx` ≥ 4
(3 cards + CTA).

### Step 4: App.tsx wiring

1. Imports: `RoleChoiceScreen`, `ROLE_TABS`, `ROLE_META` (only if needed).
2. `RootStackParamList` gains `RoleChoice: undefined;`.
3. `ShipmentStackParamList` gains `CreateCargo: undefined;` and
   `ShipmentStackScreen` renders
   `<S.Screen name="CreateCargo" component={CreateCargoScreen} />`.
4. `AppNavigator()`: between the `!user` branch and the MainTabs branch:

```tsx
if (user && !activeRole) {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="RoleChoice">
        {() => <RoleChoiceScreen onDone={() => { /* force re-render via state */ }} />}
      </RootStack.Screen>
    </RootStack.Navigator>
  );
}
```

   `activeRole` comes from `useAuth()`. Because `setActiveRole` updates
   context state, `AppNavigator` re-renders automatically — `onDone` can
   simply be `() => {}` (the conditional flips on its own). Keep `onDone`
   prop anyway for future side effects.
5. `MainTabs()`: read `const { activeRole } = useAuth();`. Build the tab
   config as a record keyed by tab name (label + icon), then render
   `<Tabs.Navigator key={activeRole ?? 'none'}
   initialRouteName={ROLE_TABS[activeRole ?? 'cargo_owner'][0]}>` and map
   over `ROLE_TABS[activeRole ?? 'cargo_owner']` to emit `Tabs.Screen`s.
   Keep the exact existing labels/icons per tab (نقشه map-outline, بارها
   cube-outline, رانندگی car-sport-outline, حمل‌ونقل car-outline, اعلان‌ها
   notifications-outline) and the existing `screenOptions`.
6. Do not touch `DriverStackScreen` internals or `MapStackScreen`.

**Verify**:
`grep -c "Tabs.Screen" mobile/App.tsx` → **0 or fewer than 5** (they are now
mapped, not literal — confirm via the render map instead:
`grep -n "ROLE_TABS" mobile/App.tsx` → ≥ 2) and
`npx tsc --noEmit` → exit 0.

### Step 5: ShipmentListScreen CTA

Above the list (below the existing header), add a full-width `Pressable`
«ثبت درخواست حمل» (blue background, white Vazirmatn_500Medium, radius 12,
`hapticLight`) → `navigation.navigate('CreateCargo' as never)`. Show it
unconditionally (useful in every mode; §1 keeps request submission
reachable for user mode). Keep existing empty states.

**Verify**: `grep -n "ثبت درخواست حمل" mobile/src/screens/ShipmentListScreen.tsx` → 1 hit.

### Step 6: ProfileScreen switcher

Add a «حالت استفاده» section (between profile fields and the support
block): three rows built from `ROLE_META` — icon, label, tagline, and a
checkmark (`checkmark-circle` Ionicon in `role.color`) on the active one.
`onPress` → `hapticLight()` + `setActiveRole(role)`. No navigation change
needed; on back, `MainTabs` remounts with the new tab set (context state
changed → AppNavigator re-render → `key` remount).

**Verify**: `grep -n "حالت استفاده" mobile/src/screens/ProfileScreen.tsx` → 1 hit.

### Step 7: Full verification

1. `cd mobile && npx tsc --noEmit` → exit 0
2. `grep -rn "active_role" mobile/src/context/AuthContext.tsx` → ≥ 3 hits
   (read, write, delete)
3. `git status --short` → only the 7 in-scope files (+ README edit)
4. Backend untouched: `git diff --stat -- backend/ admin/ webapp/` → empty

## Test plan

- Typecheck is the gate (no mobile test infra — consistent with 023–034).
- Manual QA checklist (operator, emulator or device):
  - Fresh OTP login → RoleChoice appears; pick راننده → tabs
    نقشه/رانندگی/حمل‌ونقل/اعلان‌ها; onboarding screen shows inside
    رانندگی tab.
  - Kill + reopen app → choice persisted, no RoleChoice.
  - Profile → حالت استفاده → صاحب کالا → back → tab set changes without
    app restart.
  - user mode → حمل‌ونقل → «ثبت درخواست حمل» → CreateCargo opens.
  - signOut → login again → RoleChoice asks again.

## Done criteria

- [ ] RoleChoiceScreen shown after login when no stored choice; three
      modes only — NO admin option anywhere in the flow
- [ ] Tab bar filtered per mode with correct initial tab; remount on change
- [ ] Choice persisted in SecureStore, cleared on signOut
- [ ] «ثبت درخواست حمل» CTA on ShipmentListScreen opens CreateCargo
- [ ] «حالت استفاده» switcher in ProfileScreen
- [ ] Zero backend/admin/webapp changes; `tsc --noEmit` exit 0
- [ ] `plans/README.md` row for 040 is DONE

## STOP conditions

- AuthContext shape drifted (no `isLoading` gate or different SecureStore
  usage) — re-derive before editing.
- `MainTabParamList` cannot move to `navigation/types.ts` cleanly (import
  cycle) — keep the type in App.tsx and define `ROLE_TABS` in App.tsx
  instead of constants.ts; do not introduce a cycle to honor Step 1.
- Temptation to call any backend endpoint to "save" the role — STOP; the
  role is client-side only. Backend roles stay untouched.
- Temptation to add a fourth "admin" card — STOP; admin is web-only
  (roadmap §5, operator confirmed 2026-09-07).
- React Navigation version rejects `key` on `Tabs.Navigator` — use the
  `independent`-free alternative: `navigationKey` is not supported on
  Navigators, so instead wrap `MainTabs` in a keyed inner component
  (`<MainTabsInner key={activeRole} />`).

## Maintenance notes

- Future: per-mode home dashboards (e.g. driver earnings, owner KPIs) plug
  into `ROLE_TABS`/`ROLE_META` without touching auth.
- If product later wants server-side role preference, add a `PATCH
  /api/auth/me` allowlist field in a new plan; do not extend this one.
- The choice screen intentionally re-appears for users who log out and back
  in; if the operator wants "remember per device forever", move the key
  cleanup out of `signOut` in a follow-up.

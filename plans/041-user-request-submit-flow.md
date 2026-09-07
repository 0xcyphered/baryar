# Plan 041: User-mode §1 request submit flow — picker reach, draft→publish handoff, EditCargo pickers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git log --oneline -3 -- mobile/App.tsx mobile/src/screens/CreateCargoScreen.tsx mobile/src/screens/EditCargoScreen.tsx`
> and confirm the "Current state" excerpts below still match the live files.
> On a mismatch, treat it as a STOP condition.

## Operator overrides (unattended pipeline — replace conflicting skill defaults)

- **GIT POLICY**: stay on the current branch (`main`). No branch creation, no
  checkout/switch, no worktree, no push. Commits ARE allowed and expected:
  `feat(041): <summary>` for the plan's files, then
  `chore(041): mark plan DONE in index` for the row flip. Never commit `.env`
  files or secrets; `.pipeline.lock` is gitignored. If git identity or a hook
  fails, leave changes uncommitted and note it in the report instead of
  fighting git.
- **TESTS DEFERRED**: never run Jest/npm test, never start dev servers or the
  API process (nothing long-running may survive your run). Allowed
  verification here: `npx tsc --noEmit`, `npm run lint`, grep/search checks.
  This plan is client-only; backend suites are irrelevant to it.
- **npm install is NOT needed** — this plan adds zero dependencies. Do not
  install anything.
- After editing, verify changes are really on disk (grep for the new symbols)
  before claiming success.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (client-only; zero backend changes)
- **Depends on**: plans/040 (DONE — `CreateCargo` lives in the Shipment stack, ROLE_TABS shipped), plans/015/024 (cargo API client + owner flow, DONE)
- **Category**: mobile UX / operator directive
- **Planned at**: commit `f115263`, 2026-09-07
- **Operator directive (2026-09-07)**: after 040, write in order: user-mode
  §1 polish (request submit flow clarity), then per-mode home/dashboard
  polish. This plan is the first of the two.

## Why this matters

Roadmap `resources/features-roadmap.md` V6 Phase 1 §1 (کاربر) names:
"Submitting transport requests", "Submitting cargo/load details", and
"Managing cargo/load records". Plan 040 made §1 reachable via a
«ثبت درخواست حمل» CTA on `ShipmentListScreen` that opens `CreateCargo`
**inside the Shipment stack**. But three flow breaks make that path
non-functional for a §1 user:

1. **Location picker unreachable.** `CreateCargoScreen.pickLocation` does
   `navigation.navigate('LocationPicker' as never, …)`, but `LocationPicker`
   is registered only in `CargoStackScreen` (`mobile/App.tsx:147`). From the
   Shipment stack the navigate action finds no such route — React Navigation
   warns and does nothing. The user cannot pick مبدأ/مقصد, and
   `handleSubmit` rejects with «مبدأ و مقصد را انتخاب کنید». The 040 flow
   dies at its first step.
2. **Draft is invisible in user mode.** The backend
   (`backend/src/services/cargoService.js:createCargo`) always creates
   `status: 'draft'`; publishing is a separate call
   (`publishCargo`, `POST /api/cargo/:id/publish` → `open`). `CreateCargoScreen`
   never publishes. User mode has **no CargoTab** (locked 040 tab sets), so
   the created request is invisible and can never be published — the submit
   "succeeds" into a void. Note: drafts count toward
   `maxActiveCargoPerOwner` (default 20, backend create-time check, 409
   `cargo_limit`) — leaving invisible drafts behind also burns the cap.
3. **Drafts cannot be fixed up.** `EditCargoScreen` never shows origin/
   destination rows, although the backend allows editing them
   (`EDITABLE_FIELDS` includes `origin`/`destination`). A draft with a wrong
   location can only be deleted and re-created.

This plan closes all three, client-only, reusing existing screens and the
existing callback registry. No new screens, no new dependencies, no backend
changes, no tab-set changes.

## Current state (verified at `f115263`)

`mobile/App.tsx` — param lists and the Shipment stack (lines 94–98, 152–163):

```tsx
export type ShipmentStackParamList = {
  ShipmentList: undefined;
  ShipmentDetail: { shipmentId: string };
  CreateCargo: undefined;
};
```

```tsx
function ShipmentStackScreen() {
  const S = createNativeStackNavigator<ShipmentStackParamList>();
  return (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name="ShipmentList" component={ShipmentListScreen} />
      <S.Screen name="ShipmentDetail" component={ShipmentDetailScreen} />
      {/* Plan 040: user-mode keeps §1 "submitting transport requests"
          reachable from the حمل‌ونقل tab. */}
      <S.Screen name="CreateCargo" component={CreateCargoScreen} />
    </S.Navigator>
  );
}
```

`LocationPicker` is registered only in `CargoStackScreen`
(`mobile/App.tsx:147`: `<S.Screen name="LocationPicker" component={LocationPickerScreen} />`).
`grep -c "LocationPicker" mobile/App.tsx` → **3** today (import line 39,
param list line 91, CargoStackScreen line 147).
`grep -c "S.Screen name=" mobile/App.tsx` → **19** today.

`mobile/src/screens/LocationPickerScreen.tsx` exports a module-global
callback registry (lines 13–24) — screen-agnostic, key-based:

```tsx
type LocationCallback = (lat: number, lng: number) => void;
const locationCallbacks = new Map<string, LocationCallback>();

export function registerLocationCallback(key: string, cb: LocationCallback): () => void {
  locationCallbacks.set(key, cb);
  return () => locationCallbacks.delete(key);
}

export function triggerLocationCallback(key: string, lat: number, lng: number) {
  locationCallbacks.get(key)?.(lat, lng);
}
```

The picker confirms with `triggerLocationCallback(mode, selected.lat, selected.lng)`
— **the key is just `mode`** (`'origin' | 'destination'`), so callers
namespace their own keys. `CreateCargoScreen` already uses
`const key = \`create_${mode}\`;` (`CreateCargoScreen.tsx:47`).
Only `CreateCargoScreen` uses the registry today (`grep -rn
"registerLocationCallback" mobile/src` → 2 hits, import + call, both in
`CreateCargoScreen.tsx`).

`mobile/src/screens/CreateCargoScreen.tsx` — submit path (lines 63–97,
abridged to the load-bearing parts):

```tsx
const handleSubmit = async () => {
  if (!origin || !destination) {
    setError('مبدأ و مقصد را انتخاب کنید');
    return;
  }
  setLoading(true);
  setError(null);
  try {
    await createCargo({
      title: title || undefined,
      description: description || undefined,
      transportMode,
      origin: { address: '', location: { type: 'Point', coordinates: [origin.lng, origin.lat] } },
      destination: { address: '', location: { type: 'Point', coordinates: [destination.lng, destination.lat] } },
      dimensions: { /* … five Number() || 0 fields … */ },
      specialCharacteristics: specials.length > 0 ? specials : undefined,
      pickupAt: pickupAt || null,
      deliverBy: deliverBy || null,
    });
    navigation.goBack();
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'error' in e
      ? String((e as { error: string }).error)
      : '';
    setError(CARGO_ERROR_COPY[code] || 'خطا در ایجاد بار');
  } finally {
    setLoading(false);
  }
};
```

`Alert` is already imported in `CreateCargoScreen.tsx` (line 3). The import
line is `import { createCargo } from '../services/cargoApi';` (line 15).

`mobile/src/services/cargoApi.ts` already exposes both calls:

```ts
export async function createCargo(body: { … }): Promise<Cargo> { … }   // POST /api/cargo → { cargo }
export async function publishCargo(id: string): Promise<Cargo> { … }   // POST /api/cargo/:id/publish
```

`mobile/src/screens/EditCargoScreen.tsx` — loads a draft (lines 52–80) and
submits (lines 88–116). It has **no** origin/destination state, no
`registerLocationCallback` import, and no picker rows; it imports
`getCargo, updateCargo` from `../services/cargoApi` and
`MODE_LABELS, SPECIAL_LABELS, CARGO_ERROR_COPY` from `../utils/constants`.
Its load effect ends with:

```tsx
setSpecials(cargo.specialCharacteristics || []);
setPickupAt(cargo.pickupAt ? cargo.pickupAt.slice(0, 10) : '');
setDeliverBy(cargo.deliverBy ? cargo.deliverBy.slice(0, 10) : '');
```

and the non-draft guard at the top of the effect:

```tsx
if (cargo.status !== 'draft') {
  setError('فقط بارهای پیش‌نویس قابل ویرایش هستند');
  return;
}
```

`mobile/src/types.ts` — `CargoPlace` (lines 46–49):
`{ address: string; location: { type: 'Point'; coordinates: [number, number] } }`
— coordinates are GeoJSON order **[lng, lat]**. `Cargo` has
`origin: CargoPlace; destination: CargoPlace; status: 'draft' | 'open' | …`.

Backend facts (do NOT change any of them): `EDITABLE_FIELDS` in
`backend/src/services/cargoService.js` = `['title', 'description',
'transportMode', 'origin', 'destination', 'dimensions',
'specialCharacteristics', 'pickupAt', 'deliverBy']`; `createCargo` forces
`status: 'draft'`; `publishCargo` requires `status === 'draft'` and flips to
`'open'`; the create cap counts `['draft', 'open', 'matched']` per owner.
`geoPoint.js` `placeSchema.address` is a plain optional String.

Conventions to match (verified per file, not per sibling): both edited
screens are single-quoted TSX, 2-space indent, `StyleSheet.create` at the
bottom, Persian copy in Vazirmatn fonts (`Vazirmatn_400Regular /
_500Medium / _700Bold`), `COLORS` from `../theme`, `hapticLight` from
`../utils/haptics` where presses exist. RTL is forced globally — plain
`flexDirection: 'row'` + `marginLeft` mirrors are fine (see
`CreateCargoScreen` picker rows using `marginLeft: 10`). Icons used in this
plan are all glyph-verified against the installed Ionicons set:
`location-outline`, `flag-outline`, `chevron-back`, `arrow-forward`.

## Commands you will need

Run from the repo root unless a step says `cd mobile`.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Baseline typecheck | `cd mobile && npx tsc --noEmit` | exit 0 (verified clean at plan time) |
| Baseline lint | `cd mobile && npm run lint` | exit 0, 0 errors (13 pre-existing warnings at plan time) |
| Drift grep (param list) | `grep -c "LocationPicker" mobile/App.tsx` | 3 before execution, **5** after Step 1 |
| Drift grep (screens) | `grep -c "S.Screen name=" mobile/App.tsx` | 19 before execution, **20** after Step 1 |
| Final typecheck | `cd mobile && npx tsc --noEmit` | exit 0 |
| Final lint | `cd mobile && npm run lint` | exit 0, 0 errors |
| Scope check | `git status --short` | only the 3 in-scope files (+ `plans/README.md`) |
| Backend untouched | `git diff --stat -- backend/ admin/ webapp/` | empty |

Do NOT start Expo, do NOT run backend tests, do NOT install anything.

## Scope

**In scope** (the only files you should create or modify):

- `mobile/App.tsx` — add `LocationPicker` to `ShipmentStackParamList` + one `S.Screen` in `ShipmentStackScreen`
- `mobile/src/screens/CreateCargoScreen.tsx` — publish-now success dialog after create
- `mobile/src/screens/EditCargoScreen.tsx` — origin/destination picker rows + submit payload
- `plans/README.md` — status row for 041 only

**Out of scope** (do NOT touch, even though they look related):

- Any backend file — the draft/publish contract, `cargo_limit` cap, and role gates stay as-is
- `admin/`, `webapp/` — untouched
- Tab sets / `ROLE_TABS` / `RoleChoiceScreen` — 040 output is locked; user mode does NOT gain a CargoTab
- `LocationPickerScreen.tsx` itself — the registry already works; do not redesign it
- `NotificationsScreen.tsx` deep-links (`navigate('CargoDetail'/'ShipmentDetail')` from the notifications leaf screen) and the `CargoDetailScreen → ShipmentDetail` cross-stack jump — pre-existing navigation-scope gaps in *other* stacks, recorded as follow-ups in Maintenance notes, NOT this plan
- Reverse-geocode address prefill on the pickers (`reverseGeocode` exists in `mobile/src/utils/geocoding.ts`; defer — the backend treats `address` as optional free text)
- Date pickers / calendar library for `pickupAt`/`deliverBy` (YYYY-MM-DD text inputs stay; no new dependency allowed)
- New screens, new navigators, new dependencies

## Design (LOCKED — do not deviate)

1. **Client-only.** Zero backend/admin/webapp diffs are allowed.
2. **Draft→publish handoff.** After `createCargo` resolves, show a native
   `Alert` with two actions: «انتشار» → `publishCargo(created.id)` then
   return to the list; «بعداً» → return to the list leaving the draft.
   Publish failure must NOT lose the created draft — show a second Alert
   saying the draft was saved, then still go back. Drafts remain first-class
   (the dialog copy must mention they are manageable from the «صاحب کالا»
   mode), and must not promise unlimited drafts (the backend cap counts them).
3. **Reuse the existing registry.** `EditCargoScreen` keys its callbacks
   `edit_origin` / `edit_destination` (distinct from `create_*` — the
   registry is a module-global Map keyed by string; a collision would
   silently overwrite the create-screen callback).
4. **No new screens or tabs.** `ShipmentStackParamList` gains exactly one
   route (`LocationPicker`). The submit flow ends at `ShipmentList`.
5. **Persian copy.** Exact strings are pinned in the steps; do not paraphrase.

## Steps

### Step 1: Register `LocationPicker` in the Shipment stack

In `mobile/App.tsx`:

1. Extend `ShipmentStackParamList` to:

```tsx
export type ShipmentStackParamList = {
  ShipmentList: undefined;
  ShipmentDetail: { shipmentId: string };
  CreateCargo: undefined;
  LocationPicker: { mode: 'origin' | 'destination' };
};
```

2. In `ShipmentStackScreen`, add one screen **below** the existing
   `CreateCargo` screen line (keep the 040 comment and everything else):

```tsx
      {/* Plan 041: CreateCargo lives in this stack for §1 users; the
          location picker must be reachable from here too. */}
      <S.Screen name="LocationPicker" component={LocationPickerScreen} />
```

Do not touch `CargoStackScreen`, `ROLE_TABS`, `MainTabs`, or any driver/map
stack.

**Verify**:
`grep -c "LocationPicker" mobile/App.tsx` → **5** (was 3: the two new hits
are the param-list line and the Shipment-stack screen line; the other three
pre-existed — import, Cargo param list, Cargo stack screen) and
`grep -c "S.Screen name=" mobile/App.tsx` → **20** (was 19) and
`cd mobile && npx tsc --noEmit` → exit 0.

### Step 2: CreateCargoScreen — draft→publish handoff

In `mobile/src/screens/CreateCargoScreen.tsx`:

1. Change the import to
   `import { createCargo, publishCargo } from '../services/cargoApi';`
2. Replace the bare success line `navigation.goBack();` (immediately after
   the `createCargo({...})` await) with the handoff below. Keep the
   `await createCargo({...})` call and its arguments byte-identical; capture
   its return value as `created`:

```tsx
      const created = await createCargo({
        // … unchanged arguments …
      });
      Alert.alert(
        'بار ثبت شد',
        'آیا می‌خواهید همین حالا منتشر شود تا رانندگان بتوانند پیشنهاد بدهند؟ پیش‌نویس‌ها بعداً از حالت «صاحب کالا» قابل انتشار هستند.',
        [
          { text: 'بعداً', style: 'cancel', onPress: () => navigation.goBack() },
          {
            text: 'انتشار',
            onPress: () => {
              publishCargo(created.id)
                .then(() => navigation.goBack())
                .catch(() => {
                  Alert.alert(
                    'خطا',
                    'انتشار ممکن نبود؛ بار به‌صورت پیش‌نویس ذخیره شد و از حالت «صاحب کالا» قابل انتشار است.'
                  );
                  navigation.goBack();
                });
            },
          },
        ]
      );
```

(The 6-space statement indent matches the live `handleSubmit` body — the
try-block content in this file sits at 6 spaces, not 4. The `catch`/`finally`
stay untouched: `setLoading(false)` still runs in `finally` before the user
answers the Alert, which is fine — the screen goes back on either action.)

**Verify**:
`grep -c "publishCargo" mobile/src/screens/CreateCargoScreen.tsx` → **2**
(import + call) and
`grep -c "بار ثبت شد" mobile/src/screens/CreateCargoScreen.tsx` → **1** and
`cd mobile && npx tsc --noEmit` → exit 0.

### Step 3: EditCargoScreen — origin/destination pickers

In `mobile/src/screens/EditCargoScreen.tsx`:

1. Add imports (next to the existing ones, matching their order/style):

```tsx
import { registerLocationCallback } from './LocationPickerScreen';
```

2. Add state + picker callback (place directly under the existing
   `const [cargoStatus, setCargoStatus] = useState('');` line for state, and
   next to `toggleSpecial` for the callback):

```tsx
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);
```

```tsx
  const pickLocation = (mode: 'origin' | 'destination') => {
    const key = `edit_${mode}`;
    registerLocationCallback(key, (lat, lng) => {
      if (mode === 'origin') setOrigin({ lat, lng });
      else setDestination({ lat, lng });
    });
    navigation.navigate('LocationPicker' as never, { mode } as never);
  };
```

(Plain arrow function, not `useCallback` — this screen has no other
`useCallback` and `navigation` is already in scope. Match `CreateCargoScreen`'s
registry pattern, but with the `edit_` key prefix.)

3. Prefill inside the load effect — insert after
   `setSpecials(cargo.specialCharacteristics || []);`:

```tsx
        setOrigin({
          lat: cargo.origin.location.coordinates[1],
          lng: cargo.origin.location.coordinates[0],
        });
        setDestination({
          lat: cargo.destination.location.coordinates[1],
          lng: cargo.destination.location.coordinates[0],
        });
```

(GeoJSON order: `coordinates[0]` = lng, `coordinates[1]` = lat — do not
swap them.)

4. Submit payload — inside `handleSubmit`'s `updateCargo(cargoId, {...})`
   object, add two fields (before `dimensions`):

```tsx
        origin: origin
          ? { address: '', location: { type: 'Point', coordinates: [origin.lng, origin.lat] } }
          : undefined,
        destination: destination
          ? { address: '', location: { type: 'Point', coordinates: [destination.lng, destination.lat] } }
          : undefined,
```

(`undefined` fields are dropped by the backend's `pickFields` allowlist —
sending them only when picked is safe; the prefill in (3) means they are
always set in practice.)

5. Picker rows — insert directly **above** the `{/* Title */}` comment block
   (i.e. between the header and the title field), copying the exact row
   structure from `CreateCargoScreen.tsx`:

```tsx
      {/* Origin */}
      <Pressable style={styles.pickerRow} onPress={() => pickLocation('origin')}>
        <Ionicons name="location-outline" size={20} color={COLORS.blue} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.pickerLabel}>مبدأ</Text>
          <Text style={styles.pickerValue}>
            {origin ? `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}` : 'روی نقشه انتخاب کنید'}
          </Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>

      {/* Destination */}
      <Pressable style={styles.pickerRow} onPress={() => pickLocation('destination')}>
        <Ionicons name="flag-outline" size={20} color={COLORS.red} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.pickerLabel}>مقصد</Text>
          <Text style={styles.pickerValue}>
            {destination ? `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}` : 'روی نقشه انتخاب کنید'}
          </Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>
```

6. Styles — add to the `styles = StyleSheet.create({...})` object (copy
   verbatim from `CreateCargoScreen.tsx` styles):

```tsx
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  pickerLabel: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textMid,
  },
  pickerValue: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    marginTop: 2,
  },
```

**Verify**:
`grep -n "registerLocationCallback" mobile/src/screens/EditCargoScreen.tsx` → 2 lines (import + call) and
`grep -c "edit_" mobile/src/screens/EditCargoScreen.tsx` → **1** (the template-literal key line) and
`grep -c "pickerRow" mobile/src/screens/EditCargoScreen.tsx` → **3** (2 usages + 1 style key) and
`cd mobile && npx tsc --noEmit` → exit 0.

### Step 4: Full verification

1. `cd mobile && npx tsc --noEmit` → exit 0
2. `cd mobile && npm run lint` → exit 0, 0 errors (warnings may not exceed the 13 pre-existing; a new warning means stop and re-read your diff)
3. `grep -c "LocationPicker" mobile/App.tsx` → 5
4. `git status --short` → exactly: `M mobile/App.tsx`,
   `M mobile/src/screens/CreateCargoScreen.tsx`,
   `M mobile/src/screens/EditCargoScreen.tsx`, `M plans/README.md` (after the Step-5 row flip)
5. `git diff --stat -- backend/ admin/ webapp/` → empty

## Git workflow

- Stay on `main` (operator policy). No branch, no push.
- Commit 1 (after Steps 1–4 are green):
  `git add mobile/App.tsx mobile/src/screens/CreateCargoScreen.tsx mobile/src/screens/EditCargoScreen.tsx`
  then `git commit -m "feat(041): user request submit flow — picker reach, publish handoff, edit pickers"`
- Commit 2 (after the row flip):
  `git add plans/README.md && git commit -m "chore(041): mark plan DONE in index"`
- Never `git add -A`; never add `.env*` or `.pipeline.lock`.

## plans/README.md row (Step 5)

Flip the 041 row (authoring tick created it as TODO) to:

```
DONE (executed by pipeline)
```

Then commit per the Git workflow. Do not rewrite any other row; 035 stays
DEFERRED.

## Test plan

- No mobile test infra exists (023–040 precedent): `tsc --noEmit` + lint +
  grep gates above are the machine gates.
- Manual QA checklist (operator, emulator/device):
  - user mode → حمل‌ونقل → «ثبت درخواست حمل» → CreateCargo opens in the
    Shipment stack → tap مبدأ → picker opens (this was broken before) →
    confirm → coords shown in the row; same for مقصد.
  - Submit → Alert «بار ثبت شد» → «انتشار» → back on ShipmentList; as a
    driver in another session the cargo appears in matching.
  - Submit → «بعداً» → switch mode to صاحب کالا → CargoTab → the draft is
    there and publishable.
  - صاحب کالا mode → draft → ویرایش → picker rows show the saved coords →
    change مقصد → save → detail shows the new coords.
  - `cargo_limit` submit (cap reached) still shows the 032 Persian copy.

## Done criteria

- [ ] `LocationPicker` registered in the Shipment stack; §1 users can pick مبدأ/مقصد from the 040 CTA flow
- [ ] Create success shows the pinned Alert; «انتشار» publishes; publish failure keeps the draft and says so
- [ ] `EditCargoScreen` shows/prefills/saves origin + destination
- [ ] `npx tsc --noEmit` exit 0; `npm run lint` 0 errors
- [ ] Zero backend/admin/webapp diffs; no new dependencies
- [ ] `plans/README.md` row for 041 is DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts do not match the live files (e.g.
  `ShipmentStackParamList` has no `CreateCargo`, `EditCargoScreen` already
  has picker rows, or `registerLocationCallback` has other users).
- A gate fails twice after a reasonable fix attempt.
- The fix appears to require touching a backend file, adding a dependency,
  adding a new screen, or changing `ROLE_TABS`/tab sets — all forbidden.
- The Alert-based handoff looks wrong on device (e.g. `Alert.alert` with
  two actions does not render on the target platform) — report; do not swap
  in a custom modal in this plan.
- tsc fails with errors in out-of-scope files (cross-plan contamination) —
  fix only trivial one-line pre-existing errors and note them; anything
  bigger, STOP and report the upstream plan.

## Maintenance notes

- **Known remaining navigation-scope gaps (pre-existing, next-slice
  candidates, NOT this plan):** (a) `NotificationsScreen` (a leaf tab
  screen) deep-links `navigate('CargoDetail'/'ShipmentDetail')` — unhandled
  in every mode because no enclosing navigator registers those routes;
  (b) `CargoDetailScreen → ShipmentDetail` cross-stack jump from the Cargo
  stack. A later plan should give the notifications tab its own stack (or
  hoist shared detail routes) — do not patch those ad hoc here.
- Reverse-geocode prefill (`mobile/src/utils/geocoding.ts`
  `reverseGeocode`) can populate `CargoPlace.address` in a later slice;
  the backend already stores free-text addresses.
- Date inputs remain free-text YYYY-MM-DD; a Persian-calendar picker is a
  separate UX slice (needs a dependency decision — none added here).
- Drafts count toward `maxActiveCargoPerOwner` (default 20): the publish
  handoff reduces invisible-draft leakage; the 032 `cargo_limit` copy
  already tells users to cancel old cargo.
- If product later wants a user-mode request history (drafts + cancelled),
  it belongs to the 040-directive's second slice (per-mode home/dashboard
  polish), not this one.

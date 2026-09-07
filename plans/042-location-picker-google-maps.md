# Plan 042: Google Maps-style LocationPickerScreen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

## Operator overrides (unattended pipeline)

- **GIT POLICY**: stay on the current branch (`main`). No branch creation,
  checkout, switch, worktree, or push. Commits: `feat(042): <summary>` for
  the plan's files, then `chore(042): mark plan DONE in index`.
- **TESTS DEFERRED**: never run Jest/npm test, never start dev servers.
  Allowed: `npx tsc --noEmit`, `npm run lint`, grep/search checks.
- **npm install is NOT needed** — this plan adds zero dependencies.
- This plan is **mobile-only** (mobile/ directory). Do NOT touch backend/,
  admin/, or webapp/.

## Status

- **Priority**: P0 (CRITICAL)
- **Effort**: M
- **Risk**: LOW (client-only; zero backend changes)
- **Depends on**: plan 040 (DONE), plan 041 (DONE), 024 (LocationPicker callback pattern)
- **Category**: mobile UX / P0 critical fix
- **Planned at**: 2026-09-07

## Problem

`LocationPickerScreen.tsx` has an invisible marker. The pin is a plain
`<View>` rendered as a child of `<MapLibreMap>`, but MapLibre React Native
renders in a native view — React Native Views placed as children do NOT
appear on the map surface. The screen also lacks:

1. **Search bar** — user must tap blindly on the map to pick a location
2. **GPS/current-location button** — no way to jump to user position
3. **Reverse geocoding** — shows raw `lat, lng` instead of a Persian address
4. **Haptic feedback** — no haptic on tap, confirm, or GPS
5. **Design token usage** — hardcoded font strings (`'Vazirmatn_700Bold'`)
   instead of `font.bold` from theme.ts

## Solution

Rewrite `LocationPickerScreen.tsx` using proven patterns from
`MapCanvas.native.tsx` (ViewAnnotation for markers) and the existing
`SearchBar` component.

### Changes (1 file: `mobile/src/screens/LocationPickerScreen.tsx`)

**1. Fix the invisible marker — use `ViewAnnotation`**

Replace the plain `<View style={styles.marker}>` with MapLibre's
`ViewAnnotation` (same pattern as `MapCanvas.native.tsx` lines 260-271):

```tsx
import { ViewAnnotation } from '@maplibre/maplibre-react-native';
// ...
{selected && (
  <ViewAnnotation id="picker-pin" lngLat={[selected.lng, selected.lat]}>
    <View style={styles.markerPin}>
      <Ionicons name="location" size={20} color={COLORS.white} />
    </View>
  </ViewAnnotation>
)}
```

The marker should be a 40×40 red circle with white location icon, centered
on the tap point (ViewAnnotation anchor is center by default).

**2. Add search bar at top**

Import and render the existing `SearchBar` component from
`../components/SearchBar`. When a search result is selected:
- Set `selected` to the result's lat/lng
- Fly the camera to that location
- Trigger reverse geocoding for the address

```tsx
import SearchBar from '../components/SearchBar';
// Inside the MapLibreMap:
<SearchBar onSelect={handleSearchSelect} />
```

The `handleSearchSelect` callback:
```tsx
const handleSearchSelect = useCallback((lat: number, lng: number) => {
  setSelected({ lat, lng });
  cameraRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 1200 });
  hapticLight();
  reverseGeocode(lat, lng).then(setAddress).catch(() => setAddress(''));
}, []);
```

Add a `cameraRef` to control `Camera`:
```tsx
const cameraRef = useRef<CameraRef | null>(null);
```

**3. Add GPS/current-location FAB**

A circular button on the left side (RTL — the "end" side in RTL is left,
but for FABs we place on the left to mirror the map tab's right-side FABs).
On press: request user location via `useUserLocation`, fly camera there,
set as selected.

```tsx
import { useUserLocation } from '../hooks/useUserLocation';
const { position, request } = useUserLocation();
```

GPS button styling: 44×44 white circle with shadow, `navigate` icon in blue.

**4. Add reverse geocoding for address**

Import `reverseGeocode` from `../utils/geocoding`. When `selected` changes,
fire reverse geocoding (debounced 400ms to avoid flooding Nominatim):

```tsx
const [address, setAddress] = useState('');
const geocodeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

useEffect(() => {
  if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
  if (!selected) { setAddress(''); return; }
  geocodeTimer.current = setTimeout(() => {
    reverseGeocode(selected.lat, selected.lng)
      .then(setAddress)
      .catch(() => setAddress(''));
  }, 400);
  return () => { if (geocodeTimer.current) clearTimeout(geocodeTimer.current); };
}, [selected]);
```

Show address in the bottom bar instead of raw coordinates:
```tsx
{address ? (
  <Text style={styles.addressText} numberOfLines={2}>{address}</Text>
) : selected ? (
  <Text style={styles.coordText}>
    {toPersianDigits(selected.lat.toFixed(5))}, {toPersianDigits(selected.lng.toFixed(5))}
  </Text>
) : (
  <Text style={styles.hintText}>روی نقشه ضربه بزنید</Text>
)}
```

**5. Add haptic feedback**

- `hapticLight()` on map press (pin placement)
- `hapticLight()` on search selection
- `hapticMedium()` on GPS press
- `hapticSuccess()` on confirm button press

```tsx
import { hapticLight, hapticMedium, hapticSuccess } from '../utils/haptics';
```

**6. Use design tokens**

Replace all hardcoded values:
- `'Vazirmatn_700Bold'` → `font.bold`
- `'Vazirmatn_400Regular'` → `font.regular`
- `'Vazirmatn_500Medium'` → `font.medium`
- `12` (border radius) → `radii.lg`
- `shadowColor: '#000', ...` → `...shadows.sm` / `...shadows.md`
- Add missing theme imports: `font, radii, shadows, space`

**7. Smooth camera transitions**

When user taps a point, fly camera smoothly:
```tsx
cameraRef.current?.flyTo({
  center: [lng, lat],
  zoom: 14,
  duration: 800,
});
```

**8. Improve bottom bar layout**

- White card with `radii.xl` top corners and `shadows.lg`
- Address text with `textStyles.body` for the address
- Address shows above the confirm button
- Confirm button uses theme tokens (`COLORS.blue`, `radii.lg`, `font.bold`)
- Height: ~120px from bottom

## STOP conditions

- `npx tsc --noEmit` fails and cannot be fixed within the plan
- Any import from backend/, admin/, or webapp/
- Any modification to files from plans 040/041 (RoleChoiceScreen, role
  constants, picker registrations in App.tsx)

## Verification

1. `npx tsc --noEmit` — must pass clean
2. `grep -c 'ViewAnnotation' mobile/src/screens/LocationPickerScreen.tsx` — ≥ 1
3. `grep -c 'reverseGeocode' mobile/src/screens/LocationPickerScreen.tsx` — ≥ 1
4. `grep -c 'SearchBar' mobile/src/screens/LocationPickerScreen.tsx` — ≥ 1
5. `grep -c 'haptic' mobile/src/screens/LocationPickerScreen.tsx` — ≥ 3
6. `grep -c "font\." mobile/src/screens/LocationPickerScreen.tsx` — ≥ 3
7. `grep -c 'radii\.' mobile/src/screens/LocationPickerScreen.tsx` — ≥ 2
8. No hardcoded `#hex` colors (except inside `StyleSheet` theme tokens)
9. No changes to files outside `mobile/`

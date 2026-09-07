# Plan 046 — Driver stack haptic + design token polish

**Priority:** P1 · **Effort:** M · **Depends on:** 045 · **Status:** TODO

## Goal

Polish all 6 driver-mode screens to match the design system: haptic feedback on
every Pressable, design tokens everywhere (no hardcoded hex/fonts/shadows),
EmptyState component for empty lists, FlatList replacing `.map()` for long
lists, StatusPill for status badges, and press feedback on interactive cards.

## Screens targeted (mobile/ only — no backend changes)

1. `DriverVehiclesScreen` — haptics, FlatList, EmptyState, shadows, radii, font tokens, press feedback
2. `DriverDocumentsScreen` — haptics, FlatList, EmptyState, shadows, radii, font tokens, press feedback
3. `MatchingCargoScreen` — haptics, EmptyState, shadows, radii, font tokens, press feedback
4. `SubmitOfferScreen` — haptics, radii, font tokens, KeyboardAvoidingView, press feedback
5. `DriverOffersScreen` — haptics, FlatList, EmptyState, StatusPill, shadows, radii, font tokens, press feedback
6. `DriverShipmentDetailScreen` — haptics, shadows, radii, font tokens, StatusPill, press feedback

## Changes per screen

### DriverVehiclesScreen
- Import `hapticLight`, `hapticWarning` from `../utils/haptics`
- Import `shadows, radii, space, font, textStyles` from `../theme`
- Import `FlatList` from react-native
- Import `EmptyState` from `../components/ui/EmptyState`
- Wrap every Pressable `onPress` with `hapticLight()` (or `hapticWarning()` for delete)
- Replace `vehicles.map()` with `<FlatList data={vehicles} renderItem={...} keyExtractor={i=>i.id} />`
- Replace `<Text style={styles.emptyText}>...</Text>` with `<EmptyState icon="car-sport-outline" title="..." />`
- Replace inline card shadow (lines 326-331) with `shadows.sm`
- Replace all hardcoded font strings with `font.*` tokens
- Replace `#fff` with `COLORS.white`
- Add `style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}` press feedback on vehicle cards
- Replace hardcoded borderRadius values with `radii.*` tokens

### DriverDocumentsScreen
- Same haptic, FlatList, EmptyState, shadows, radii, font, press feedback pattern
- Replace `.map()` group rendering with FlatList + SectionList (or FlatList with section headers)
- Replace inline empty text with `<EmptyState icon="document-text-outline" title="..." />`
- Replace inline card shadow with `shadows.sm`
- Add press feedback on document cards

### MatchingCargoScreen
- Import hapticLight
- Add `hapticLight()` to filter chip and cargo card Pressables
- Replace `<Text style={styles.emptyText}>...</Text>` with `<EmptyState icon="search-outline" title="..." message="..." />`
- Replace inline card shadow with `shadows.sm`
- Add `style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}` press feedback
- Replace hardcoded fonts/radii with tokens

### SubmitOfferScreen
- Import `KeyboardAvoidingView`, `Platform` from react-native
- Import hapticLight, hapticSuccess
- Wrap ScrollView content in `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>`
- Add `hapticLight()` to picker Pressables, `hapticSuccess()` on submit
- Replace hardcoded fonts/radii with tokens

### DriverOffersScreen
- Import hapticLight, hapticWarning
- Import `FlatList` from react-native
- Import `EmptyState`, `StatusPill` from components/ui
- Replace offers `.map()` with `<FlatList>`
- Replace inline statusBadge with `<StatusPill label={...} color={...} />`
- Replace empty text with `<EmptyState icon="paper-plane-outline" title="..." />`
- Replace inline card shadow with `shadows.sm`
- Add `hapticWarning()` on withdraw Pressable
- Add press feedback on cards

### DriverShipmentDetailScreen
- Import hapticLight, hapticSuccess, hapticWarning
- Import `StatusPill`, `shadows`, `radii`, `font`, `textStyles` from theme
- Replace inline statusBadge with `<StatusPill>`
- Replace inline card shadow with `shadows.sm`
- Add `hapticLight()` on transition buttons, `hapticSuccess()` on event add, `hapticWarning()` on destructive transitions
- Add press feedback on transition buttons and event type pickers
- Replace hardcoded fonts with `font.*` tokens

## Hard rules

- ✅ Target mobile/ only — zero backend/admin/webapp changes
- ✅ All design tokens from theme.ts — no hardcoded hex, fonts, spacing, or radii
- ✅ RTL-aware: borderRight for directional emphasis
- ✅ `tsc --noEmit` must pass
- ✅ One commit
- ✅ ≤ 200 lines changed per file (polish-only)

## Verification

1. `cd mobile && npx tsc --noEmit` — must pass
2. `cd mobile && npx eslint src/screens/Driver*Screen.tsx src/screens/MatchingCargoScreen.tsx src/screens/SubmitOfferScreen.tsx --max-warnings=0` (or equivalent)
3. No files outside `mobile/` modified

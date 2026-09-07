# Plan 046 — Driver Stack Haptic + Design Token Polish

## Goal
Polish the five driver-tab screens with haptic feedback, the shared `EmptyState` component, design tokens from `theme.ts`, and proper `FlatList` usage. These screens currently have hardcoded shadow values, missing haptics, and plain-text empty states.

## Screens touched (mobile/ only)

1. **DriverVehiclesScreen** — `vehicles.map()` → `FlatList`, add `hapticLight` on Pressables, `EmptyState` for empty list, use `shadows.sm`/`radii.lg`/`font.*` tokens
2. **DriverDocumentsScreen** — `Object.entries(grouped).map()` → keep grouped layout but wrap doc cards in FlatList per group OR keep ScrollView (grouped render is non-trivial to FlatList-ize — keep as-is but fix tokens + haptics + EmptyState)
3. **MatchingCargoScreen** — `cargo.map()` → `FlatList`, add `hapticLight` on filter chips and cargo cards, `EmptyState` with search icon
4. **SubmitOfferScreen** — add `KeyboardAvoidingView` wrapper, `hapticLight` on vehicle picker chips, `hapticSuccess` on successful submit, `hapticWarning` on validation errors, use design tokens for form card/buttons
5. **DriverOffersScreen** — `offers.map()` → `FlatList`, add `hapticLight` on offer cards, `hapticWarning` on withdraw confirm, `EmptyState` with pricetag icon

## Changes per screen

### DriverVehiclesScreen
- Import `hapticLight`, `hapticMedium` from `../utils/haptics`
- Import `shadows`, `radii`, `font`, `space` from `../theme`
- Import `EmptyState` from `../components/ui/EmptyState`
- Add `hapticLight()` to add-button Pressable
- Add `hapticMedium()` to delete confirm onPress
- Add `hapticLight()` to vehicle-type picker chips
- Replace `vehicles.map()` body with `<FlatList data={vehicles} keyExtractor={...} renderItem={...} />` (keep the ScrollView for the form above — use FlatList's `ListHeaderComponent` for header + form)
- Actually: convert the outer `ScrollView` to a `FlatList` with `ListHeaderComponent` containing header + add button + form, and `ListEmptyComponent` with `<EmptyState icon="car-outline" title="هنوز وسیله‌ای ثبت نشده" message="وسیله نقلیه خود را ثبت کنید" />`
- Replace hardcoded shadows in `card` style with `...shadows.sm`
- Replace `borderRadius: 12` / `10` with `radii.lg` / `radii.md`
- Replace `fontFamily: 'Vazirmatn_700Bold'` with `fontFamily: font.bold`
- Replace `fontFamily: 'Vazirmatn_500Medium'` with `fontFamily: font.medium`
- Replace `fontFamily: 'Vazirmatn_400Regular'` with `fontFamily: font.regular`

### DriverDocumentsScreen
- Same import additions as above
- Add `hapticLight()` to add-button, kind picker chips, vehicle picker chips, view button
- Add `hapticWarning()` to delete confirm
- Keep grouped ScrollView layout (groups by doc kind — FlatList doesn't handle this cleanly)
- Add `<EmptyState icon="document-text-outline" title="هنوز سندی ثبت نشده" message="اسناد مورد نیاز خود را بارگذاری کنید" />` as empty state
- Replace hardcoded shadow/style values with tokens

### MatchingCargoScreen
- Convert `ScrollView` → `FlatList` with `ListHeaderComponent` (header + filter row) and `ListEmptyComponent` with `<EmptyState icon="search-outline" title="باری یافت نشد" message="بار جدیدی برای پیشنهاد وجود ندارد" />`
- Add `hapticLight()` to filter chips and cargo card press
- Use `shadows.sm`, `radii.lg`, `font.*` tokens

### SubmitOfferScreen
- Wrap in `KeyboardAvoidingView` (Platform.OS === 'ios' ? 'padding' : 'height')
- Add `hapticLight()` to vehicle picker chips
- Add `hapticSuccess()` after successful `createOffer` (before Alert)
- Add `hapticWarning()` on validation errors
- Use `shadows.sm`, `radii.lg`, `font.*` tokens on cargo info card and form elements

### DriverOffersScreen
- Convert `ScrollView` → `FlatList` with header and `ListEmptyComponent`: `<EmptyState icon="pricetag-outline" title="هنوز پیشنهادی ارسال نکرده‌اید" message="از فهرست بار، پیشنهاد خود را ثبت کنید" />`
- Add `hapticLight()` to offer card press (if tappable) and `hapticWarning()` to withdraw button
- Use `shadows.sm`, `radii.lg`, `font.*` tokens

## Constraints
- Only `mobile/src/` touched — zero backend/admin/webapp changes
- No hardcoded colors (#hex), fonts, spacing, or radii — all from theme.ts
- RTL: use `flexDirection: 'row'`, `borderRight` for emphasis borders
- Each card uses `...shadows.sm` from theme
- `tsc --noEmit` must pass after changes
- One commit
- Do not touch 040/041 files (RoleChoiceScreen, role constants, picker registrations)

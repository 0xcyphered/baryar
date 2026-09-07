# Plan 043 — ProfileScreen polish: logout confirmation, haptics, design tokens

**Priority:** P0 (critical)
**Effort:** S
**Depends on:** 042 (design tokens from theme.ts available)
**Mobile-only:** yes — `mobile/src/screens/ProfileScreen.tsx` only

## Goal

Make ProfileScreen production-ready: safe logout with confirmation dialog,
haptic feedback on every interactive element, consistent design-token usage,
and polished card styling.

## Changes (single file: ProfileScreen.tsx)

### 1. Logout confirmation dialog + hapticWarning

- Import `hapticWarning` from `../utils/haptics`.
- Replace the direct `onPress={signOut}` on the logout button with a handler
  that calls `hapticWarning()` then `Alert.alert()` with:
  - Title: "خروج از حساب"
  - Message: "آیا مطمئن هستید؟"
  - Confirm button (destructive style): calls `signOut()`
  - Cancel button (cancel style): no-op

### 2. Haptic feedback on every Pressable

- `handleSave` (after `await updateProfile` succeeds): call `hapticSuccess()`.
- Back button Pressable: call `hapticLight()` on press.
- Edit profile button Pressable: call `hapticLight()` on press.
- Cancel edit Pressable: call `hapticLight()` on press.
- Save button Pressable: already fires `handleSave` which will add haptic.
- Support phone Pressable: call `hapticLight()` on press.
- Role rows already have `hapticLight()` — keep as-is.

### 3. Design token cleanup (no hardcoded values)

- Header title: replace `'Vazirmatn_700Bold'` → `font.bold`, `fontSize: 18` →
  use `textStyles.h2.fontSize`.
- userName/userPhone: replace raw fontFamily strings → `font.bold` / `font.regular`.
- Info card section: `borderRadius: 12` → `radii.lg`, add `shadows.sm`.
- Role section card: `borderRadius: 12` → `radii.lg`, add `shadows.sm`.
- Role rows: `borderRadius: 12` → `radii.md`.
- Edit button: `borderRadius: 12` → `radii.lg`.
- Edit section: `borderRadius: 12` → `radii.lg`.
- Edit input: `borderRadius: 12` → `radii.md`.
- Save button: `borderRadius: 10` → `radii.md`, `color: '#fff'` → `COLORS.white`.
- Cancel button: `borderRadius: 10` → `radii.md`.
- Support row: `borderRadius: 12` → `radii.lg`, add `shadows.xs`.
- Logout button: `borderRadius: 12` → `radii.lg`.
- Info row labels: replace `Vazirmatn_400Regular` → `font.regular`,
  `Vazirmatn_500Medium` → `font.medium`.
- All `fontSize: 15, fontFamily: 'Vazirmatn_700Bold'` → `textStyles.h3.fontSize`
  etc.

### 4. Press feedback on card Pressables

- Logout button: add `pressed && { opacity: 0.85 }` feedback.
- Edit button: add `pressed && { opacity: 0.85 }` feedback.
- Support row: add `pressed && { opacity: 0.85 }` feedback.

### 5. Import updates

- Add `font`, `radii`, `shadows`, `space`, `textStyles` to theme import.
- Add `hapticWarning`, `hapticSuccess` to haptics import.

## NOT changed

- Role selection (040) — untouched.
- Navigation / screen props — untouched.
- Backend — untouched.
- Other screens — out of scope.

## Verification

1. `cd mobile && npx tsc --noEmit` — must pass.
2. Visual check: logout shows Alert dialog, no direct logout.
3. Haptics fire on every Pressable.
4. No hardcoded hex colors, font families, radii, or spacing in the file.

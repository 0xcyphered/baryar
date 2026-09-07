# Plan 044 — DriverOnboardingScreen polish: back button, keyboard-avoiding, validation

**Priority:** P1 (high)
**Effort:** S
**Depends on:** 042 (design tokens available)
**Mobile-only:** yes — `mobile/src/screens/DriverOnboardingScreen.tsx`

## Goal
Fix critical UX gaps in the driver onboarding form: add a back button (currently
missing — users are stuck), wrap in KeyboardAvoidingView, and add inline
real-time validation for all fields.

## Changes

### 1. Add back navigation button
- Add `onBack` prop to the screen component.
- Render a back Pressable in the header (same pattern as ProfileScreen).
- Call `hapticLight()` on press.

### 2. KeyboardAvoidingView
- Wrap the scroll content in `KeyboardAvoidingView` with
  `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`.

### 3. Inline validation
- Add a `errors` state object keyed by field name.
- Validate on blur (not just on submit):
  - `name`: required, min 2 chars
  - `nationalId`: required, exactly 10 digits
  - `vehicleType`: required
  - `plateNumber`: required, min 5 chars
  - `capacity`: required, must be a positive number
- Show red error text under each invalid field using `textStyles.caption`.
- On submit, validate all fields first; only proceed if clean.

### 4. Haptics on all Pressables
- Back button: `hapticLight()`
- Submit button: `hapticMedium()` (destructive/form submit)
- Vehicle type selector rows: `hapticLight()`

### 5. Design token cleanup
- Replace any hardcoded fontFamily, borderRadius, spacing with theme tokens.
- Use `shadows.sm` on card surfaces, `radii.lg` on cards, `radii.md` on inputs.
- Use `COLORS.*` for all colors (already mostly done — verify).

### 6. Press feedback
- Submit button: `pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }`
- Back button: `pressed && { opacity: 0.7 }`

## Files touched
- `mobile/src/screens/DriverOnboardingScreen.tsx` (only)

## NOT changed
- Backend — untouched.
- Other screens — out of scope.
- 040/041 files — untouched.

## Verification
1. `cd mobile && npx tsc --noEmit` — must pass.
2. Visual: back button visible, form scrolls above keyboard, errors show on blur.

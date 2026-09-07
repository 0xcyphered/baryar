# Plan 045 — OtpVerifyScreen: auto-submit + resend timer

**Priority:** P1 (high)
**Effort:** S
**Depends on:** 043 (design tokens/haptics baseline)
**Mobile-only:** yes — `mobile/src/screens/OtpVerifyScreen.tsx`

## Goal
Premium OTP verification UX: auto-submit when 6 digits entered (no tap needed),
working 60-second resend timer with countdown, and haptic feedback on every
interaction. The current screen has a static hint ("try after 60 seconds") but
no actual timer — users have no idea when they can resend.

## Changes

### 1. Auto-submit on 6 digits
- In `onChangeText`, when `t.length === 6`, call `handleVerify()` after a
  300ms delay (brief pause so the user sees all dots fill before loading).
- Use a `useRef(autoSubmitTimer)` to debounce — if user clears and re-types
  within 300ms, cancel the pending auto-submit.
- Add `hapticSuccess()` when auto-submit triggers (positive feedback: code
  accepted for submission).

### 2. Resend timer (60-second countdown)
- Add `useEffect` that starts a 60-second countdown when the screen mounts
  AND after each successful resend.
- Store `secondsLeft` state; decrement every 1s via `setInterval`.
- When `secondsLeft > 0`: show a clickable-but-dimmed "ارسال مجدد" (resend)
  button with the countdown in parentheses — e.g. "ارسال مجدد (۴۵)".
- When `secondsLeft === 0`: show a fully active "ارسال مجدد" button.
- On resend press: call `requestOtp(phone)`, reset timer to 60, show brief
  success toast text ("کد جدید ارسال شد"), `hapticMedium()`.
- Replace the static `hint` text with the dynamic resend button.

### 3. Haptics
- Back button: `hapticLight()`
- Verify button (manual press): `hapticMedium()`
- Auto-submit trigger: `hapticSuccess()`
- Resend button press: `hapticMedium()`

### 4. Design token cleanup
- Replace the static `hint` style with the new resend button style.
- Ensure all fonts/radii use theme tokens (already compliant — verify only).

### 5. Edge cases
- If auto-submit fails (error returned), clear the code input so user can
  re-enter. Show error below dots (existing pattern).
- Disable the resend button while timer is running and during a resend API
  call (prevent double-tap).
- Clean up the `setInterval` and any pending auto-submit timer on unmount.

## Files touched
- `mobile/src/screens/OtpVerifyScreen.tsx` (only)

## NOT changed
- Backend — untouched.
- Other screens — out of scope.
- 040/041 files — untouched.

## Verification
1. `cd mobile && npx tsc --noEmit` — must pass.
2. Auto-submit: type 6 digits → 300ms pause → loading spinner → verify call.
3. Resend timer: button shows countdown, goes active at 0, press resends code.
4. Haptics fire on back, verify, resend, and auto-submit.

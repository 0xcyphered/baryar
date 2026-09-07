# 045 — OtpVerifyScreen: Auto-Submit on 6 Digits + 60 s Resend Timer

## Scope

Mobile-only (`mobile/`). Enhance `OtpVerifyScreen.tsx` with two UX improvements
that bring the OTP experience closer to mainstream apps (WhatsApp, Telegram).

## Changes (single file: `mobile/src/screens/OtpVerifyScreen.tsx`)

### 1. Auto-submit on 6 digits
- Add `useRef<TextInput>` to control the hidden input programmatically.
- On `onChangeText`, if `trimmed.length === 6`, immediately call `handleVerify()`.
- Add brief visual feedback: fill all 6 dots, then trigger the verify after a
  200 ms delay (allow the user to see the last dot light up before the spinner).

### 2. 60-second resend countdown
- Add `useEffect`-based countdown state: `resendSeconds` (starts at 0 after first
  request or when `onSent` was called — but in this screen the request was already
  sent by the previous screen).
- When the screen mounts, start the 60 s countdown immediately.
- While `resendSeconds > 0`, show a greyed-out countdown hint:
  `({resendSeconds}s) کدی دریافت نکردید؟`.
- When countdown hits 0, show a tappable `«ارسال مجدد کد»` text button.
- Pressing resend calls `signIn(phone)` (from AuthContext, which calls `requestOtp`)
  then resets the countdown to 60.
- Add `hapticLight()` on resend tap; `hapticSuccess()` on successful resend
  confirmation; `hapticWarning()` if resend is rate-limited.

### 3. Haptics audit
- `hapticLight()` on each dot fill (already handled by auto-submit flow).
- `hapticSuccess()` on successful OTP verify (call before `verifyOtp` navigation).
- `hapticWarning()` on error states (otp_invalid, otp_locked, account_blocked).
- Keep existing `hapticLight()` on the back button press.

### 4. Design tokens
- Replace any remaining hardcoded values with theme tokens.
- Resend button text uses `COLORS.blue` + `font.medium`.
- Countdown text uses `COLORS.textLight` + `font.regular`.

## Files touched
- `mobile/src/screens/OtpVerifyScreen.tsx` (rewrite the component body)

## Files NOT touched
- `backend/`, `admin/`, `webapp/`, `tests/`

## Verification
1. `tsc --noEmit` in `mobile/` must pass.
2. Manual: type 6 digits → auto-submits after 200 ms.
3. Manual: wait 60 s → resend link appears, tap triggers new OTP.
4. Manual: error shows red text + haptic warning.

# Plan 050 — Mobile 3-role model

**Priority:** P0-B (operator directive)  
**Scope:** Client-only (mobile/)  
**Depends on:** 049 (transport_company in backend ROLES)  
**Risk:** Type errors if any file references `'user'` role after removal

## Goal

Replace the 4-role model (`user` / `cargo_owner` / `driver`) with the
corrected 3-role model (`cargo_owner` / `driver` / `transport_company`).
The old `user` role is merged into `cargo_owner` per operator directive.

## Changes

### 1. `mobile/src/types.ts`
- `AppRole` union: `'cargo_owner' | 'driver' | 'transport_company'` (remove `'user'`)

### 2. `mobile/src/utils/constants.ts`
- `ROLE_META`: remove `user` key, add `transport_company`
  - label: `'شرکت حمل و نقل'`
  - tagline: `' مدیریت ناوگان حمل و نقل و ارسال بار'`
  - icon: `'briefcase-outline'`
  - color: `COLORS.amber`
  - tint: amber tint
- `APP_ROLE_ORDER`: `['cargo_owner', 'driver', 'transport_company']`
- `ACTIVE_ROLE_LABEL`: replace `user` → add `transport_company: 'حالت شرکت حمل و نقل'`

### 3. `mobile/App.tsx` — ROLE_TABS
- Remove `user` entry
- Add `transport_company: ['MapTab', 'CargoTab', 'ShipmentsTab', 'NotificationsTab']`
  (company reuses cargo + shipments + notifications tabs initially)

### 4. `mobile/src/context/AuthContext.tsx`
- `VALID_ROLES`: `['cargo_owner', 'driver', 'transport_company']`

### 5. No changes needed
- `RoleChoiceScreen.tsx` — iterates `APP_ROLE_ORDER` dynamically; no hardcoded roles
- `ProfileScreen.tsx` — references `'driver'` and `'admin'` backend roles, not AppRole
- `ShipmentListScreen.tsx` — references `'cargo_owner'` backend role, not AppRole

## Verification
- `cd mobile && npx tsc --noEmit` — must pass with zero errors
- No backend changes

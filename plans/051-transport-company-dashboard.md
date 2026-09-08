# Plan 051 — Transport company placeholder dashboard

**Priority:** P0-C (operator directive)
**Scope:** Client-only (mobile/)
**Depends on:** 050 (3-role model, transport_company tab)
**Risk:** tsc failure if new tab name not added to all Record types

## Goal

Add a dedicated "شرکت" (Company) tab for the `transport_company` role with
a premium dashboard: profile info, fleet overview placeholder, and
"coming soon" cards for fleet management. No backend company API exists —
all data comes from the existing `useAuth().user` profile.

## Changes

### 1. `mobile/src/screens/CompanyDashboardScreen.tsx` (NEW)

New screen file (~180 lines), matching the premium design system:

- **Header**: SafeArea-aware, shows "شرکت حمل و نقل" title + user profile icon
- **Profile card**: company name (from `user.name`), phone number, amber-tinted
  icon circle using `ROLE_META.transport_company` colors
- **Fleet overview card**: placeholder with truck icon, "ناوگان فعال: به‌زودی" text
- **Quick action grid** (2×2):
  - مدیریت ناوگان (fleet) — briefcase icon → coming soon toast
  - مدیریت رانندگان (drivers) — people icon → coming soon toast
  - گزارش سفرها (reports) — chart icon → coming soon toast
  - تنظیمات شرکت (settings) — settings icon → coming soon toast
- All cards: `shadows.sm`, `radii.lg`, `COLORS.white` bg, `borderRight` accent
- All Pressables: `hapticLight`, `pressed && { opacity: 0.9 }` feedback
- KeyboardAvoidingView not needed (no form inputs)
- RTL: all layout uses `flexDirection: 'row'` (RTL auto-flips) + `textAlign: 'right'`

Uses: `useAuth` for user data, `useSafeAreaInsets`, `Ionicons`,
`COLORS`/`font`/`space`/`radii`/`shadows` from theme.ts, `hapticLight`.

### 2. `mobile/App.tsx` — navigation wiring

- **Import** `CompanyDashboardScreen` from new file
- **`MainTabParamList`**: add `CompanyTab: undefined`
- **`ROLE_TABS`**: update transport_company to:
  `['MapTab', 'CompanyTab', 'CargoTab', 'ShipmentsTab', 'NotificationsTab']`
- **`TAB_CONFIG`**: add `CompanyTab: { label: 'شرکت', icon: 'business-outline' }`
- **`TAB_COMPONENTS`**: add `CompanyTab: CompanyDashboardScreen`

No stack nesting needed — CompanyDashboard is a leaf screen (no sub-screens
in the placeholder). If sub-screens are added later, wrap in a stack like
DriverStackScreen.

### 3. `plans/README.md`

Mark row 051 as DONE with execution date + commit note.

## Files touched

| File | Action |
|------|--------|
| `mobile/src/screens/CompanyDashboardScreen.tsx` | CREATE |
| `mobile/App.tsx` | EDIT (import + 4 additions) |
| `plans/README.md` | EDIT (status) |

## Verification

- `cd mobile && npx tsc --noEmit` — zero errors
- Visual: transport_company role shows 5 tabs, "شرکت" tab shows dashboard
- CargoTab, ShipmentsTab, NotificationsTab unchanged for transport_company
- No backend changes

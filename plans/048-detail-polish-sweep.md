# Plan 048 — P2 polish sweep: detail screens + list labels + pipeline hygiene

## Context

Pipeline run 2026-09-08, following 047. Focus list state after 042–047:

- P0 done (042 LocationPicker Google-Maps-style, 043 ProfileScreen), P1 mostly done
  (044 onboarding, 045 OtpVerify, 046 driver stack, 047 CargoForm dedupe).
- Remaining from the user's P1/P2 focus list:
  - **P1 App.tsx**: stack navigators have no per-screen animation; RTL context wants
    `animation: 'slide_from_right'` (slide toward the right = "forward" in RTL feel).
  - **P2 CargoDetailScreen / ShipmentDetailScreen / DriverShipmentDetailScreen**:
    no pull-to-refresh; haptics missing on action buttons.
  - **P2 OffersScreen** shows raw `userId` for the driver; **P2 ShipmentListScreen**
    shows raw `cargoId`. Shipment payloads now include `cargo` (047 backend client),
    so lists can show real titles.
  - **Pipeline hygiene finding from 047**: README gains stray `|` prefixes at line
    starts on every pipeline edit (notepad-style append artifact). 047's check
    method confirms files are correct on disk; the artifact is cosmetic but recurs
    — add a `sed -i 's/^||*/|/'` normalize step to the pipeline checklist.
- Backend payload note (047 client work): list/detail responses embed the related
  document: `Shipment.cargo: { _id, title, ... }`, `Offer.driver: { _id, name, ... }`.
  Mobile types already declare these fields (optional) — no type changes needed.

## Constraints recap (hard)

- mobile/ only. Backend/admin/webapp untouched.
- tsc --noEmit clean before commit.
- Theme tokens only (COLORS/font/radii/shadows/space/textStyles); zero hardcoded
  hex, font names, spacing numbers, radii numbers.
- RTL: `borderRight` for directional emphasis; flexDirection row for auto RTL.
- Rule 9: do not touch 040/041 files (RoleChoiceScreen, role constants, the picker
  registrations in App.tsx). Animation keys are added to OTHER screens' options
  only; registration lines for LocationPicker/RoleChoice remain untouched.
- One commit per plan execution.

## Changes

### 1. App.tsx — slide_from_right on stack screens (P1)

For every `Stack.Screen` in the root stack EXCEPT the ones registered by 040/041
(RoleChoice, LocationPicker — leave those option objects untouched), add
`animation: 'slide_from_right'` to `options`. Tab navigators are untouched.
If a screen already has options, merge the key in; do not restructure.

### 2. CargoDetailScreen — pull-to-refresh + haptics (P2)

- Convert the data loader into a reusable `load()` (useCallback) and wire
  `RefreshControl` on the ScrollView (colors from COLORS.blue, tintColor
  COLORS.blue, refreshing state from a `refreshing` useState).
- `hapticLight()` on open action rows; `hapticSuccess()` after a successful
  action; `hapticWarning()` on destructive confirms.
- Keep all existing copy/logic; no behavior change beyond feedback + refresh.

### 3. ShipmentDetailScreen + DriverShipmentDetailScreen — same treatment (P2)

- Pull-to-refresh with RefreshControl wired to the existing fetch effect
  (extract to `load()`).
- hapticLight on secondary actions, hapticSuccess on accept/advance/complete
  style actions. No logic changes.

### 4. OffersScreen — driver name, not raw userId (P2)

- Read `offer.driver` from the payload (optional chaining + string fallback):
  `offer.driver?.name || offer.driver?.phone || shortId(offer.userId)` where
  `shortId` renders the first 6 chars + '…'. Persian label prefix `راننده: `.
- Keep the card layout; only the name line changes. Haptic on card press if a
  Pressable exists.

### 5. ShipmentListScreen — cargo title, not raw cargoId (P2)

- Same pattern: `item.cargo?.title || shortId(item.cargoId)`. Fallback shows
  `بار #<6 chars>`.
- Card press gets hapticLight if not already present.

### 6. Empty-state + card audit (P2, light)

- Any screen in this batch still rendering a hand-rolled "no data" Text: swap to
  the shared `EmptyState` component (icon per screen: offers→hand-left,
  shipments→cube). If a screen already uses EmptyState, skip.
- Cards use `shadows.sm`, `radii.lg` from theme — fix any stragglers in the
  touched files only.

## Out of scope

- Backend payload shapes (types already optional — verified 047).
- 040/041-registered screens' options (rule 9).
- MatchingCargo/SubmitOffer/DriverOffers haptics already done in 046.

## Verification

1. `cd mobile && npx tsc --noEmit` → clean.
2. `grep -rn "#[0-9a-fA-F]\{3,8\}" mobile/src/screens mobile/src/components/ui`
   → only pre-existing matches (042 LocationPicker lint debt, documented in 046).
   No NEW hex in touched files: `git diff | grep '^+.*#[0-9a-fA-F]\{6\}'` → empty.
3. README status update, single commit:
   `feat(048): detail screens pull-to-refresh + haptics, list labels, stack slide animation`
4. Commit README separately right after, then release lock.

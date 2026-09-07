# Plan 047 — Shared CargoForm component (Create/Edit cargo dedupe)

Priority: P1 · Effort: M · Depends on: 046 · Target: mobile/ ONLY
Directive source: operator focus list — "EditCargoScreen: Deduplicate with CreateCargoScreen — extract shared CargoForm component"

## Problem

`EditCargoScreen.tsx` (453 LOC) is a second, drifting copy of `CreateCargoScreen`'s form:

1. **Design-token violations**: 8 hardcoded `'Vazirmatn_500Medium'`/`'Vazirmatn_700Bold'`/`'Vazirmatn_400Regular'` font strings, raw paddings/radii (12/14/16), inline shadow blob, hardcoded `'#fef2f2'` error background. Rule 5 says tokens only.
2. **No haptics** anywhere in Edit (directive: every screen uses haptic feedback).
3. **No press feedback** on chips/picker rows (directive: all cards press opacity/scale).
4. **No KeyboardAvoidingView** on either form (directive: all forms keyboard-avoiding).
5. Duplicated constants: `TRANSPORT_MODES`, `SPECIALS`, chip grids, dim grid, FieldLabel — already drifting (Edit date placeholder `YYYY-MM-DD` vs Create's Persian `مثال: 1404/06/15`; coordinate precision `.toFixed(4)` vs `.toFixed(3)`).

## Approach

New file **`mobile/src/components/CargoForm.tsx`** — one presentational, controlled form used by BOTH screens. Screens remain state owners (load/save logic stays put).

### CargoForm props (controlled)

```ts
type Dimensions = { weightKg: string; volumeM3: string; lengthCm: string; widthCm: string; heightCm: string };
interface CargoFormProps {
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  onPickLocation: (mode: 'origin' | 'destination') => void;
  title: string;               onTitle: (v: string) => void;
  description: string;         onDescription: (v: string) => void;
  transportMode: string;       onTransportMode: (v: string) => void;
  dimensions: Dimensions;      onDimensions: (d: Dimensions) => void;
  specials: string[];          onToggleSpecial: (s: string) => void;
  pickupAt: string;            onPickupAt: (v: string) => void;
  deliverBy: string;           onDeliverBy: (v: string) => void;
}
```

### What moves into CargoForm (verbatim from CreateCargoScreen)

- `LocationPickerRow` ×2 (blue origin / red destination, connector line) — **hapticLight** on press, pressed opacity 0.85. Coordinate display unified to `.toFixed(4)`.
- Transport-mode chip row — active = `COLORS.blue`, **hapticLight** on select, pressed opacity.
- Dimensions grid (5 numeric inputs, unit suffix kg/m³/cm) — Create's richer unit-suffix layout wins.
- Specials chip row — active = red accent (`COLORS.red` on `COLORS.redTint`, mirroring Create), **hapticLight** on toggle (call stays in screen via `onToggleSpecial`).
- Date inputs with unified Persian placeholder `مثال: 1404/06/15`.
- `FieldLabel` helper (text + optional hint) — move here, export if screens still need it.
- Section cards (`sectionCard` style: white, `radii.xl`, `shadows.sm`) + section titles with emoji headers.
- All text inputs get `textAlign="right"` for Persian RTL.

### Screen changes

**CreateCargoScreen** (~629 → ~350 LOC):
- Delete extracted sections/styles; render `<CargoForm {...wired} />` between its own header/step-indicator and error/submit.
- Add `KeyboardAvoidingView` (`behavior: 'padding'` iOS / `'height'` Android) wrapping the ScrollView.

**EditCargoScreen** (~453 → ~280 LOC):
- Same CargoForm wiring.
- Add `KeyboardAvoidingView` (same pattern).
- Full token migration: `Vazirmatn_500Medium` → `font.medium`, `Vazirmatn_700Bold` → `font.bold`, `Vazirmatn_400Regular` → `font.regular`; paddings/margins → `space[.]`; radii → `radii.lg`; shadow blob → `shadows.sm`; `'#fef2f2'` → `COLORS.redTint`; error box gains icon + `COLORS.red` text like Create.
- Haptics: `hapticLight` on all Pressables handled inside CargoForm; on successful save call `hapticSuccess()` before `navigation.goBack()`; on submit-start keep existing flow (no validation exists — origin/destination are preloaded).
- Submit button: pressed feedback (`opacity` + `scale 0.98`) matching Create; keep `saving` spinner text swap.

## Files

1. NEW `mobile/src/components/CargoForm.tsx` (~230 LOC) — form sections + FieldLabel + LocationPickerRow; tokens only from `../theme`; haptics from `../utils/haptics`.
2. `mobile/src/screens/CreateCargoScreen.tsx` — remove extracted code, wire props, add KeyboardAvoidingView.
3. `mobile/src/screens/EditCargoScreen.tsx` — same wiring + token migration + hapticSuccess on save + press feedback + KeyboardAvoidingView.

## Constraints check

- mobile/ only — no backend/, admin/, webapp/, tests/ files. ✓
- `mobile/App.tsx` untouched (040/041 registration rule). ✓
- Zero hardcoded colors/fonts/radii/spacing in the 3 files (tokens from theme.ts). ✓
- RTL: chip/row layouts use `flexDirection: 'row'` (auto-RTL); no new borderLeft. ✓
- One commit; `tsc --noEmit` must pass before it. ✓

## Verification

1. `cd mobile && npx tsc --noEmit` → exit 0.
2. `grep -rn "Vazirmatn_" mobile/src/screens/CreateCargoScreen.tsx mobile/src/screens/EditCargoScreen.tsx mobile/src/components/CargoForm.tsx` → no matches.
3. `grep -nE "#[0-9a-fA-F]{3,6}"` on the 3 files → no matches (theme.ts untouched).
4. `git diff --stat` → exactly the 3 mobile files.
5. Commit `feat(047): shared CargoForm — dedupe Create/Edit, theme tokens, haptics, keyboard-avoiding`; then README status DONE + release lock (separate commit allowed).

## STOP conditions

- If extraction breaks `tsc` unfixably within the slice: revert the CargoForm extraction, commit only the EditCargoScreen token/haptics/KAV fixes, note the follow-up in README.
- If CargoForm needs state beyond the props above (e.g. step-indicator coupling): keep the step indicator screen-side computing from props — do NOT push navigation or API logic into the component.
- Never touch `mobile/App.tsx` navigator registrations.

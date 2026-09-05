# Plan 034: Extract shared mobile constants and navigation types (review-driven cleanup)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> This plan is a **pure refactor**: no behavior change is permitted. Every
> extracted constant must be byte-identical to what it replaces in each
> screen. If two screens disagree on the same constant, STOP and report the
> divergence instead of picking a winner.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (mechanical breadth; easy to break typecheck if rushed)
- **Depends on**: plans/031 (mobile screens stable), plans/032 (notification meta landed). Both should be DONE or this plan runs after them.
- **Category**: architecture cleanup (from the 2026-09-04 code review — mobile finding #17 + #14)
- **Planned at**: commit `114fa9a`, 2026-09-05

## Why this matters

The 2026-09-04 code review scored the mobile app 7/10 with two systemic
maintainability findings:

- **#17 (MED)**: `STATUS_LABELS`, `STATUS_COLORS`, `MODE_LABELS`,
  `SPECIAL_LABELS`, `EVENT_TYPE_LABELS`, `EVENT_ICONS`, `formatId`,
  `formatCoord` are copy-pasted across 5+ screen files. A label fix must
  touch many files; drift has already happened between screens.
- **#14 (MED)**: every navigation call is
  `navigation.navigate('ScreenName' as never, params as never)` because no
  `RootStackParamList` exists — TypeScript cannot check route names or
  params.

This plan does **only the extraction + typing**. UI redesigns are out of
scope.

## Current state (verify each excerpt before extracting)

Run first:

```bash
cd mobile && grep -rn "STATUS_LABELS\|STATUS_COLORS\|MODE_LABELS\|SPECIAL_LABELS\|EVENT_TYPE_LABELS\|EVENT_ICONS\|const formatId\|const formatCoord" src/screens src/utils 2>/dev/null
```

Typical copies (values differ slightly per screen — do NOT unify divergent
values yourself; see STOP condition):

- `CargoListScreen.tsx`, `CargoDetailScreen.tsx` — `STATUS_LABELS`
  (draft/open/matched/cancelled/completed → Persian),
  `MODE_LABELS` (land/sea/air/rail/multimodal → Persian),
  `SPECIAL_LABELS` (hazardous/fragile/refrigerated/... → Persian).
- `DriverShipmentDetailScreen.tsx`, `ShipmentDetailScreen.tsx` —
  `STATUS_LABELS` (shipment statuses), `EVENT_TYPE_LABELS`, `EVENT_ICONS`.
- `DriverDocumentsScreen.tsx` — `KIND_LABELS`, `STATUS_LABELS` (doc
  verification), `STATUS_COLORS`.
- `formatId` (e.g. `id.slice(0, 8)` helpers), `formatCoord` — appear in
  2-3 list screens.

Navigation: `mobile/App.tsx` defines local param lists
(`AuthStackParamList`, `MainTabParamList`, plus a stack for detail screens —
read the file; the exact names/types are the source of truth). Screens call
`useNavigation<any>()` or `useNavigation()` and cast `as never` on every
navigate.

## Product rules (do not invent others)

- Extraction is **move-only**: identical keys, identical Persian strings,
  identical colors. Where two screens drifted, keep the value from the
  screen that matches the **backend enum semantics** (check
  `backend/src/models/Cargo.js` / `Shipment.js` / `Document.js` enums) and
  note the divergence in the final report.
- Navigation types: type the **existing** stack exactly as it is — renaming
  routes or restructuring navigators is out of scope.
- No new dependencies.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Find copies | `cd mobile && grep -rn "STATUS_LABELS\|MODE_LABELS\|EVENT_TYPE_LABELS\|const formatId\|const formatCoord" src/screens \| cut -d: -f1 \| sort -u` | the screen list |
| Typecheck | `cd mobile && npx tsc --noEmit` | exit 0 |
| Lint | `cd mobile && npm run lint` | exit 0 |
| No stragglers | `cd mobile && grep -rn "STATUS_LABELS: Record" src/screens` | no hits (all moved) |

## Scope

**In scope**:

- `mobile/src/utils/constants.ts` (new — label/color maps + format helpers)
- `mobile/src/navigation/types.ts` (new — param lists re-exported)
- `mobile/src/screens/*.tsx` (imports replace local copies)
- `mobile/App.tsx` (export the param lists from one place; screens import)
- `plans/README.md` (status row)

**Out of scope**:

- Renaming routes/screens, restructuring the navigator, new screens.
- Backend, admin.
- Fixing the `useNavigation<any>()` instances beyond giving them real types.
- The admin app's duplicated page interfaces (separate, smaller — skip).

## Git workflow

- Stay on the current branch. Do not push.
- Commits: `refactor(034): extract shared mobile constants and nav types`
  then `chore(034): mark plan DONE in index`.

## Steps

### Step 1: Build the inventory

Run the find-copies command. For each constant, diff the copies:

```bash
cd mobile && for f in src/screens/*.tsx; do grep -A 10 "const STATUS_LABELS" $f; done 2>/dev/null | sort | uniq -c | sort -rn
```

If a constant has **one** canonical value across all screens → extract.
If copies **diverge** → STOP and report the divergence list (do not pick).

### Step 2: Create `mobile/src/utils/constants.ts`

Move (not rewrite) the unified constants. Shape:

```ts
import { COLORS } from '../theme';

export const CARGO_STATUS_LABELS: Record<string, string> = { /* identical values */ };
export const SHIPMENT_STATUS_LABELS: Record<string, string> = { /* … */ };
export const DOC_VERIFICATION_STATUS_LABELS: Record<string, string> = { /* … */ };
export const DOC_STATUS_COLORS: Record<string, string> = { /* … */ };
export const MODE_LABELS: Record<string, string> = { /* … */ };
export const SPECIAL_LABELS: Record<string, string> = { /* … */ };
export const EVENT_TYPE_LABELS: Record<string, string> = { /* … */ };
export const EVENT_ICONS: Record<string, string> = { /* … */ };
export const KIND_LABELS: Record<string, string> = { /* … */ };

export function formatId(id: string): string { /* identical body */ }
export function formatCoord(n: number): string { /* identical body */ }
```

Name them by domain (CARGO_/SHIPMENT_/DOC_ prefixes) — generic
`STATUS_LABELS` is how the drift started.

### Step 3: Create `mobile/src/navigation/types.ts`

From `mobile/App.tsx`, move/re-export the param lists:

```ts
import type { AuthStackParamList } from '../../App';
// …
```

Preferred shape: App.tsx **exports** its lists
(`export type AuthStackParamList = { … }`), navigation/types.ts re-exports
plus exports a `RootStackParamList` union if App.tsx composes one. Screens
then use:

```ts
const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
// …
navigation.navigate('CargoDetail', { cargoId });  // typed, no as never
```

Tab navigation calls use the tab param list type. Convert the `as never`
casts only where the target screen name exists in a param list — leave any
cast that would require navigator restructuring, and list them in the
report.

### Step 4: Rewire screens

For each screen in the inventory: delete the local constant, import from
`../utils/constants` (or `../navigation/types`). Keep the JSX untouched —
only the identifier changes.

### Step 5: Verify

```bash
cd mobile && npx tsc --noEmit && npm run lint
grep -rn "STATUS_LABELS: Record\|MODE_LABELS: Record" src/screens  # expect: no hits
grep -rn "as never" src/screens | wc -l   # expect: dramatically fewer; list survivors in the report
```

## Test plan

No mobile test infra; behavior-change-free refactor verified by:

- `tsc --noEmit` + lint green.
- Manual smoke: cargo list/detail labels render as before; shipment detail
  event timeline icons render; documents screen kind badges render;
  navigation from every tab still lands on the right screen.

## Done criteria

- [ ] `cd mobile && npx tsc --noEmit` exits 0
- [ ] `cd mobile && npm run lint` exits 0
- [ ] `grep -rn "Record<string, string>" src/screens | grep -c "STATUS_LABELS"` → 0
- [ ] `mobile/src/utils/constants.ts` exists and is imported by ≥3 screens
- [ ] `grep -c "as never" src/screens/*.tsx | grep -v ':0'` count is lower than the Step 1 baseline; survivors documented
- [ ] No visual diff in label text (spot-check 3 screens in the report)
- [ ] `plans/README.md` status row for 034 updated

## STOP conditions

- Divergent constant values between screens (report, do not unify).
- Param-list typing would require restructuring the navigators.
- `tsc --noEmit` fallout outside identifier-rename fallout (e.g. pre-existing
  errors) — report what is pre-existing vs introduced.

## Maintenance notes

- New screens must import from constants.ts — add a lint note if the repo
  grows a custom rule later.
- 032's TYPE_META / CARGO_ERROR_COPY fold into this module if 032 landed
  first.
- Admin-side dedup (page interfaces → `admin/src/lib/types.ts`) is a
  possible 035 — not scoped here.

# Plan 057 — Mobile CargoListScreen design token migration

## Goal

Migrate `mobile/src/screens/CargoListScreen.tsx` fully onto the design system
(`mobile/src/theme.ts`) so there are zero ad-hoc spacing / radius / shadow
values left. This is the same token-migration sweep that plan 056 applied to
the two shipment detail screens, now applied to the cargo owner / transport
company cargo list.

Client-only. No backend changes. No new features.

## Scope (mobile-only)

The screen is already ~95% on tokens (uses `COLORS`, `font`, `space`,
`radii`, `shadows`, `StatusPill`, `EmptyState`). Only five hardcoded values
remain. Map each to a token:

| Line | Hardcoded | Replace with | Rationale |
|------|-----------|--------------|-----------|
| 66  | `insets.top + 12` | `insets.top + space[3]` | 12px = `space[3]` |
| 119 | `marginTop: 40` | `marginTop: space[10]` | 40px = `space[10]` |
| 198 | `borderRadius: 21` (FAB) | `borderRadius: radii.full` | full circle = `radii.full` (999) |
| 215 | `borderRadius: 20` (filter chip) | `borderRadius: radii.xl` | 20px = `radii.xl` |
| 294 | `padding: 10` (error box) | `padding: space[2]` | 10px ≈ `space[2]` (8) |

Font sizes (20 / 15 / 12 / 11 / 13) are intentionally left as raw numbers —
matching plan 056's convention, which only swaps the `fontFamily` string to the
`font.*` token (already done here) and keeps semantic font sizes explicit.

No RTL changes are needed: the route row already uses `flexDirection:
'row-reverse'` and every divider uses `borderRight`/`marginRight`
(`cardTitle.marginRight`, `cardRoute` reverse flow) — there is no
`borderLeft`/`marginLeft` in the file.

No structural / behavior change — only token substitution. The FAB becomes a
perfect circle via `radii.full` (visually identical at 42×42).

## STOP conditions

- `tsc --noEmit` fails → fix before commit.
- Any token import missing → add `radii`/`space` to the theme import
  (already imported on line 14: `{ COLORS, font, radii, shadows, space }`).
- Diff exceeds 200 lines → abort and split (should not happen; 5 one-line edits).

## Verification

1. `cd mobile && npx tsc --noEmit` → zero errors.
2. `git diff --stat mobile/src/screens/CargoListScreen.tsx` → ≤ 12 lines changed.
3. `grep -nE "1[0-9]\)|paddingTop: insets.top \+ 12|: 21|: 20|: 40" mobile/src/screens/CargoListScreen.tsx`
   → no remaining hardcoded spacing/radius literals.

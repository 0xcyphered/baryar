# Plan 056 — Wire shipment cargo details + design token migration

## Goal

Wire both `ShipmentDetailScreen` (cargo owner) and `DriverShipmentDetailScreen`
to call the plan 037 backend endpoint `GET /api/shipments/:id/cargo` so users see
actual cargo title, origin, destination, dimensions, and transport mode instead of
truncated hex IDs. Migrate both screens to design tokens and fix RTL issues.

## Scope (mobile-only, no backend changes)

### 1. Add `getShipmentCargo` to `shipmentsApi.ts`

```ts
export async function getShipmentCargo(id: string): Promise<Cargo> {
  const res = await apiFetch<{ cargo: Cargo }>(`/api/shipments/${id}/cargo`);
  return res.cargo;
}
```

### 2. Wire `ShipmentDetailScreen`

- Fetch cargo via `getShipmentCargo(shipmentId)` in `loadData` (parallel with
  existing `getShipment` + `listShipmentEvents`).
- Replace truncated ID rows (`شناسه بار`, `شناسه پیشنهاد`, etc.) with:
  - **Cargo title** as a header label.
  - **Route row**: origin address → destination address (same RTL arrow style as
    CargoListScreen).
  - **Dimensions summary**: weight / volume / dimensions on one row.
  - **Transport mode** + **special characteristics** tags.
  - Keep `شناسه راننده` and `شناسه وسیله` as smaller rows below cargo info.
  - Keep `زمان بارگیری` / `زمان تحویل` if present.

### 3. Wire `DriverShipmentDetailScreen`

Same cargo fetch + display as ShipmentDetailScreen but with the driver's
header/back-button layout.

### 4. Migrate both screens to design tokens

Replace all hardcoded values with theme imports:

| Hardcoded | Replace with |
|-----------|-------------|
| `paddingHorizontal: 16` | `paddingHorizontal: space[4]` |
| `marginHorizontal: 16` | `marginHorizontal: space[4]` |
| `marginBottom: 12` | `marginBottom: space[3]` |
| `marginTop: 20` | `marginTop: space[5]` |
| `fontSize: 17, fontFamily: 'Vazirmatn_700Bold'` | `font.bold` via `font` token |
| `fontSize: 14, fontFamily: 'Vazirmatn_500Medium'` | `font.medium` |
| `fontSize: 12, fontFamily: 'Vazirmatn_400Regular'` | `font.regular` |
| `borderRadius: 12` | `borderRadius: radii.lg` |
| `...{shadowColor: '#000', shadowOffset...}` | `...shadows.sm` |
| `marginLeft: 8` (timeline) | `marginEnd: space[2]` (RTL-safe) |

### 5. RTL fix

The timeline column uses `marginLeft: 8` which is wrong in RTL layout. Change
to `marginEnd: space[2]` so the timeline content stays on the correct side.

## STOP conditions

- `tsc --noEmit` fails → fix before commit.
- Any screen import breaks → fix before commit.

## Verification

1. `cd mobile && npx tsc --noEmit` → zero errors.
2. `git diff --stat` → ≤200 lines changed.

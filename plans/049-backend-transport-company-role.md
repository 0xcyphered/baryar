# Plan 049 — Backend: add `transport_company` to User.ROLES + pin it in tests (P0-A)

## Context

Operator correction 2026-09-08: the three mobile user models in the codebase are
wrong. Correct models:

1. `cargo_owner` — sahabe kala (صاحب کالا). The old "user" and "cargo_owner"
   roles are THE SAME THING and must be merged (no separate "user").
2. `driver` — ranande (راننده).
3. `transport_company` — sherkeat hamlo naql (شرکت حمل و نقل). MISSING from the
   backend entirely; must become a first-class mobile user model.

This plan is the operator's **P0-A** (their "Plan 047" directive). Numbering
shift: plan files 047/048 were already consumed by the P1 backlog (CargoForm
dedupe, detail polish sweep), so this lands as file **049**. It is the ONLY
backend change the pipeline is allowed to make (hard constraint 1).

### Backend audit (2026-09-08, HEAD 42e61d0)

- `backend/src/models/User.js` line 3: `ROLES = ['cargo_owner', 'driver', 'admin']`
  — `transport_company` missing. The array feeds the `roles` array-path enum
  validator, so extending it unlocks every write path automatically.
- Role-assignment surfaces (complete list, all audited):
  - `src/services/otpService.js` (verify-otp upsert, `roles: ['cargo_owner']`)
    — sahabe kala is the registration default. **Stays unchanged**: a transport
    company registers as a regular account first; granting the company role is
    a later product decision, not an OTP-time default.
  - `src/services/adminService.js` bootstrap — `$addToSet: { roles: 'admin' }`
    only. Unchanged.
  - `adminService.updateUser` — `USER_EDIT_FIELDS = ['name','email','nationalId']`;
    never touches roles. Unchanged.
  - `adminService.listUsers` — validates `?role=` against `User.ROLES.includes()`
    → accepts `transport_company` automatically once the enum grows. Pin with a
    test (change 3) instead of new code.
- **No `'user'` role exists anywhere in `backend/src` or `backend/test`**
  (grep-audited). The merge half of the directive is ALREADY satisfied
  server-side; default is `cargo_owner` everywhere. Documented here so the
  executor does not hunt for it. Mobile-side merge happens in plan 050.
- `src/middleware/requireRole.js` — only `requireDriver` / `requireCargoOwner`
  exist. No transport_company-guarded route exists yet (first one arrives with
  the plan 051 dashboard), so no middleware change in this plan.

## Constraints recap (hard)

- Backend touched ONLY in this plan; `mobile/`, `admin/`, `webapp/` untouched.
- Backend test suite must pass after the change (documented pre-existing
  baseline: 1 known failure in driver-upload tests, attributed to 035's
  deferred error handler at plan 038 — confirm same baseline, do not fix here).
- One commit per plan; update `plans/README.md`; ALWAYS release `.pipeline.lock`.

## Changes (max ~30 lines total)

### 1. `backend/src/models/User.js`

```js
const ROLES = ['cargo_owner', 'driver', 'transport_company', 'admin'];
```

Plus a one-line comment above it: `// transport_company = شرکت حمل و نقل` so
the mapping to the Persian model name is discoverable. Default `roles` stays
`['cargo_owner']`.

### 2. `backend/test/__tests__/models.identity.test.js`

Add one test next to the existing identity tests: a user created with
`roles: ['transport_company']` validates and persists (pins the enum
extension). Also assert `User.ROLES` contains exactly the four roles.

### 3. `backend/test/__tests__/admin.routes.test.js`

Add one test beside the existing `?role=cargo_owner` filter test:
`GET /api/admin/users?role=transport_company` → 200 and every returned user has
`roles` containing `transport_company`. Seeds one such user via `User.create`.

### 4. No other backend file changes

`auth.test.js` default-role expectations (`roles: ['cargo_owner']`) remain
green because the default is unchanged and the enum change is additive.
Deliberately NOT done here (rejected alternatives):
- Changing the OTP upsert default to transport_company — would misclassify
  every new registration; companies self-identify client-side in 050.
- Adding `/api/company/*` routes — no plan authorizes them; role comes first.
- Removing anything named 'user' — that role does not exist server-side.

## Verification

1. `cd backend && npm test` → same baseline as pre-change run (all green except
   the documented pre-existing driver-upload failure, if still present).
2. `git diff --stat` → only `User.js`, the two test files, `plans/README.md`.
3. Commit: `feat(049): add transport_company role to backend User.ROLES + tests`
   then README status row for 049 → DONE, second docs commit (as prior runs).
4. `rm .pipeline.lock` — always.

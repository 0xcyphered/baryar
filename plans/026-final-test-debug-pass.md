# Plan 026: Final MVP test & debug pass

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e412c9c..HEAD -- backend/ admin/ webapp/ mobile/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 015–025 (all DONE)
- **Category**: tests
- **Planned at**: commit `e412c9c`, 2026-09-04

## Why this matters

Plans 014–025 were each verified only by syntax checks (`node -c`, `tsc --noEmit`) and grep structural gates. No plan ran the full Jest suite, the admin/webapp `tsc -b && vite build`, or mobile lint. This is the designated "test and debug at the end" slice — the ONLY plan that runs test suites, builds, and fixes failures across the entire MVP. A passing run here is the green light that the Phase 1 booking flow is ready for manual smoke testing.

## Current state

### Backend (Node.js + Express + Mongoose)
- 12 models: User, OtpChallenge, Cargo, Vehicle, DriverProfile, Document, Offer, Shipment, ShipmentEvent, Notification, SystemSettings, geoPoint
- 8 route files: auth, cargo, driver, matching, offers, shipments, notifications, admin
- 8 services, 2 middleware (auth, adminGuard), 1 util (phone)
- 7 test files in `backend/test/__tests__/`:
  - `health.test.js` (2 tests)
  - `models.identity.test.js` (6 tests)
  - `models.cargo.test.js` (10 tests)
  - `phone.test.js` (2 tests)
  - `auth.test.js` (~17 tests)
  - `cargo.routes.test.js` (~20 tests)
  - `driver.routes.test.js` (~22 tests)
- Test infra: Jest 29, supertest, mongodb-memory-server 10 (`MongoMemoryServer.create()`, NOT ReplSet)
- `globalSetup.js` sets `MONGO_URI` from `MongoMemoryServer.create()`, sets `NODE_ENV=test`
- `setup.js` connects to `process.env.MONGO_URI`, cleans collections after each test
- System mongod available at `/usr/bin/mongod` (v4.4.31) — needed for `MONGOMS_SYSTEM_BINARY`

### Admin webapp (Vite + React + TypeScript)
- `admin/package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `lint` (`oxlint`), `preview`
- 14 TSX/TS source files under `admin/src/`
- `tsconfig.json` → references `tsconfig.app.json` + `tsconfig.node.json`
- `tsconfig.app.json` targets ES2023, strict-ish (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`)
- node_modules: INSTALLED
- Build: `cd admin && npm run build`

### Webapp (Vite + React + TypeScript)
- `webapp/package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `lint` (`oxlint`), `preview`
- 10 TSX/TS source files under `webapp/src/`
- `tsconfig.json` → references `tsconfig.app.json` + `tsconfig.node.json`
- node_modules: NOT INSTALLED (has `package-lock.json`)
- Build: `cd webapp && npm install && npm run build`

### Mobile (Expo React Native)
- `mobile/package.json` scripts: `start`, `android`, `ios`, `web`, `lint` (`expo lint`)
- 39 TSX/TS source files under `mobile/src/`
- `tsconfig.json` extends `expo/tsconfig.base`
- node_modules: INSTALLED
- Lint: `cd mobile && npm run lint` (ESLint via expo)
- No tsc build step — Expo resolves TypeScript at bundle time

### Commit message style (from git log)
```
feat(025): add mobile driver flow — onboarding, matching, offers, trips
chore(025): mark plan DONE in index
```

## Commands you will need

Run from the **repo root** (`/home/cyphered/projects/mapapp`) unless a step says otherwise.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend tests | `cd backend && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod npm test` | exit 0, all tests pass |
| Admin typecheck | `cd admin && npx tsc -b` | exit 0, no errors |
| Admin build | `cd admin && npm run build` | exit 0, dist/ created |
| Admin lint | `cd admin && npm run lint` | exit 0 |
| Webapp install | `cd webapp && npm install` | exit 0 |
| Webapp typecheck | `cd webapp && npx tsc -b` | exit 0, no errors |
| Webapp build | `cd webapp && npm run build` | exit 0, dist/ created |
| Webapp lint | `cd webapp && npm run lint` | exit 0 |
| Mobile lint | `cd mobile && npm run lint` | exit 0 |

## Scope

**In scope** (files you may create or modify):
- `backend/` — fix any test failures (edit test files or source files as needed)
- `admin/` — fix any typecheck, build, or lint failures
- `webapp/` — install deps, fix any typecheck, build, or lint failures
- `mobile/` — fix any lint failures
- `plans/README.md` — status row for 026

**Out of scope** (do NOT touch):
- New features, new screens, new API endpoints
- Mobile build (no `expo run:ios` or `expo run:android`) — only lint
- Deploying anything
- Changing test infrastructure (do not switch to MongoMemoryReplSet)
- Changing `.env.example`
- Modifying `webapp/` source beyond fixing type errors that block `tsc -b`
- `webapp/node_modules/` is allowed to be created by `npm install`, and that's it

## Steps

### Step 1: Drift check and environment setup

```bash
cd /home/cyphered/projects/mapapp
git diff --stat e412c9c..HEAD -- backend/ admin/ webapp/ mobile/
echo "MONGOMS_SYSTEM_BINARY=/usr/bin/mongod" > /tmp/baryar-test-env
```

**Verify**: drift output is empty or only shows plans/README.md changes. If backend/admin/webapp/mobile source files changed, read the diffs before proceeding.

### Step 2: Backend Jest suite

This is the highest-value gate — it exercises every model, route, and middleware.

```bash
cd /home/cyphered/projects/mapapp/backend
export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod
npm test
```

**Expected**: All 7 test files pass. Jest exits 0.

If `mongodb-memory-server` fails to download a binary, set:
```bash
export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod
export MONGOMS_DOWNLOAD=0
```

If tests fail:
1. Read the error message carefully
2. Fix the source code or test (whichever is wrong)
3. Re-run `npm test` until all pass
4. Note what was broken and what you fixed

**Verify**: `npm test` exits 0. Record the pass/fail count.

### Step 3: Admin typecheck + build

```bash
cd /home/cyphered/projects/mapapp/admin
npx tsc -b
```

**Verify**: exit 0, no errors. If errors, fix them (unused imports, missing types, etc.).

```bash
cd /home/cyphered/projects/mapapp/admin
npm run build
```

**Verify**: exit 0, `admin/dist/` directory is created.

### Step 4: Admin lint

```bash
cd /home/cyphered/projects/mapapp/admin
npm run lint
```

**Verify**: exit 0. If oxlint reports errors, fix them.

### Step 5: Webapp install + typecheck + build

Webapp does not have `node_modules` installed. Install first:

```bash
cd /home/cyphered/projects/mapapp/webapp
npm install
```

**Verify**: exit 0.

Then typecheck:
```bash
cd /home/cyphered/projects/mapapp/webapp
npx tsc -b
```

**Verify**: exit 0. If errors, fix them.

Then build:
```bash
cd /home/cyphered/projects/mapapp/webapp
npm run build
```

**Verify**: exit 0, `webapp/dist/` created.

### Step 6: Webapp lint

```bash
cd /home/cyphered/projects/mapapp/webapp
npm run lint
```

**Verify**: exit 0. If oxlint reports errors, fix them.

### Step 7: Mobile lint

```bash
cd /home/cyphered/projects/mapapp/mobile
npm run lint
```

**Verify**: exit 0. If ESLint reports errors, fix them. Mobile does NOT have a `tsc -b` step — Expo resolves TypeScript at bundle time.

### Step 8: Write health summary

After all gates pass, print a summary table to stdout:

```
=== Baryar MVP Health Summary ===
Backend Jest:    X/Y tests passed
Admin tsc:       PASS/FAIL
Admin build:     PASS/FAIL
Admin lint:      PASS/FAIL
Webapp tsc:      PASS/FAIL
Webapp build:    PASS/FAIL
Webapp lint:     PASS/FAIL
Mobile lint:     PASS/FAIL
=== Fixes applied ===
<list any source fixes made during this plan>
```

### Step 9: Commit and update index

Stage all changes:
```bash
cd /home/cyphered/projects/mapapp
git add backend/ admin/ webapp/ mobile/ plans/README.md
git commit -m "feat(026): final MVP test & debug pass"
```

Update `plans/README.md`: change 026's row to `DONE (executed by pipeline)`.

```bash
git add plans/README.md
git commit -m "chore(026): mark plan DONE in index"
```

If git identity is not configured, leave changes uncommitted and note it in the report.

## Product / design decisions

No design decisions in this plan. This is a quality gate, not a feature plan. The rules are:

1. **Fix, don't refactor.** If a test fails, fix the minimum needed to make it pass. Do not rewrite entire files or restructure modules.
2. **Preserve existing behavior.** If a test expects `401` and you think it should be `403`, change the test to match the implementation — unless the implementation is clearly a security bug (blocked user getting a token).
3. **Match existing style.** Backend: 2-space indent, CommonJS. Admin/Webapp: TypeScript, whatever the existing files use.
4. **No new features.** Do not add tests that don't exist, do not add endpoints, do not add screens.

## STOP conditions

Stop and report back (do not improvise) if:
- A backend test failure requires changing a model schema (this means an earlier plan shipped a bug that other plans depend on structurally)
- `mongodb-memory-server` cannot start even with `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod` and `MONGOMS_DOWNLOAD=0`
- A fix in one app breaks another (e.g., backend model change breaks admin typecheck)
- More than 5 files need non-trivial edits to pass the gates

## Maintenance notes

- This plan touches every app in the repo. Future plans should re-run their respective gates after any changes.
- The `MONGOMS_SYSTEM_BINARY` environment variable may need to be set in CI. The system mongod at `/usr/bin/mongod` works on this WSL machine.
- Webapp's `node_modules/` should be added to `.gitignore` if not already.

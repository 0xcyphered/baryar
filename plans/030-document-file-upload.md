# Plan 030: Store driver document bytes on local disk (multer) and serve them

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 39fe0a7..HEAD -- backend/src/routes/driver.js backend/src/services/driverService.js backend/src/models/Document.js backend/src/routes/admin.js backend/src/services/adminService.js backend/src/app.js backend/package.json backend/test/__tests__/driver.routes.test.js .gitignore`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> Planned-at SHA is a hint, not a hard STOP. Real gates:
> `POST /api/driver/documents` exists and accepts JSON metadata only
> (no multer, no `express.raw`); `Document.storageKey` is a string;
> `backend/package.json` has no `multer`. Do not STOP just because later
> commits exist.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/016-driver-onboarding-api.md (DONE), plans/019-admin-backend-api.md (DONE)
- **Category**: direction
- **Planned at**: commit `39fe0a7`, 2026-09-05

## Why this matters

V6 Phase 1 §3 still has no bytes on disk:

- **Uploading vehicle licenses**
- **Uploading driver licenses**
- **Submitting required documents** (national id, professional card)

Plan 016 stored metadata stubs (`storageKey` is an optional client string).
The NFR in `resources/features-roadmap.md` says documents must live in an
object store, **not** embedded in Mongo. There is no S3/MinIO in this repo
and 010 forbade GridFS. Phase 1 therefore uses **local disk** behind a
server-generated `storageKey`, with multer on **one** route (010: do not
raise the global JSON 100kb cap).

Admin verification (`DocumentsPage`) currently has nothing to open — it
shows `originalName` / `kind` only. This plan adds a download endpoint so
an admin can actually see the file before approve/reject.

Pushing a real object store (S3 / Liara / Arvan) is a later ops plan. The
service layer must isolate path join + unlink so that swap is one module.

## Current state

`backend/src/app.js:22` — global JSON cap, no multipart:

```js
app.use(express.json({ limit: '100kb' }));
```

`backend/src/routes/driver.js:106-113` — JSON stub create:

```js
router.post('/documents', async (req, res) => {
  try {
    const document = await driverService.createDocument({ userId: req.user._id, body: req.body });
    return res.status(201).json({ document: driverService.publicDocument(document) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});
```

Route order in that file (load-bearing): `POST /profile` is above
`router.use(requireDriver)`. Then `GET /profile`, vehicles CRUD, then
documents. There is **no** `GET /documents/:id`. `DELETE /documents/:id`
exists. A new `POST /documents/upload` and `GET /documents/:id/file` must
be registered **before** `DELETE /documents/:id` is fine (different methods)
but `GET /documents/:id/file` must be registered **before** any future
`GET /documents/:id`. Today `GET /documents` is the collection. Put the
new routes next to the existing document block.

`backend/src/services/driverService.js` `DOCUMENT_FIELDS` and create:

```js
const DOCUMENT_FIELDS = ['kind', 'vehicleId', 'storageKey', 'originalName', 'mimeType'];

async function createDocument({ userId, body }) {
  const fields = pickFields(body, DOCUMENT_FIELDS);
  // vehicleId ownership check …
  return Document.create({
    ...fields,
    userId,
    verificationStatus: 'pending',
    reviewerUserId: null,
    reviewedAt: null,
    rejectionReason: '',
  });
}
```

`deleteDocument` (181–188) deletes the mongoose doc only — no `fs.unlink`.

`backend/src/models/Document.js` — `storageKey: { type: String, default: '' }`.
**Do not add a Buffer field. Do not add GridFS.**

`backend/package.json` dependencies today: `bcryptjs cors dotenv express
express-rate-limit helmet jsonwebtoken mongoose`. **This plan adds `multer`.**
Install inside `backend/` only, not the repo root (no root package.json).

`backend/test/__tests__/driver.routes.test.js` tests 12–16 cover JSON
POST /documents (pending stub, foreign vehicleId, bad kind, list, delete).
Those tests must **keep passing**. JSON POST stays as the metadata stub.

`.gitignore` does **not** ignore `uploads/`. Add `backend/uploads/`.

Mobile `driverApi.createDocument` still POSTs JSON. This plan is
**backend-only** — do not edit `mobile/` or `admin/`. Admin can download
via curl / a later UI slice hitting `GET /api/admin/documents/:id/file`.

Repo conventions: CommonJS, 2-space, single quotes in driver.js /
driverService.js. `fail(code)`. Tests: first line `require('../setup');`.
Jest: `cd backend && npm test`. Hang: `export MONGOMS_SYSTEM_BINARY=/opt/homebrew/bin/mongod`.

V6 / NFR this plan covers:

```
Phase 1 §3 uploading licenses / required documents
NFR: File / image storage — not embedded in Mongo
010: multer on a specific route, not a raised global JSON cap
```

Out of this plan: S3, signed URLs, image thumbnails, virus scan, mobile
multipart client, admin UI preview button.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat 39fe0a7..HEAD -- backend/src/routes/driver.js backend/src/services/driverService.js backend/src/models/Document.js backend/package.json` | empty or unrelated later commits |
| Install multer | `cd backend && npm install multer@^2.0.0` | `multer` listed in dependencies (if 2.x is unpublished on the registry, `multer@^1.4.5-lts.1` is the fallback — use whichever `npm view multer version` reports as latest 1.x/2.x; do not use `multer@next` prereleases) |
| Syntax | `cd backend && node --check src/services/storageService.js && node --check src/routes/driver.js && node --check src/routes/admin.js && node --check src/services/driverService.js && node --check src/services/adminService.js` | exit 0 |
| App boots | `cd backend && node -e "require('multer'); const {createApp}=require('./src/app'); console.log(typeof createApp().listen==='function'?'ok':'fail')"` | `ok` |
| Tests | `cd backend && npm test -- --testPathPattern='driver.routes|admin.routes'` | all pass |
| Full suite | `cd backend && npm test` | all pass |
| No GridFS / buffers | `grep -n "GridFS\\|schema.Types.Buffer" backend/src/models/Document.js \|\| echo clean` | `clean` |

## Suggested executor toolkit

- Skills: `amintajeran-project` (no GridFS, storageKey string),
  `node-backend-patterns`.
- Multer docs: `https://github.com/expressjs/multer` — `memoryStorage` is
  **forbidden** here (defeats "not in Mongo" and blows RAM). Use
  `diskStorage`.
- Exemplars: `backend/src/routes/driver.js`, `driverService.createDocument`,
  `backend/test/__tests__/driver.routes.test.js` (supertest `.attach`).

## Scope

**In scope**:

- `backend/package.json` + `backend/package-lock.json` (multer)
- `backend/src/services/storageService.js` (new)
- `backend/src/services/driverService.js` (ignore client storageKey on
  JSON create; upload helper; unlink on delete; stream file for owner)
- `backend/src/routes/driver.js` (multer on `POST /documents/upload`,
  `GET /documents/:id/file`)
- `backend/src/services/adminService.js` + `backend/src/routes/admin.js`
  (`GET /documents/:id/file`)
- `backend/src/app.js` — **only if** you must raise nothing; expected: no
  change. Do not raise `express.json` limit.
- `.gitignore` (`backend/uploads/`)
- `backend/.env.example` (`UPLOAD_DIR` optional)
- `backend/test/__tests__/driver.routes.test.js` (upload + download +
  unlink tests)
- `backend/test/__tests__/admin.routes.test.js` (admin download)
- `plans/README.md`

**Out of scope**:

- `backend/src/models/Document.js` — no schema change.
- S3 / MinIO / Liara / GridFS / sharp / imagemagick.
- Changing JSON `POST /documents` into multipart (stubs stay).
- `mobile/` / `admin/` UI.
- Serving files publicly without auth.
- Raising global JSON body cap.

## Git workflow

- Stay on current branch. Do not push.
- Commits: `feat(030): add local-disk driver document upload`
  then `chore(030): mark plan DONE in index`.
- Never commit files under `backend/uploads/` or test temp dirs.

## Steps

### Step 1: Add `multer` and gitignore the upload root

```bash
cd backend && npm install multer
```

Confirm it landed under `dependencies` (not devDependencies).

Append to repo-root `.gitignore`:

```
# Local document uploads (plan 030)
backend/uploads/
```

Append to `backend/.env.example`:

```
# Directory for driver document bytes. Default: <backend>/uploads
UPLOAD_DIR=
```

**Verify**: `cd backend && npm ls multer --depth=0` → listed, no UNMET.
`grep -n "backend/uploads" .gitignore` → one hit.

### Step 2: Create `backend/src/services/storageService.js`

Single quotes, 2-space. This is the **only** module that may call
`path.join` on user-controlled fragments.

```js
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DIR = path.join(__dirname, '../../uploads');
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const EXT_FOR_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function uploadRoot() {
  const raw = process.env.UPLOAD_DIR;
  if (raw && raw.trim()) return path.resolve(raw.trim());
  return DEFAULT_DIR;
}

function assertSafeKey(storageKey) {
  if (typeof storageKey !== 'string' || !storageKey) fail('not_found');
  if (storageKey.includes('..') || path.isAbsolute(storageKey)) fail('not_found');
  const root = uploadRoot();
  const abs = path.resolve(root, storageKey);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail('not_found');
  return abs;
}

async function ensureRoot() {
  await fsp.mkdir(uploadRoot(), { recursive: true });
}

function randomKey(userId, mimeType) {
  const ext = EXT_FOR_MIME[mimeType] || '';
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  return path.posix.join('documents', String(userId), `${id}${ext}`);
}

async function saveBuffer({ userId, mimeType, buffer, originalName }) {
  if (!ALLOWED_MIME.has(mimeType)) fail('invalid_file_type');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) fail('validation_error');
  if (buffer.length > MAX_BYTES) fail('file_too_large');
  await ensureRoot();
  const storageKey = randomKey(userId, mimeType);
  const abs = assertSafeKey(storageKey);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buffer);
  return {
    storageKey,
    originalName: typeof originalName === 'string' ? originalName : '',
    mimeType,
  };
}

async function unlinkKey(storageKey) {
  if (!storageKey) return;
  try {
    const abs = assertSafeKey(storageKey);
    await fsp.unlink(abs);
  } catch (err) {
    if (err && err.code === 'not_found') return;
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
}

function createReadStream(storageKey) {
  const abs = assertSafeKey(storageKey);
  return fs.createReadStream(abs);
}

module.exports = {
  ALLOWED_MIME,
  MAX_BYTES,
  uploadRoot,
  assertSafeKey,
  saveBuffer,
  unlinkKey,
  createReadStream,
};
```

Use `path.posix.join` for the **key** (always forward slashes in Mongo).
Use `path.resolve` only inside `assertSafeKey`.

**Verify**: `cd backend && node --check src/services/storageService.js`
`cd backend && node -e "const s=require('./src/services/storageService'); console.log(s.MAX_BYTES, [...s.ALLOWED_MIME].length)"`
→ `5242880 4`.

### Step 3: JSON POST ignores client `storageKey`; add upload + read + unlink

In `driverService.js`:

1. Change `DOCUMENT_FIELDS` to **drop `storageKey`**:

```js
const DOCUMENT_FIELDS = ['kind', 'vehicleId', 'originalName', 'mimeType'];
```

   JSON clients can no longer persist an arbitrary path. Existing tests do
   not assert a client-supplied storageKey on the HTTP path.

2. Force `storageKey: ''` in `createDocument` (do not copy from body even
   if someone adds it back to the allowlist).

3. Add `createDocumentFromUpload({ userId, body, file })`:

   - `file` is `{ buffer, mimetype, originalname, size }` from multer
     memory **wait — STOP: this plan forbids memoryStorage for production
     files**. Use diskStorage **or** `saveBuffer` after multer memory of
     max 5MB. Pick **one**:
     - **Chosen: multer `memoryStorage` with `limits.fileSize = MAX_BYTES`,
       then `storageService.saveBuffer`.** 5MB peak is acceptable for a
       single document route; it keeps path generation in storageService
       (multer diskStorage filename hooks are easy to get wrong). This is
       the one place memoryStorage is allowed. Do not use it elsewhere.
   - `body.kind` required (same as JSON). `body.vehicleId` optional, same
     ownership check as `createDocument`.
   - Call `saveBuffer`, then `Document.create` with the returned
     `storageKey` / `originalName` / `mimeType`, `verificationStatus:
     'pending'`. If `Document.create` throws, `unlinkKey` the new key
     before rethrowing.

4. `deleteDocument`: after the pending/lock checks, `await storageService.unlinkKey(document.storageKey)` then `deleteOne`. Missing file is not an error.

5. Add `openDocumentFile({ userId, id })`: `assertId`, find
   `{ _id: id, userId }`, 404 if missing, 404 if `!storageKey`, return
   `{ document, stream: storageService.createReadStream(document.storageKey) }`.
   `createReadStream` throwing `not_found` → `fail('not_found')`.

Export the new functions.

**Verify**: `cd backend && node --check src/services/driverService.js`
`cd backend && node -e "const m=require('./src/services/driverService'); console.log(typeof m.createDocumentFromUpload, typeof m.openDocumentFile)"`
→ `function function`.

### Step 4: Routes — multer on one path, download on another

In `backend/src/routes/driver.js`:

```js
const multer = require('multer');
const storageService = require('../services/storageService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storageService.MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (storageService.ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    const err = new Error('invalid_file_type');
    err.code = 'invalid_file_type';
    return cb(err);
  },
});
```

Map new error codes in `sendDriverError`: `invalid_file_type: 400`,
`file_too_large: 413`. Multer's own size error is `err.code === 'LIMIT_FILE_SIZE'`
— map that to 413 `file_too_large` as well (in `sendDriverError`, before
the generic 500).

Add routes **immediately after** `POST /documents` (JSON):

```js
router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'validation_error' });
    const document = await driverService.createDocumentFromUpload({
      userId: req.user._id,
      body: req.body,
      file: req.file,
    });
    return res.status(201).json({ document: driverService.publicDocument(document) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.get('/documents/:id/file', async (req, res) => {
  try {
    const { document, stream } = await driverService.openDocumentFile({
      userId: req.user._id,
      id: req.params.id,
    });
    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    if (document.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${document.originalName.replace(/"/g, '')}"`);
    }
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'not_found' });
      else res.end();
    });
    stream.pipe(res);
  } catch (err) {
    return sendDriverError(res, err);
  }
});
```

Field name is **`file`** (not `document` / `upload`). `kind` and optional
`vehicleId` travel as multipart text fields.

JSON `POST /documents` stays.

**Verify**: `cd backend && node --check src/routes/driver.js`
`grep -n "documents/upload" backend/src/routes/driver.js` → one hit.
`grep -n "express.json" backend/src/app.js` → still `100kb` only.

### Step 5: Admin download

`adminService.js` add `openDocumentFileAdmin({ id })`: find by id (no
userId scope), 404 if missing or empty storageKey, return
`{ document, stream }` using `storageService.createReadStream`. Reuse
`driverServicePublicDocument` already in this file for JSON if needed;
the route streams bytes, not JSON.

`admin.js` add **before** `POST /documents/:id/verify` (path-prefix
safety: `/documents/:id/file` vs `/documents/:id/verify` are distinct):

```js
router.get('/documents/:id/file', async (req, res) => {
  try {
    const { document, stream } = await adminService.openDocumentFileAdmin({ id: req.params.id });
    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'not_found' });
      else res.end();
    });
    stream.pipe(res);
  } catch (err) {
    return sendAdminError(res, err);
  }
});
```

Non-admin still 403 via `requireAdmin`. A driver calling the admin URL
without the admin role is 403, not 404.

**Verify**: `cd backend && node --check src/routes/admin.js && node --check src/services/adminService.js`
`grep -n "documents/:id/file" backend/src/routes/admin.js backend/src/routes/driver.js` → one hit each.

### Step 6: Tests

Set `process.env.UPLOAD_DIR` in `beforeAll` of the new cases to
`path.join(__dirname, '../tmp-uploads-' + process.pid)` and
`fs.rmSync(..., { recursive: true, force: true })` in `afterAll`. Do not
write into `backend/uploads` during Jest.

Keep tests 12–16 as JSON stub tests.

Add to `driver.routes.test.js` (supertest `.attach` + `.field`):

1. `POST /api/driver/documents/upload` with a tiny PNG buffer (build via
   `Buffer.from` of a 1×1 PNG — the 8-byte header plus IHDR is enough for
   multer; mime is taken from `Content-Type` of the part, which supertest
   sets from the filename extension. Use `.attach('file', buf, 'card.jpg')`
   **and** `.field('kind', 'national_id')`) → 201,
   `verificationStatus === 'pending'`, `storageKey` matches
   `^documents/[a-f0-9]{24}/.+\.jpg$`, `originalName === 'card.jpg'`,
   `mimeType === 'image/jpeg'`. File exists under `UPLOAD_DIR`.
2. Same upload **without** `file` → 400 `validation_error`.
3. `.attach('file', buf, 'card.gif')` (or `mimetype: 'image/gif'`) → 400
   `invalid_file_type`.
4. JSON `POST /documents` with `{ kind: 'driving_license', storageKey: '../etc/passwd' }`
   → 201 and `storageKey === ''` (client key discarded).
5. Owner `GET /api/driver/documents/:id/file` after a successful upload →
   200, `Content-Type: image/jpeg`, body length equals the uploaded buffer.
6. Another driver `GET` that file → 404 `{ error: 'not_found' }` (do not
   leak existence).
7. `GET .../file` on a JSON stub (empty storageKey) → 404.
8. `DELETE` of an uploaded pending doc → 200, file gone from disk
   (`fs.existsSync` false).

Add to `admin.routes.test.js`:

9. Admin `GET /api/admin/documents/:id/file` on an uploaded doc → 200.
10. Non-admin driver token on that admin URL → 403.

A 1×1 JPEG is annoying to hand-author. A 1×1 PNG as `card.png` with
`mimeType image/png` is fine — use this canonical 68-byte PNG:

```js
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
```

Attach as `'pixel.png'`. Expect `mimeType === 'image/png'` and key suffix
`.png`.

Do **not** test a real 5MB payload in CI (slow). Unit-test
`storageService.saveBuffer` rejecting `MAX_BYTES + 1` in a tiny extra
`backend/test/__tests__/storageService.test.js` (first line
`require('../setup');` even though it may not need mongoose — keep the
convention). Call `saveBuffer` with a `Buffer.alloc(storageService.MAX_BYTES + 1)`
and expect `err.code === 'file_too_large'`. Unlink nothing because it
should throw before write.

**Verify**: `cd backend && npm test -- --testPathPattern='driver.routes|admin.routes|storageService'`
then `cd backend && npm test`.

### Step 7: Mark DONE

Update `plans/README.md` 030 row. Commit. Confirm `git status` does not
include anything under `backend/uploads/` or `backend/test/tmp-uploads-*`.

## Test plan

- Cases in Step 6. Pattern: `driver.routes.test.js` (Bearer + registerDriverViaProfile).
- Regression: JSON stub tests 12–16 unchanged in intent (pending, foreign
  vehicle, bad kind, list, delete lock).
- Verification: `cd backend && npm test` → all pass.

## Done criteria

- [ ] `cd backend && npm ls multer --depth=0` lists multer
- [ ] `grep -n "limit: '100kb'" backend/src/app.js` still matches (global JSON cap unchanged)
- [ ] `grep -n "GridFS\\|Types.Buffer" backend/src/models/Document.js` no matches
- [ ] `POST /api/driver/documents/upload` stores a file and returns a server-generated `storageKey` starting with `documents/`
- [ ] JSON `POST /api/driver/documents` still 201 and **ignores** client `storageKey`
- [ ] Owner and admin can `GET .../file`; other users get 404 on the driver URL and 403 on the admin URL
- [ ] DELETE unlinks the file
- [ ] `.gitignore` contains `backend/uploads/`
- [ ] `cd backend && npm test` exits 0
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` 030 row updated

## STOP conditions

- Current-state excerpts no longer match.
- A verification command fails twice.
- `npm install multer` fails (registry / offline). Report; do not vendor a copy.
- You are about to `npm install aws-sdk` / `@aws-sdk/client-s3` / `gridfs-stream`.
- You are about to raise `express.json({ limit })`.
- You are about to put file bytes on the Document schema.
- Mobile/admin UI "while you're here".
- Multer is applied to `/api/cargo` or globally.

## Maintenance notes

- Next object-store plan should replace `saveBuffer` / `createReadStream` /
  `unlinkKey` only. Keep `storageKey` as the durable pointer.
- Mobile still POSTs JSON stubs (`driverApi.createDocument`). A follow-up
  client slice should `.attach('file', ...)` to `/documents/upload`. Until
  then, admin has nothing to preview for stub-only rows — that is expected.
- Reviewer: confirm `storageKey` cannot contain `..` even if a row is
  hand-edited in mongosh (`assertSafeKey` on every read/unlink).
- `crypto.randomUUID` exists on Node 19+; the `randomBytes` fallback is
  for the WSL Node in 026 notes. Keep it.

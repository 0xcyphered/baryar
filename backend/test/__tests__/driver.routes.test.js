require('../setup');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const Document = require('../../src/models/Document');

const PHONE_DRIVER = '09121230011';   // registers via POST /profile (role granted there)
const PHONE_DRIVER2 = '09121230012';  // second driver — ownership + plate-conflict tests
const PHONE_ROLE_ONLY = '09121230013'; // pre-seeded roles: ['driver'], no profile
const PHONE_CIVILIAN = '09121230014'; // plain cargo_owner via the OTP loop
const canon = (phone) => `+98${phone.slice(1)}`;
const FIXED_CODE = '123456';
// Plan 030: 1×1 PNG (68 bytes) for multipart upload tests.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('driver onboarding', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use';
    process.env.OTP_FIXED_CODE = FIXED_CODE;
    process.env.NODE_ENV = 'test';
    process.env.UPLOAD_DIR = path.join(__dirname, `../tmp-uploads-${process.pid}`);
  });

  afterAll(() => {
    fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  });

  async function register(phone) {
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone, code: FIXED_CODE });
    expect(res.status).toBe(200);
    return { token: res.body.token, userId: res.body.user.id };
  }

  async function registerRoleOnly(phone) {
    await User.create({ phone: canon(phone), roles: ['driver'] });
    const { token } = await register(phone);
    return token;
  }

  async function registerDriverViaProfile(phone, profileOverrides = {}) {
    const { token } = await register(phone);
    const res = await request(app)
      .post('/api/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseNumber: 'L-123456', professionalCardNumber: 'PC-998877', ...profileOverrides });
    expect([200, 201]).toContain(res.status);
    return token;
  }

  function vehicleBody(overrides = {}) {
    return {
      vehicleType: 'truck',
      plate: '12B345IR11',
      capacityWeightKg: 24000,
      capacityVolumeM3: 40,
      year: 1398,
      ...overrides,
    };
  }

  async function createVehicle(token, overrides = {}) {
    return request(app)
      .post('/api/driver/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send(vehicleBody(overrides));
  }

  test('1. POST /api/driver/profile registers a fresh user: 201, pending, driver role granted', async () => {
    const { token, userId } = await register(PHONE_CIVILIAN);
    const res = await request(app)
      .post('/api/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseNumber: 'L-123456' });
    expect(res.status).toBe(201);
    expect(res.body.profile.verificationStatus).toBe('pending');
    expect(res.body.profile.userId).toBe(userId);
    expect(res.body.profile.id).toMatch(/^[0-9a-f]{24}$/);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.roles).toContain('driver');
  });

  test('2. second POST /profile updates (200) and keeps exactly one profile, still pending', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await request(app)
      .post('/api/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseNumber: 'L-999999' });
    expect(res.status).toBe(200);
    expect(res.body.profile.licenseNumber).toBe('L-999999');
    expect(res.body.profile.verificationStatus).toBe('pending');

    const got = await request(app).get('/api/driver/profile').set('Authorization', `Bearer ${token}`);
    expect(got.status).toBe(200);
    expect(got.body.profile.licenseNumber).toBe('L-999999');
  });

  test('3. GET /profile: driver without profile 404; civilian (cargo_owner only) 403', async () => {
    const roleOnly = await registerRoleOnly(PHONE_ROLE_ONLY);
    const noProfile = await request(app).get('/api/driver/profile').set('Authorization', `Bearer ${roleOnly}`);
    expect(noProfile.status).toBe(404);
    expect(noProfile.body).toEqual({ error: 'not_found' });

    const { token } = await register(PHONE_CIVILIAN);
    const civilian = await request(app).get('/api/driver/profile').set('Authorization', `Bearer ${token}`);
    expect(civilian.status).toBe(403);
    expect(civilian.body).toEqual({ error: 'forbidden' });
  });

  test('4. GET /vehicles as a non-driver is forbidden', async () => {
    const { token } = await register(PHONE_CIVILIAN);
    const res = await request(app).get('/api/driver/vehicles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('5. POST /vehicles creates an active truck owned by the token user', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const { userId } = await register(PHONE_DRIVER); // same user; gets id
    const res = await createVehicle(token);
    expect(res.status).toBe(201);
    expect(res.body.vehicle.status).toBe('active');
    expect(res.body.vehicle.vehicleType).toBe('truck');
    expect(res.body.vehicle.plate).toBe('12B345IR11');
    expect(res.body.vehicle.ownerUserId).toBe(userId);
    expect(res.body.vehicle.id).toMatch(/^[0-9a-f]{24}$/);
  });

  test('6. POST /vehicles ignores a smuggled status — always active on create', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await createVehicle(token, { status: 'inactive', ownerUserId: 'f'.repeat(24) });
    expect(res.status).toBe(201);
    expect(res.body.vehicle.status).toBe('active');
    expect(res.body.vehicle.ownerUserId).not.toBe('f'.repeat(24));
  });

  test('7. duplicate plate — even by another driver — is 409 plate_in_use', async () => {
    const first = await registerDriverViaProfile(PHONE_DRIVER);
    const second = await registerDriverViaProfile(PHONE_DRIVER2);
    const original = await createVehicle(first);
    expect(original.status).toBe(201);

    const sameDriver = await createVehicle(first, { vehicleType: 'van' });
    expect(sameDriver.status).toBe(409);
    expect(sameDriver.body).toEqual({ error: 'plate_in_use' });

    const otherDriver = await createVehicle(second);
    expect(otherDriver.status).toBe(409);
    expect(otherDriver.body).toEqual({ error: 'plate_in_use' });
  });

  test('8. POST /vehicles rejects bad vehicleType and missing plate', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const badType = await createVehicle(token, { vehicleType: 'rocket' });
    expect(badType.status).toBe(400);
    expect(badType.body).toEqual({ error: 'validation_error' });

    const noPlate = vehicleBody();
    delete noPlate.plate;
    const res = await request(app)
      .post('/api/driver/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send(noPlate);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('9. GET /vehicles lists only own vehicles, newest first, with count', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    const a = await createVehicle(token, { plate: '11A111IR11' });
    await new Promise((resolve) => setTimeout(resolve, 5)); // distinct createdAt
    const b = await createVehicle(token, { plate: '22B222IR22' });
    await createVehicle(other, { plate: '33C333IR33' });

    const res = await request(app).get('/api/driver/vehicles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.vehicles[0].id).toBe(b.body.vehicle.id);
    expect(res.body.vehicles[1].id).toBe(a.body.vehicle.id);
    for (const vehicle of res.body.vehicles) {
      expect(vehicle.plate).not.toBe('33C333IR33');
    }
  });

  test('10. PATCH own vehicle updates editable fields; plate is not editable; foreign and malformed ids', async () => {
    const driver = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    const created = await createVehicle(driver);
    const id = created.body.vehicle.id;

    const patch = await request(app)
      .patch(`/api/driver/vehicles/${id}`)
      .set('Authorization', `Bearer ${driver}`)
      .send({ vehicleType: 'van', capacityWeightKg: 8000, status: 'inactive', plate: 'HACK99' });
    expect(patch.status).toBe(200);
    expect(patch.body.vehicle.vehicleType).toBe('van');
    expect(patch.body.vehicle.capacityWeightKg).toBe(8000);
    expect(patch.body.vehicle.status).toBe('inactive');
    expect(patch.body.vehicle.plate).toBe('12B345IR11'); // unchanged

    const foreign = await request(app)
      .patch(`/api/driver/vehicles/${id}`)
      .set('Authorization', `Bearer ${other}`)
      .send({ vehicleType: 'tanker' });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'not_found' });

    const malformed = await request(app)
      .patch('/api/driver/vehicles/not-an-objectid')
      .set('Authorization', `Bearer ${driver}`)
      .send({ vehicleType: 'tanker' });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'invalid_vehicle_id' });
  });

  test('11. DELETE own vehicle removes it; subsequent GET shows it gone', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const created = await createVehicle(token);
    const id = created.body.vehicle.id;

    const del = await request(app).delete(`/api/driver/vehicles/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const list = await request(app).get('/api/driver/vehicles').set('Authorization', `Bearer ${token}`);
    expect(list.body.count).toBe(0);
  });

  test('12. POST /documents creates a pending stub; verification fields cannot be smuggled', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const { userId } = await register(PHONE_DRIVER);
    const res = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'driving_license',
        originalName: 'license.jpg',
        mimeType: 'image/jpeg',
        verificationStatus: 'approved',
        reviewerUserId: userId,
      });
    expect(res.status).toBe(201);
    expect(res.body.document.kind).toBe('driving_license');
    expect(res.body.document.verificationStatus).toBe('pending');
    expect(res.body.document.reviewerUserId).toBeNull();
    expect(res.body.document.reviewedAt).toBeNull();
    expect(res.body.document.vehicleId).toBeNull();
  });

  test('13. POST /documents with a foreign vehicleId is 404; malformed vehicleId is 400', async () => {
    const driver = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    const foreignVehicle = await createVehicle(other, { plate: '44D444IR44' });

    const foreign = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${driver}`)
      .send({ kind: 'vehicle_registration', vehicleId: foreignVehicle.body.vehicle.id });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'not_found' });

    const malformed = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${driver}`)
      .send({ kind: 'vehicle_registration', vehicleId: 'zz' });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'invalid_vehicle_id' });
  });

  test('14. POST /documents rejects bad kind and missing kind', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const badKind = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'passport' });
    expect(badKind.status).toBe(400);
    expect(badKind.body).toEqual({ error: 'validation_error' });

    const noKind = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ originalName: 'x.jpg' });
    expect(noKind.status).toBe(400);
    expect(noKind.body).toEqual({ error: 'validation_error' });
  });

  test('15. GET /documents lists own only; ?kind= filters; bogus kind is 400', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    await request(app).post('/api/driver/documents').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'driving_license' });
    const reg = await request(app).post('/api/driver/documents').set('Authorization', `Bearer ${token}`)
      .send({ kind: 'vehicle_registration' });
    await request(app).post('/api/driver/documents').set('Authorization', `Bearer ${other}`)
      .send({ kind: 'national_id' });

    const all = await request(app).get('/api/driver/documents').set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(2);

    const filtered = await request(app)
      .get('/api/driver/documents?kind=vehicle_registration')
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.count).toBe(1);
    expect(filtered.body.documents[0].id).toBe(reg.body.document.id);

    const bogus = await request(app)
      .get('/api/driver/documents?kind=bogus')
      .set('Authorization', `Bearer ${token}`);
    expect(bogus.status).toBe(400);
    expect(bogus.body).toEqual({ error: 'validation_error' });
  });

  test('16. DELETE own pending document is ok; a non-pending document is document_locked', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const pending = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'safety_card' });
    const del = await request(app)
      .delete(`/api/driver/documents/${pending.body.document.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const approved = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'national_id' });
    // Force approval directly in the DB — the driver API itself can never do this.
    await Document.updateOne(
      { _id: approved.body.document.id },
      { $set: { verificationStatus: 'approved', reviewedAt: new Date() } }
    );
    const locked = await request(app)
      .delete(`/api/driver/documents/${approved.body.document.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(locked.status).toBe(409);
    expect(locked.body).toEqual({ error: 'document_locked' });
  });

  test('17. missing Authorization header is unauthorized before any role check', async () => {
    const res = await request(app).get('/api/driver/profile');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('18. GET /api/does-not-exist still falls through to not_found', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- Plan 030: local-disk document upload ---

  async function uploadDoc(token, filename, overrides = {}) {
    const req = request(app)
      .post('/api/driver/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('kind', 'national_id');
    if (filename !== null) req.attach('file', PNG_1X1, filename);
    return req;
  }

  test('19. POST /documents/upload stores bytes, returns server-generated storageKey', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await uploadDoc(token, 'card.png');
    expect(res.status).toBe(201);
    expect(res.body.document.verificationStatus).toBe('pending');
    expect(res.body.document.storageKey).toMatch(/^documents\/[a-f0-9]{24}\/.+\.png$/);
    expect(res.body.document.originalName).toBe('card.png');
    expect(res.body.document.mimeType).toBe('image/png');
    expect(res.body.document.kind).toBe('national_id');

    const abs = require('../../src/services/storageService').assertSafeKey(res.body.document.storageKey);
    expect(fs.existsSync(abs)).toBe(true);
    expect(fs.statSync(abs).size).toBe(PNG_1X1.length);
  });

  test('20. POST /documents/upload without a file part is 400 validation_error', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await uploadDoc(token, null);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('21. POST /documents/upload with a disallowed mime is 400 invalid_file_type', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await request(app)
      .post('/api/driver/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('kind', 'national_id')
      .attach('file', Buffer.from('GIF89a'), { filename: 'card.gif', contentType: 'image/gif' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_file_type' });
  });

  test('22. JSON POST /documents discards a client-supplied storageKey', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'driving_license', storageKey: '../etc/passwd' });
    expect(res.status).toBe(201);
    expect(res.body.document.storageKey).toBe('');
  });

  test('23. owner GET /documents/:id/file streams the uploaded bytes back', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const up = await uploadDoc(token, 'card.png');
    const id = up.body.document.id;

    const res = await request(app)
      .get(`/api/driver/documents/${id}/file`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.from(res.body).length).toBe(PNG_1X1.length);
    expect(Buffer.compare(Buffer.from(res.body), PNG_1X1)).toBe(0);
  });

  test('24. another driver GET on that file is 404 not_found (existence not leaked)', async () => {
    const owner = await registerDriverViaProfile(PHONE_DRIVER);
    const other = await registerDriverViaProfile(PHONE_DRIVER2);
    const up = await uploadDoc(owner, 'card.png');

    const res = await request(app)
      .get(`/api/driver/documents/${up.body.document.id}/file`)
      .set('Authorization', `Bearer ${other}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('25. GET .../file on a JSON stub (empty storageKey) is 404', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const stub = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'driving_license' });
    const res = await request(app)
      .get(`/api/driver/documents/${stub.body.document.id}/file`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('26. DELETE of an uploaded pending doc removes the file from disk', async () => {
    const token = await registerDriverViaProfile(PHONE_DRIVER);
    const up = await uploadDoc(token, 'card.png');
    const storageKey = up.body.document.storageKey;
    const abs = require('../../src/services/storageService').assertSafeKey(storageKey);
    expect(fs.existsSync(abs)).toBe(true);

    const del = await request(app)
      .delete(`/api/driver/documents/${up.body.document.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(fs.existsSync(abs)).toBe(false);
  });
});

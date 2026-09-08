require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const Document = require('../../src/models/Document');
const { applyTestEnv, makeHelpers, cargoBody: sharedCargoBody, canon, FIXED_CODE, JWT_SECRET } = require('../helpers');

const PHONE_ADMIN = '09121230501';
const PHONE_OWNER = '09121230502';
const PHONE_DRIVER = '09121230503';
const PHONE_REGULAR = '09121230504';
const PHONE_COMPANY = '09121230505';

const cargoBody = (title) => sharedCargoBody({ title: title || 'Admin Cargo' });

describe('admin routes', () => {
  const app = createApp();
  const h = makeHelpers(app);

  beforeAll(() => {
    applyTestEnv();
  });

  // --- Auth / role gating ---

  test('GET /api/admin/users without token is 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('GET /api/admin/users with cargo_owner is 403', async () => {
    const { token } = await h.register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('GET /api/admin/users with driver is 403', async () => {
    const { token } = await h.registerDriverViaProfile(PHONE_DRIVER);
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  // --- Users ---

  test('GET /api/admin/users lists all users', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: regId } = await h.register(PHONE_REGULAR);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toBeInstanceOf(Array);
    expect(res.body.count).toBeGreaterThan(0);
    const found = res.body.users.find((u) => u.id === regId);
    expect(found).toBeDefined();
    expect(found.phone).toBe(canon(PHONE_REGULAR));
  });

  test('GET /api/admin/users?status=active filters by status', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    await h.register(PHONE_REGULAR);

    const res = await request(app)
      .get('/api/admin/users?status=active')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    for (const u of res.body.users) {
      expect(u.status).toBe('active');
    }
  });

  test('GET /api/admin/users?status=bogus is validation_error', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .get('/api/admin/users?status=bogus')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('GET /api/admin/users?role=cargo_owner filters by role', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    await h.register(PHONE_REGULAR);

    const res = await request(app)
      .get('/api/admin/users?role=cargo_owner')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    for (const u of res.body.users) {
      expect(u.roles).toContain('cargo_owner');
    }
  });

  test('GET /api/admin/users?role=transport_company filters by role', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    await User.create({
      phone: canon(PHONE_COMPANY),
      roles: ['transport_company'],
      phoneVerifiedAt: new Date(),
      status: 'active',
    });

    const res = await request(app)
      .get('/api/admin/users?role=transport_company')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
    for (const u of res.body.users) {
      expect(u.roles).toContain('transport_company');
    }
  });

  test('GET /api/admin/users/:id returns a specific user', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: regId } = await h.register(PHONE_REGULAR);

    const res = await request(app)
      .get(`/api/admin/users/${regId}`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(regId);
    expect(res.body.user.phone).toBe(canon(PHONE_REGULAR));
  });

  test('GET /api/admin/users/:id with non-existent id is not_found', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .get(`/api/admin/users/${'0'.repeat(24)}`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('GET /api/admin/users/:id with malformed id is invalid_user_id', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .get('/api/admin/users/not-an-id')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_user_id' });
  });

  test('PATCH /api/admin/users/:id updates user name and email', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: regId } = await h.register(PHONE_REGULAR);

    const res = await request(app)
      .patch(`/api/admin/users/${regId}`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ name: 'Test User', email: 'test@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Test User');
    expect(res.body.user.email).toBe('test@example.com');
  });

  test('POST /api/admin/users/:id/block blocks a user', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: regId } = await h.register(PHONE_REGULAR);

    const res = await request(app)
      .post(`/api/admin/users/${regId}/block`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('blocked');
  });

  test('POST /api/admin/users/:id/unblock unblocks a blocked user', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: regId } = await h.register(PHONE_REGULAR);

    await request(app)
      .post(`/api/admin/users/${regId}/block`)
      .set('Authorization', `Bearer ${admTok}`);

    const res = await request(app)
      .post(`/api/admin/users/${regId}/unblock`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('active');
  });

  test('POST /api/admin/users/:id/unblock on non-blocked user is invalid_status', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: regId } = await h.register(PHONE_REGULAR);

    const res = await request(app)
      .post(`/api/admin/users/${regId}/unblock`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'invalid_status' });
  });

  test('POST /api/admin/users/:id/block on self is admin_self_action', async () => {
    const { token: admTok, userId: admId } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .post(`/api/admin/users/${admId}/block`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'admin_self_action' });
  });

  // --- Drivers ---

  test('GET /api/admin/drivers lists drivers with profiles and vehicle counts', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: drvId } = await h.registerDriverViaProfile(PHONE_DRIVER);

    const res = await request(app)
      .get('/api/admin/drivers')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.drivers).toBeInstanceOf(Array);
    expect(res.body.count).toBeGreaterThan(0);
    const driver = res.body.drivers.find((d) => d.user.id === drvId);
    expect(driver).toBeDefined();
    expect(driver.profile).toBeTruthy();
    expect(typeof driver.vehicleCount).toBe('number');
  });

  test('GET /api/admin/drivers/:userId returns driver detail', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: drvId } = await h.registerDriverViaProfile(PHONE_DRIVER);

    const res = await request(app)
      .get(`/api/admin/drivers/${drvId}`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(drvId);
    expect(res.body.profile).toBeTruthy();
    expect(res.body.profile.id).toBeDefined();
    expect(res.body.profile.userId).toBe(drvId);
    expect(res.body.profile._id).toBeUndefined();
    expect(res.body.profile.__v).toBeUndefined();
    expect(res.body.vehicles).toBeInstanceOf(Array);
    expect(res.body.documents).toBeInstanceOf(Array);
  });

  test('GET /api/admin/drivers/:userId with non-driver user is not_found', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: ownerId } = await h.register(PHONE_OWNER);

    const res = await request(app)
      .get(`/api/admin/drivers/${ownerId}`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('POST /api/admin/drivers/:userId/verify approves a driver profile', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: drvId } = await h.registerDriverViaProfile(PHONE_DRIVER);

    const res = await request(app)
      .post(`/api/admin/drivers/${drvId}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBeDefined();
    expect(res.body.profile._id).toBeUndefined();
    expect(res.body.profile.__v).toBeUndefined();
    expect(res.body.profile.verificationStatus).toBe('approved');
    expect(res.body.profile.verifiedAt).toBeTruthy();
  });

  test('POST /api/admin/drivers/:userId/verify rejects a driver profile', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: drvId } = await h.registerDriverViaProfile(PHONE_DRIVER);

    const res = await request(app)
      .post(`/api/admin/drivers/${drvId}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'rejected', reason: 'Documents are unclear' });
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBeDefined();
    expect(res.body.profile._id).toBeUndefined();
    expect(res.body.profile.verificationStatus).toBe('rejected');
    expect(res.body.profile.rejectionReason).toBe('Documents are unclear');
  });

  test('POST /api/admin/drivers/:userId/verify with bad decision is validation_error', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { userId: drvId } = await h.registerDriverViaProfile(PHONE_DRIVER);

    const res = await request(app)
      .post(`/api/admin/drivers/${drvId}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'maybe' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('POST /api/admin/drivers/:userId/verify with non-existent user is not_found', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .post(`/api/admin/drivers/${'0'.repeat(24)}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- Cargo ---

  test('GET /api/admin/cargo lists all cargo', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownTok } = await h.register(PHONE_OWNER);
    await request(app).post('/api/cargo').set('Authorization', `Bearer ${ownTok}`).send(cargoBody());

    const res = await request(app)
      .get('/api/admin/cargo')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.cargo).toBeInstanceOf(Array);
    expect(res.body.count).toBeGreaterThan(0);
  });

  test('GET /api/admin/cargo?status=draft filters by status', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownTok } = await h.register(PHONE_OWNER);
    await request(app).post('/api/cargo').set('Authorization', `Bearer ${ownTok}`).send(cargoBody('Draft One'));

    const res = await request(app)
      .get('/api/admin/cargo?status=draft')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    for (const c of res.body.cargo) {
      expect(c.status).toBe('draft');
    }
  });

  test('GET /api/admin/cargo/:id returns a specific cargo', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownTok } = await h.register(PHONE_OWNER);
    const createRes = await request(app).post('/api/cargo').set('Authorization', `Bearer ${ownTok}`).send(cargoBody('Get By ID'));
    const cargoId = createRes.body.cargo.id;

    const res = await request(app)
      .get(`/api/admin/cargo/${cargoId}`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.cargo.id).toBe(cargoId);
    expect(res.body.cargo._id).toBeUndefined();
    expect(res.body.cargo.__v).toBeUndefined();
    expect(res.body.cargo.title).toBe('Get By ID');
  });

  test('GET /api/admin/cargo/:id with non-existent id is not_found', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .get(`/api/admin/cargo/${'0'.repeat(24)}`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('PATCH /api/admin/cargo/:id updates cargo fields', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownTok } = await h.register(PHONE_OWNER);
    const createRes = await request(app).post('/api/cargo').set('Authorization', `Bearer ${ownTok}`).send(cargoBody('Patch Me'));
    const cargoId = createRes.body.cargo.id;

    const res = await request(app)
      .patch(`/api/admin/cargo/${cargoId}`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ title: 'Admin Updated Cargo' });
    expect(res.status).toBe(200);
    expect(res.body.cargo.id).toBe(cargoId);
    expect(res.body.cargo._id).toBeUndefined();
    expect(res.body.cargo.title).toBe('Admin Updated Cargo');
  });

  test('POST /api/admin/cargo/:id/cancel cancels cargo', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownTok } = await h.register(PHONE_OWNER);
    const createRes = await request(app).post('/api/cargo').set('Authorization', `Bearer ${ownTok}`).send(cargoBody('To Cancel'));
    const cargoId = createRes.body.cargo.id;

    const res = await request(app)
      .post(`/api/admin/cargo/${cargoId}/cancel`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.cargo.id).toBe(cargoId);
    expect(res.body.cargo._id).toBeUndefined();
    expect(res.body.cargo.status).toBe('cancelled');
  });

  test('POST /api/admin/cargo/:id/cancel rejects pending offers (plan 028)', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownTok } = await h.register(PHONE_OWNER);
    const { token: drvTok, userId: drvUserId } = await h.registerDriverViaProfile(PHONE_DRIVER);
    await h.approveDriver(drvUserId);
    const vehicleId = await h.createVehicle(drvTok, { plate: 'ADMCNL1IR11' });

    const createRes = await request(app).post('/api/cargo').set('Authorization', `Bearer ${ownTok}`).send(cargoBody('Admin Cancel Offers'));
    const cargoId = createRes.body.cargo.id;
    const pub = await request(app).post(`/api/cargo/${cargoId}/publish`).set('Authorization', `Bearer ${ownTok}`);
    expect(pub.status).toBe(200);
    const offerRes = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${drvTok}`)
      .send({ cargoId, vehicleId, priceRial: 1500000 });
    expect(offerRes.status).toBe(201);

    const res = await request(app)
      .post(`/api/admin/cargo/${cargoId}/cancel`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.cargo.id).toBe(cargoId);
    expect(res.body.cargo._id).toBeUndefined();
    expect(res.body.cargo.status).toBe('cancelled');

    const list = await request(app)
      .get('/api/offers')
      .set('Authorization', `Bearer ${drvTok}`);
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
    expect(list.body.offers[0].status).toBe('rejected');
  });

  // --- Overview ---

  test('GET /api/admin/overview returns counts for all entities', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.overview).toHaveProperty('users');
    expect(res.body.overview).toHaveProperty('cargo');
    expect(res.body.overview).toHaveProperty('offers');
    expect(res.body.overview).toHaveProperty('shipments');
    expect(typeof res.body.overview.users.total).toBe('number');
    expect(typeof res.body.overview.cargo.total).toBe('number');
    expect(typeof res.body.overview.offers.pending).toBe('number');
    expect(typeof res.body.overview.shipments.active).toBe('number');
  });

  // --- Documents ---

  test('GET /api/admin/documents lists documents', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: drvTok } = await h.registerDriverViaProfile(PHONE_DRIVER);
    await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${drvTok}`)
      .send({ kind: 'driving_license' });

    const res = await request(app)
      .get('/api/admin/documents')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toBeInstanceOf(Array);
    expect(res.body.count).toBeGreaterThan(0);
  });

  test('POST /api/admin/documents/:id/verify approves a document', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: drvTok } = await h.registerDriverViaProfile(PHONE_DRIVER);
    const docRes = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${drvTok}`)
      .send({ kind: 'driving_license' });
    const docId = docRes.body.document.id;

    const res = await request(app)
      .post(`/api/admin/documents/${docId}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.document.id).toBe(docId);
    expect(res.body.document._id).toBeUndefined();
    expect(res.body.document.__v).toBeUndefined();
    expect(res.body.document.verificationStatus).toBe('approved');
    expect(res.body.document.reviewedAt).toBeTruthy();
  });

  test('POST /api/admin/documents/:id/verify rejects with reason', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: drvTok } = await h.registerDriverViaProfile(PHONE_DRIVER);
    const docRes = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${drvTok}`)
      .send({ kind: 'national_id' });
    const docId = docRes.body.document.id;

    const res = await request(app)
      .post(`/api/admin/documents/${docId}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'rejected', reason: 'Image is blurry' });
    expect(res.status).toBe(200);
    expect(res.body.document.id).toBe(docId);
    expect(res.body.document._id).toBeUndefined();
    expect(res.body.document.verificationStatus).toBe('rejected');
    expect(res.body.document.rejectionReason).toBe('Image is blurry');
  });

  test('POST /api/admin/documents/:id/verify rejects without reason is validation_error', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: drvTok } = await h.registerDriverViaProfile(PHONE_DRIVER);
    const docRes = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${drvTok}`)
      .send({ kind: 'vehicle_registration' });
    const docId = docRes.body.document.id;

    const res = await request(app)
      .post(`/api/admin/documents/${docId}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'rejected' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('POST /api/admin/documents/:id/verify with bad decision is validation_error', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: drvTok } = await h.registerDriverViaProfile(PHONE_DRIVER);
    const docRes = await request(app)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${drvTok}`)
      .send({ kind: 'safety_card' });
    const docId = docRes.body.document.id;

    const res = await request(app)
      .post(`/api/admin/documents/${docId}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'maybe' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('POST /api/admin/documents/:id/verify with non-existent id is not_found', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .post(`/api/admin/documents/${'0'.repeat(24)}/verify`)
      .set('Authorization', `Bearer ${admTok}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- Shipments (admin) ---

  test('GET /api/admin/shipments lists all shipments', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .get('/api/admin/shipments')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.shipments).toBeInstanceOf(Array);
  });

  test('GET /api/admin/shipments enriches with cargoTitle and driverName', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownTok } = await h.register(PHONE_OWNER);
    const { token: drvTok, userId: drvUserId } = await h.registerDriverViaProfile(PHONE_DRIVER);
    await h.approveDriver(drvUserId);
    const vehicleId = await h.createVehicle(drvTok, { plate: 'ADMENR1IR11' });

    const cargoId = await h.publishCargo(ownTok, { title: 'Enrich Cargo' });
    const offer = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${drvTok}`)
      .send({ cargoId, vehicleId, priceRial: 2000000 });
    expect(offer.status).toBe(201);
    const accept = await request(app)
      .post(`/api/offers/${offer.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${ownTok}`);
    expect(accept.status).toBe(200);

    const res = await request(app)
      .get('/api/admin/shipments')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.shipments.length).toBeGreaterThanOrEqual(1);
    const enrich = res.body.shipments.find((s) => s.cargoTitle === 'Enrich Cargo');
    expect(enrich).toBeDefined();
    expect(enrich.id).toMatch(/^[0-9a-f]{24}$/);
    expect(enrich.status).toBe('assigned');
    expect(enrich.pickupAt).toBeDefined();
    expect(enrich.createdAt).toBeDefined();
    expect(enrich._id).toBeUndefined();
  });

  // --- Settings ---

  test('GET /api/admin/settings returns default settings', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.body.settings).toHaveProperty('platformName');
    expect(res.body.settings).toHaveProperty('defaultCurrency');
    expect(res.body.settings).toHaveProperty('maxActiveCargoPerOwner');
    expect(res.body.settings).toHaveProperty('maintenanceMode');
    expect(res.body.settings.defaultCurrency).toBe('IRR');
  });

  test('PUT /api/admin/settings updates settings', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${admTok}`)
      .send({
        platformName: 'Baryar',
        supportPhone: '02112345678',
        maintenanceMode: true,
        maxActiveCargoPerOwner: 10,
      });
    expect(res.status).toBe(200);
    expect(res.body.settings.platformName).toBe('Baryar');
    expect(res.body.settings.supportPhone).toBe('02112345678');
    expect(res.body.settings.maintenanceMode).toBe(true);
    expect(res.body.settings.maxActiveCargoPerOwner).toBe(10);

    const check = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${admTok}`);
    expect(check.body.settings.platformName).toBe('Baryar');
    expect(check.body.settings.maintenanceMode).toBe(true);
  });

  test('PUT /api/admin/settings with invalid field types is validation_error', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${admTok}`)
      .send({ platformName: 12345 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('PUT /api/admin/settings with negative maxActiveCargoPerOwner is validation_error', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${admTok}`)
      .send({ maxActiveCargoPerOwner: -5 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('PUT /api/admin/settings with no valid fields is validation_error', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${admTok}`)
      .send({ bogusField: 'hello' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  // --- Plan 030: admin file download ---

  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  async function uploadAsDriver(driverToken) {
    const res = await request(app)
      .post('/api/driver/documents/upload')
      .set('Authorization', `Bearer ${driverToken}`)
      .field('kind', 'national_id')
      .attach('file', PNG_1X1, { filename: 'card.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    return res.body.document;
  }

  test('GET /api/admin/documents/:id/file streams the uploaded bytes', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const { token: drvTok } = await h.registerDriverViaProfile(PHONE_DRIVER);
    const doc = await uploadAsDriver(drvTok);

    const res = await request(app)
      .get(`/api/admin/documents/${doc.id}/file`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(Buffer.from(res.body), PNG_1X1)).toBe(0);
  });

  test('driver token on the admin file URL is 403 forbidden', async () => {
    const { token: drvTok } = await h.registerDriverViaProfile(PHONE_DRIVER);
    const doc = await uploadAsDriver(drvTok);

    const res = await request(app)
      .get(`/api/admin/documents/${doc.id}/file`)
      .set('Authorization', `Bearer ${drvTok}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('GET /api/admin/documents/:id/file on an unknown id is 404', async () => {
    const { token: admTok } = await h.createAdmin(PHONE_ADMIN);
    const res = await request(app)
      .get(`/api/admin/documents/${'a'.repeat(24)}/file`)
      .set('Authorization', `Bearer ${admTok}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});

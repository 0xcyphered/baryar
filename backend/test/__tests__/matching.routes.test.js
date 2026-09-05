require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');

const PHONE_OWNER = '09121230101';
const PHONE_DRIVER = '09121230102';
const canon = (phone) => `+98${phone.slice(1)}`;
const FIXED_CODE = '123456';

describe('matching routes', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use';
    process.env.OTP_FIXED_CODE = FIXED_CODE;
    process.env.NODE_ENV = 'test';
  });

  async function register(phone) {
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone, code: FIXED_CODE });
    expect(res.status).toBe(200);
    return { token: res.body.token, userId: res.body.user.id };
  }

  async function registerDriverViaProfile(phone) {
    const { token, userId } = await register(phone);
    const res = await request(app)
      .post('/api/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseNumber: 'L-MATCH-001' });
    expect([200, 201]).toContain(res.status);
    return { token, userId };
  }

  async function createDriverWithVehicle(phone, vehicleOverrides = {}) {
    const { token } = await registerDriverViaProfile(phone);
    const plate = `M${phone.slice(-5)}IR11`;
    const res = await request(app)
      .post('/api/driver/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vehicleType: 'truck',
        plate,
        capacityWeightKg: 30000,
        capacityVolumeM3: 60,
        year: 1400,
        ...vehicleOverrides,
      });
    expect(res.status).toBe(201);
    return { token, vehicleId: res.body.vehicle.id };
  }

  function openCargoBody(overrides = {}) {
    return {
      title: 'Matching test cargo',
      transportMode: 'land',
      origin: { address: 'Tehran', location: { coordinates: [51.39, 35.69] } },
      destination: { address: 'Isfahan', location: { coordinates: [51.68, 32.65] } },
      dimensions: { weightKg: 10000, volumeM3: 20 },
      specialCharacteristics: [],
      pickupAt: '2026-09-10T08:00:00.000Z',
      deliverBy: '2026-09-12T18:00:00.000Z',
      ...overrides,
    };
  }

  async function createAndPublishCargo(ownerToken, overrides = {}) {
    const createRes = await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(openCargoBody(overrides));
    expect(createRes.status).toBe(201);
    const id = createRes.body.cargo.id;
    const pub = await request(app)
      .post(`/api/cargo/${id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(pub.status).toBe(200);
    return id;
  }

  // --- Auth / role gating ---

  test('GET /api/matching/cargo without token is 401', async () => {
    const res = await request(app).get('/api/matching/cargo');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('GET /api/matching/cargo with cargo_owner is 403', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/matching/cargo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('GET /api/matching/cargo with driver token returns 200', async () => {
    const { token } = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await request(app)
      .get('/api/matching/cargo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cargo');
    expect(res.body).toHaveProperty('count');
    expect(res.body.count).toBe(0);
  });

  // --- Success path: listing open cargo ---

  test('lists open cargo owned by another user, sorted newest-first', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken } = await createDriverWithVehicle(PHONE_DRIVER);

    const id1 = await createAndPublishCargo(ownerToken, { title: 'First cargo' });
    await new Promise((r) => setTimeout(r, 5));
    const id2 = await createAndPublishCargo(ownerToken, { title: 'Second cargo' });

    const res = await request(app)
      .get('/api/matching/cargo')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.cargo[0].id).toBe(id2);
    expect(res.body.cargo[1].id).toBe(id1);
    for (const c of res.body.cargo) {
      expect(c).toHaveProperty('title');
      expect(c).toHaveProperty('status');
    }
  });

  test('only shows open cargo — draft and cancelled are hidden', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken } = await registerDriverViaProfile(PHONE_DRIVER);

    await createAndPublishCargo(ownerToken, { title: 'Visible' });
    await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(openCargoBody({ title: 'Hidden draft' }));

    const res = await request(app)
      .get('/api/matching/cargo')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.cargo[0].title).toBe('Visible');
  });

  // --- Vehicle filter ---

  test('vehicleId filter excludes cargo heavier than vehicle capacity', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await createDriverWithVehicle(PHONE_DRIVER, {
      capacityWeightKg: 5000,
    });

    await createAndPublishCargo(ownerToken, { title: 'Light cargo', dimensions: { weightKg: 3000 } });
    await createAndPublishCargo(ownerToken, { title: 'Heavy cargo', dimensions: { weightKg: 8000 } });

    const res = await request(app)
      .get(`/api/matching/cargo?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.cargo[0].title).toBe('Light cargo');
  });

  test('non-existent vehicleId is not_found', async () => {
    const { token: driverToken } = await createDriverWithVehicle(PHONE_DRIVER);
    const fakeId = '0'.repeat(24);
    const res = await request(app)
      .get(`/api/matching/cargo?vehicleId=${fakeId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('malformed vehicleId is invalid_vehicle_id', async () => {
    const { token: driverToken } = await createDriverWithVehicle(PHONE_DRIVER);
    const res = await request(app)
      .get('/api/matching/cargo?vehicleId=not-a-mongo-id')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_vehicle_id' });
  });

  // --- Location / radius filter ---

  test('lat/lng/radius returns only nearby open cargo', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken } = await createDriverWithVehicle(PHONE_DRIVER);

    await createAndPublishCargo(ownerToken, { title: 'Tehran cargo' });
    await createAndPublishCargo(ownerToken, {
      title: 'Mashhad cargo',
      origin: { address: 'Mashhad', location: { coordinates: [58.54, 36.30] } },
    });

    const res = await request(app)
      .get('/api/matching/cargo?lat=35.69&lng=51.39&radiusKm=50')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.cargo[0].title).toBe('Tehran cargo');
  });

  test('lat without lng (or vice versa) is validation_error', async () => {
    const { token: driverToken } = await createDriverWithVehicle(PHONE_DRIVER);
    const latOnly = await request(app)
      .get('/api/matching/cargo?lat=35.69')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(latOnly.status).toBe(400);
    expect(latOnly.body).toEqual({ error: 'validation_error' });

    const lngOnly = await request(app)
      .get('/api/matching/cargo?lng=51.39')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(lngOnly.status).toBe(400);
    expect(lngOnly.body).toEqual({ error: 'validation_error' });
  });

  test('non-numeric lat/lng is validation_error', async () => {
    const { token: driverToken } = await createDriverWithVehicle(PHONE_DRIVER);
    const res = await request(app)
      .get('/api/matching/cargo?lat=abc&lng=def')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  // --- Inactive vehicle ---

  test('using an inactive vehicleId is validation_error', async () => {
    const { token } = await registerDriverViaProfile(PHONE_DRIVER);
    const vRes = await request(app)
      .post('/api/driver/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleType: 'truck', plate: 'INACTIVE1IR11', capacityWeightKg: 30000 });
    expect(vRes.status).toBe(201);
    const vid = vRes.body.vehicle.id;
    await request(app)
      .patch(`/api/driver/vehicles/${vid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' });

    const res = await request(app)
      .get(`/api/matching/cargo?vehicleId=${vid}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('unknown /api/matching routes fall through to 404', async () => {
    const { token: driverToken } = await registerDriverViaProfile(PHONE_DRIVER);
    const res = await request(app)
      .get('/api/matching/nope')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});

require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { applyTestEnv, makeHelpers, cargoBody } = require('../helpers');

const PHONE_OWNER = '09121230101';
const PHONE_DRIVER = '09121230102';

describe('matching routes', () => {
  const app = createApp();
  const h = makeHelpers(app);

  beforeAll(() => {
    applyTestEnv();
  });

  function openCargoBody(overrides = {}) {
    return cargoBody({ title: 'Matching test cargo', ...overrides });
  }

  async function createDriverWithVehicle(phone, vehicleOverrides = {}) {
    const { token } = await h.registerDriverViaProfile(phone);
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
    const { token } = await h.register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/matching/cargo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('GET /api/matching/cargo with driver token returns 200', async () => {
    const { token } = await h.registerDriverViaProfile(PHONE_DRIVER);
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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken } = await h.registerDriverViaProfile(PHONE_DRIVER);

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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
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

  // --- Plan 028: mode / volume / reefer filters ---

  test('vehicleId filter hides sea and air cargo, keeps land cargo', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await createDriverWithVehicle(PHONE_DRIVER);

    await createAndPublishCargo(ownerToken, { title: 'Land cargo', transportMode: 'land' });
    await createAndPublishCargo(ownerToken, { title: 'Sea cargo', transportMode: 'sea' });
    await createAndPublishCargo(ownerToken, { title: 'Air cargo', transportMode: 'air' });

    const res = await request(app)
      .get(`/api/matching/cargo?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.cargo[0].title).toBe('Land cargo');
  });

  test('vehicleId filter still returns multimodal cargo for a truck', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await createDriverWithVehicle(PHONE_DRIVER);

    await createAndPublishCargo(ownerToken, { title: 'Multimodal cargo', transportMode: 'multimodal' });

    const res = await request(app)
      .get(`/api/matching/cargo?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.cargo[0].title).toBe('Multimodal cargo');
  });

  test('vehicleId filter hides refrigerated cargo for a non-reefer truck', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await createDriverWithVehicle(PHONE_DRIVER, {
      vehicleType: 'truck',
    });

    await createAndPublishCargo(ownerToken, {
      title: 'Chilled cargo',
      specialCharacteristics: ['refrigerated'],
    });

    const res = await request(app)
      .get(`/api/matching/cargo?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  test('reefer vehicle does receive refrigerated cargo', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await createDriverWithVehicle(PHONE_DRIVER, {
      vehicleType: 'reefer',
    });

    await createAndPublishCargo(ownerToken, {
      title: 'Chilled cargo',
      specialCharacteristics: ['refrigerated'],
    });

    const res = await request(app)
      .get(`/api/matching/cargo?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.cargo[0].title).toBe('Chilled cargo');
  });

  test('vehicleId filter excludes cargo with volume above vehicle capacity', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await createDriverWithVehicle(PHONE_DRIVER, {
      capacityVolumeM3: 30,
    });

    await createAndPublishCargo(ownerToken, { title: 'Fits cargo', dimensions: { weightKg: 10000, volumeM3: 20 } });
    await createAndPublishCargo(ownerToken, { title: 'Oversize cargo', dimensions: { weightKg: 10000, volumeM3: 50 } });

    const res = await request(app)
      .get(`/api/matching/cargo?vehicleId=${vehicleId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.cargo[0].title).toBe('Fits cargo');
  });

  test('without vehicleId, sea cargo is still listed (browse path unchanged)', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken } = await createDriverWithVehicle(PHONE_DRIVER);

    await createAndPublishCargo(ownerToken, { title: 'Sea cargo', transportMode: 'sea' });

    const res = await request(app)
      .get('/api/matching/cargo')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.cargo[0].title).toBe('Sea cargo');
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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
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
    const { token } = await h.registerDriverViaProfile(PHONE_DRIVER);
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
    const { token: driverToken } = await h.registerDriverViaProfile(PHONE_DRIVER);
    const res = await request(app)
      .get('/api/matching/nope')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});

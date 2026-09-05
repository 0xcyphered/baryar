require('../setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const Cargo = require('../../src/models/Cargo');
const Offer = require('../../src/models/Offer');
const User = require('../../src/models/User');

const PHONE_OWNER = '09121230201';
const PHONE_OWNER2 = '09121230202';
const PHONE_DRIVER = '09121230203';
const PHONE_DRIVER2 = '09121230204';
const PHONE_PURE_DRIVER = '09121230205';
const canon = (phone) => `+98${phone.slice(1)}`;
const FIXED_CODE = '123456';
const JWT_SECRET = 'test-secret-do-not-use';

describe('offers routes', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
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
      .send({ licenseNumber: 'L-OFFER-001' });
    expect([200, 201]).toContain(res.status);
    return { token, userId };
  }

  // Create a user with ONLY the driver role (no cargo_owner) for role isolation tests
  function makeDriverOnlyToken(phone) {
    return async () => {
      const user = await User.create({ phone: canon(phone), roles: ['driver'], phoneVerifiedAt: new Date() });
      const token = jwt.sign({ sub: user._id.toString(), phone: canon(phone) }, JWT_SECRET, { expiresIn: '7d' });
      return { token, userId: user._id.toString() };
    };
  }

  async function createVehicle(token, overrides = {}) {
    const plate = overrides.plate || `O${Date.now()}IR11`;
    const res = await request(app)
      .post('/api/driver/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vehicleType: 'truck',
        plate,
        capacityWeightKg: 30000,
        capacityVolumeM3: 60,
        year: 1400,
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.vehicle.id;
  }

  function openCargoBody(overrides = {}) {
    return {
      title: 'Offer test cargo',
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

  async function publishCargo(ownerToken, overrides = {}) {
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

  async function setupDriverWithVehicle(phone, plate) {
    const { token } = await registerDriverViaProfile(phone);
    const vehicleId = await createVehicle(token, { plate: plate || `V${Date.now()}IR11` });
    return { token, vehicleId };
  }

  // --- Auth ---

  test('POST /api/offers without token is 401', async () => {
    const res = await request(app).post('/api/offers').send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('POST /api/offers with cargo_owner (no driver role) is 403', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${token}`)
      .send({ cargoId: '0'.repeat(24), vehicleId: '0'.repeat(24), priceRial: 1000000 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  // --- Create offer ---

  test('POST /api/offers creates a pending offer for a driver', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'CREATE1IR11');
    const cargoId = await publishCargo(ownerToken);

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000, note: 'I can do it' });
    expect(res.status).toBe(201);
    expect(res.body.offer.status).toBe('pending');
    expect(res.body.offer.priceRial).toBe(5000000);
    expect(res.body.offer.note).toBe('I can do it');
    expect(res.body.offer.cargoId).toBe(cargoId);
    expect(res.body.offer.id).toMatch(/^[0-9a-f]{24}$/);
  });

  test('POST /api/offers with invalid cargoId is invalid_cargo_id', async () => {
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'BADCRG1IR11');
    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId: 'not-a-id', vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_cargo_id' });
  });

  test('POST /api/offers with invalid vehicleId is invalid_vehicle_id', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken } = await setupDriverWithVehicle(PHONE_DRIVER, 'BADVEH1IR11');
    const cargoId = await publishCargo(ownerToken);
    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId: 'not-a-id', priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_vehicle_id' });
  });

  test('POST /api/offers with non-open cargo is invalid_status', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'CLOSED1IR11');
    const createRes = await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(openCargoBody({ title: 'Draft cargo' }));
    const draftId = createRes.body.cargo.id;

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId: draftId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'invalid_status' });
  });

  test('POST /api/offers without priceRial is validation_error', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOPRCE1IR11');
    const cargoId = await publishCargo(ownerToken);
    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('POST /api/offers duplicate offer for same cargo is offer_exists', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'DUP111IR11');
    const cargoId = await publishCargo(ownerToken);

    const first = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1200000 });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'offer_exists' });
  });

  test('POST /api/offers with foreign vehicle is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken } = await setupDriverWithVehicle(PHONE_DRIVER, 'FRGNV1IR11');
    const other = await setupDriverWithVehicle(PHONE_DRIVER2, 'OTHER1IR11');
    const cargoId = await publishCargo(ownerToken);

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId: other.vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- List my offers (driver) ---

  test('GET /api/offers lists own offers as driver', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'LIST11IR11');
    const cargoId = await publishCargo(ownerToken);

    await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 3000000 });

    const res = await request(app)
      .get('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.offers[0].cargoId).toBe(cargoId);
    expect(res.body.offers[0].priceRial).toBe(3000000);
  });

  test('GET /api/offers with cargo_owner (no driver role) is 403', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/offers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  // --- List offers for cargo (owner) ---

  test('GET /api/offers/cargo/:cargoId/offers lists offers for own cargo', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'OWNRLIST1');
    const cargoId = await publishCargo(ownerToken, { title: 'Offers for this' });

    await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 4000000, note: 'Best price' });

    const res = await request(app)
      .get(`/api/offers/cargo/${cargoId}/offers`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.offers[0].note).toBe('Best price');
  });

  test('GET /api/offers/cargo/:cargoId/offers for foreign cargo is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: otherToken } = await register(PHONE_OWNER2);
    const cargoId = await publishCargo(ownerToken);

    const res = await request(app)
      .get(`/api/offers/cargo/${cargoId}/offers`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('GET /api/offers/cargo/:cargoId/offers with driver-only user is 403', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'DROFFR1IR1');
    const cargoId = await publishCargo(ownerToken);
    await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });

    // Use a pure driver (no cargo_owner role) via JWT
    const pureDriver = await makeDriverOnlyToken(PHONE_PURE_DRIVER);
    const { token: pureDriverToken } = await pureDriver();

    const res = await request(app)
      .get(`/api/offers/cargo/${cargoId}/offers`)
      .set('Authorization', `Bearer ${pureDriverToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  // --- Update offer (PATCH) ---

  test('PATCH /api/offers/:id updates price and note of own pending offer', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'PATCH1IR11');
    const cargoId = await publishCargo(ownerToken);

    const createRes = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000, note: 'original' });
    expect(createRes.status).toBe(201);
    const offerId = createRes.body.offer.id;

    const patch = await request(app)
      .patch(`/api/offers/${offerId}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ priceRial: 4500000, note: 'revised' });
    expect(patch.status).toBe(200);
    expect(patch.body.offer.priceRial).toBe(4500000);
    expect(patch.body.offer.note).toBe('revised');
    expect(patch.body.offer.status).toBe('pending');
  });

  test('PATCH /api/offers/:id on non-existent offer is not_found', async () => {
    const { token: driverToken } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOFND1IR11');
    const res = await request(app)
      .patch(`/api/offers/${'0'.repeat(24)}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ priceRial: 1000 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('PATCH /api/offers/:id on foreign offer is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'FOREIGN11I');
    const other = await setupDriverWithVehicle(PHONE_DRIVER2, 'FOREIGN22I');
    const cargoId = await publishCargo(ownerToken);

    const created = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });
    expect(created.status).toBe(201);

    const res = await request(app)
      .patch(`/api/offers/${created.body.offer.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ priceRial: 1000 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('PATCH /api/offers/:id with invalid offerId is invalid_offer_id', async () => {
    const { token: driverToken } = await setupDriverWithVehicle(PHONE_DRIVER, 'INVOF1IR11');
    const res = await request(app)
      .patch('/api/offers/not-a-mongo-id')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ priceRial: 1000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_offer_id' });
  });

  // --- Withdraw offer (DELETE) ---

  test('DELETE /api/offers/:id withdraws a pending offer', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'WITHDR1IR1');
    const cargoId = await publishCargo(ownerToken);

    const created = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });
    expect(created.status).toBe(201);

    const del = await request(app)
      .delete(`/api/offers/${created.body.offer.id}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const list = await request(app)
      .get('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(list.body.offers[0].status).toBe('withdrawn');
  });

  test('DELETE /api/offers/:id on non-existent is not_found', async () => {
    const { token: driverToken } = await setupDriverWithVehicle(PHONE_DRIVER, 'DELNOF1IR1');
    const res = await request(app)
      .delete(`/api/offers/${'0'.repeat(24)}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('DELETE /api/offers/:id on foreign offer is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'DELFRG1IR1');
    const other = await setupDriverWithVehicle(PHONE_DRIVER2, 'DELFRG2IR1');
    const cargoId = await publishCargo(ownerToken);

    const created = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });

    const res = await request(app)
      .delete(`/api/offers/${created.body.offer.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- Accept / award offer (cargo owner) ---

  test('POST /api/offers/:id/accept awards the offer — cargo becomes matched, shipment created', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'AWARD1IR11');
    const cargoId = await publishCargo(ownerToken);

    const offerRes = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 6000000 });
    expect(offerRes.status).toBe(201);

    const accept = await request(app)
      .post(`/api/offers/${offerRes.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(accept.status).toBe(200);
    expect(accept.body.offer.status).toBe('accepted');
    expect(accept.body.cargo.status).toBe('matched');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(shipments.status).toBe(200);
    expect(shipments.body.count).toBe(1);
    expect(shipments.body.shipments[0].cargoId).toBe(cargoId);
  });

  test('POST /api/offers/:id/accept from driver-only user is 403', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'ACCDRV1IR1');
    const cargoId = await publishCargo(ownerToken);

    const offerRes = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });

    const pureDriver = await makeDriverOnlyToken('09121230299');
    const { token: pureDriverToken } = await pureDriver();

    const res = await request(app)
      .post(`/api/offers/${offerRes.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${pureDriverToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('POST /api/offers/:id/accept for non-existent offer is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const res = await request(app)
      .post(`/api/offers/${'0'.repeat(24)}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('POST /api/offers/:id/accept for foreign owner is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: otherToken } = await register(PHONE_OWNER2);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'FROFFR1IR1');
    const cargoId = await publishCargo(ownerToken);

    const offerRes = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });

    const res = await request(app)
      .post(`/api/offers/${offerRes.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('accepting a second offer on same cargo fails (cargo already matched)', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const d1 = await setupDriverWithVehicle(PHONE_DRIVER, 'DBLACP1IR1');
    const d2 = await setupDriverWithVehicle(PHONE_DRIVER2, 'DBLACP2IR1');
    const cargoId = await publishCargo(ownerToken);

    const o1 = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${d1.token}`)
      .send({ cargoId, vehicleId: d1.vehicleId, priceRial: 5000000 });
    const o2 = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${d2.token}`)
      .send({ cargoId, vehicleId: d2.vehicleId, priceRial: 6000000 });

    const accept1 = await request(app)
      .post(`/api/offers/${o1.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(accept1.status).toBe(200);

    const accept2 = await request(app)
      .post(`/api/offers/${o2.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(accept2.status).toBe(409);
    expect(accept2.body).toEqual({ error: 'invalid_status' });
  });

  // --- Withdrawn offer cannot be updated ---

  test('PATCH /api/offers/:id on a withdrawn offer is invalid_status', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'WTHDRW1IR1');
    const cargoId = await publishCargo(ownerToken);

    const created = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });
    await request(app)
      .delete(`/api/offers/${created.body.offer.id}`)
      .set('Authorization', `Bearer ${driverToken}`);

    const patch = await request(app)
      .patch(`/api/offers/${created.body.offer.id}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ priceRial: 1000 });
    expect(patch.status).toBe(409);
    expect(patch.body).toEqual({ error: 'invalid_status' });
  });

  test('unknown /api/offers routes fall through to 404', async () => {
    const { token: driverToken } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOPEOF1IR1');
    const res = await request(app)
      .get('/api/offers/nope')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});

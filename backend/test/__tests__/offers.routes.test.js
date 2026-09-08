require('../setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const Offer = require('../../src/models/Offer');
const User = require('../../src/models/User');
const { applyTestEnv, FIXED_CODE, JWT_SECRET, canon, makeHelpers, cargoBody } = require('../helpers');

const PHONE_OWNER = '09121230201';
const PHONE_OWNER2 = '09121230202';
const PHONE_DRIVER = '09121230203';
const PHONE_DRIVER2 = '09121230204';
const PHONE_PURE_DRIVER = '09121230205';
const PHONE_PENDING_DRV = '09121230206';
const PHONE_REJECTED_DRV = '09121230207';

describe('offers routes', () => {
  const app = createApp();
  const h = makeHelpers(app);

  beforeAll(() => {
    applyTestEnv();
  });

  // Keep local: returns a factory (differs from helpers.makeDriverOnlyToken)
  function makeDriverOnlyToken(phone) {
    return async () => {
      const user = await User.create({ phone: canon(phone), roles: ['driver'], phoneVerifiedAt: new Date() });
      const token = jwt.sign({ sub: user._id.toString(), phone: canon(phone) }, JWT_SECRET, { expiresIn: '7d' });
      return { token, userId: user._id.toString() };
    };
  }

  // --- Auth ---

  test('POST /api/offers without token is 401', async () => {
    const res = await request(app).post('/api/offers').send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('POST /api/offers with cargo_owner (no driver role) is 403', async () => {
    const { token } = await h.register(PHONE_OWNER);
    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${token}`)
      .send({ cargoId: '0'.repeat(24), vehicleId: '0'.repeat(24), priceRial: 1000000 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  // --- Create offer ---

  test('POST /api/offers creates a pending offer for a driver', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'CREATE1IR11');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'BADCRG1IR11');
    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId: 'not-a-id', vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_cargo_id' });
  });

  test('POST /api/offers with invalid vehicleId is invalid_vehicle_id', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'BADVEH1IR11');
    const cargoId = await h.publishCargo(ownerToken);
    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId: 'not-a-id', priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_vehicle_id' });
  });

  test('POST /api/offers with non-open cargo is invalid_status', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'CLOSED1IR11');
    const createRes = await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(cargoBody({ title: 'Draft cargo' }));
    const draftId = createRes.body.cargo.id;

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId: draftId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'invalid_status' });
  });

  test('POST /api/offers without priceRial is validation_error', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'NOPRCE1IR11');
    const cargoId = await h.publishCargo(ownerToken);
    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('POST /api/offers duplicate offer for same cargo is offer_exists', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'DUP111IR11');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'FRGNV1IR11');
    const other = await h.setupDriverWithVehicle(PHONE_DRIVER2, 'OTHER1IR11');
    const cargoId = await h.publishCargo(ownerToken);

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId: other.vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- Plan 036: eligibility on create (vehicleFitsCargo) ---

  test('POST /api/offers on sea cargo with a truck is validation_error', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'SEAREJ1IR1');
    const cargoId = await h.publishCargo(ownerToken, { title: 'Sea cargo', transportMode: 'sea' });

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
    expect(await Offer.countDocuments()).toBe(0);
  });

  test('POST /api/offers on air cargo with a truck is validation_error', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'AIRREJ1IR1');
    const cargoId = await h.publishCargo(ownerToken, { title: 'Air cargo', transportMode: 'air' });

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
    expect(await Offer.countDocuments()).toBe(0);
  });

  test('POST /api/offers on multimodal cargo with a truck succeeds', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'MULTIM1IR1');
    const cargoId = await h.publishCargo(ownerToken, { title: 'Multimodal cargo', transportMode: 'multimodal' });

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(201);
    expect(res.body.offer.status).toBe('pending');
  });

  test('POST /api/offers above weight capacity is validation_error', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, {
      plate: 'WTREJ1IR11',
      capacityWeightKg: 5000,
    });
    const cargoId = await h.publishCargo(ownerToken, {
      title: 'Heavy cargo',
      dimensions: { weightKg: 8000, volumeM3: 10 },
    });

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
    expect(await Offer.countDocuments()).toBe(0);
  });

  test('POST /api/offers above volume capacity is validation_error', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, {
      plate: 'VOLREJ1IR1',
      capacityVolumeM3: 10,
    });
    const cargoId = await h.publishCargo(ownerToken, {
      title: 'Bulky cargo',
      dimensions: { weightKg: 1000, volumeM3: 50 },
    });

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
    expect(await Offer.countDocuments()).toBe(0);
  });

  test('POST /api/offers on refrigerated cargo with a dry truck is validation_error', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'DRYRFR1IR1');
    const cargoId = await h.publishCargo(ownerToken, {
      title: 'Chilled cargo',
      specialCharacteristics: ['refrigerated'],
    });

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
    expect(await Offer.countDocuments()).toBe(0);
  });

  test('POST /api/offers on refrigerated cargo with a reefer succeeds', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, {
      plate: 'REEFER1IR11',
      vehicleType: 'reefer',
    });
    const cargoId = await h.publishCargo(ownerToken, {
      title: 'Chilled cargo',
      specialCharacteristics: ['refrigerated'],
    });

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });
    expect(res.status).toBe(201);
    expect(res.body.offer.status).toBe('pending');
  });

  // --- List my offers (driver) ---

  test('GET /api/offers lists own offers as driver', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'LIST11IR11');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token } = await h.register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/offers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  // --- List offers for cargo (owner) ---

  test('GET /api/offers/cargo/:cargoId/offers lists offers for own cargo', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'OWNRLIST1');
    const cargoId = await h.publishCargo(ownerToken, { title: 'Offers for this' });

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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: otherToken } = await h.register(PHONE_OWNER2);
    const cargoId = await h.publishCargo(ownerToken);

    const res = await request(app)
      .get(`/api/offers/cargo/${cargoId}/offers`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('GET /api/offers/cargo/:cargoId/offers with driver-only user is 403', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'DROFFR1IR1');
    const cargoId = await h.publishCargo(ownerToken);
    await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 1000000 });

    // Use a pure driver (no cargo_owner role) via JWT
    const pureDriver = await makeDriverOnlyToken('09121230299');
    const { token: pureDriverToken } = await pureDriver();

    const res = await request(app)
      .get(`/api/offers/cargo/${cargoId}/offers`)
      .set('Authorization', `Bearer ${pureDriverToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  // --- Update offer (PATCH) ---

  test('PATCH /api/offers/:id updates price and note of own pending offer', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'PATCH1IR11');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: driverToken } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'NOFND1IR11');
    const res = await request(app)
      .patch(`/api/offers/${'0'.repeat(24)}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ priceRial: 1000 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('PATCH /api/offers/:id on foreign offer is not_found', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'FOREIGN11I');
    const other = await h.setupDriverWithVehicle(PHONE_DRIVER2, 'FOREIGN22I');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: driverToken } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'INVOF1IR11');
    const res = await request(app)
      .patch('/api/offers/not-a-mongo-id')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ priceRial: 1000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_offer_id' });
  });

  // --- Withdraw offer (DELETE) ---

  test('DELETE /api/offers/:id withdraws a pending offer', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'WITHDR1IR1');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: driverToken } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'DELNOF1IR1');
    const res = await request(app)
      .delete(`/api/offers/${'0'.repeat(24)}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('DELETE /api/offers/:id on foreign offer is not_found', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'DELFRG1IR1');
    const other = await h.setupDriverWithVehicle(PHONE_DRIVER2, 'DELFRG2IR1');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'AWARD1IR11');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'ACCDRV1IR1');
    const cargoId = await h.publishCargo(ownerToken);
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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const res = await request(app)
      .post(`/api/offers/${'0'.repeat(24)}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('POST /api/offers/:id/accept for foreign owner is not_found', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: otherToken } = await h.register(PHONE_OWNER2);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'FROFFR1IR1');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const d1 = await h.setupDriverWithVehicle(PHONE_DRIVER, 'DBLACP1IR1');
    const d2 = await h.setupDriverWithVehicle(PHONE_DRIVER2, 'DBLACP2IR1');
    const cargoId = await h.publishCargo(ownerToken);

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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'WTHDRW1IR1');
    const cargoId = await h.publishCargo(ownerToken);

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

  // --- Plan 028: owner cancel of open cargo rejects pending offers ---

  test('owner cancel of open cargo rejects the pending bid (not withdrawn)', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'CNCLREJ1IR1');
    const cargoId = await h.publishCargo(ownerToken);

    const offerRes = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 2000000 });
    expect(offerRes.status).toBe(201);
    expect(offerRes.body.offer.status).toBe('pending');

    const cancel = await request(app)
      .post(`/api/cargo/${cargoId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.cargo.status).toBe('cancelled');

    const list = await request(app)
      .get('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
    expect(list.body.offers[0].status).toBe('rejected');
  });

  test('unknown /api/offers routes fall through to 404', async () => {
    const { token: driverToken } = await h.setupDriverWithVehicle(PHONE_DRIVER, 'NOPEOF1IR1');
    const res = await request(app)
      .get('/api/offers/nope')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- Plan 052: driver verification gate ---

  test('pending driver POST /api/offers gets 403 driver_unverified', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: pendingToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_PENDING_DRV, 'PNDVOF1IR1');
    // Undo the approval: set profile back to pending
    const DriverProfile = require('../../src/models/DriverProfile');
    const pendingUser = await User.findOne({ phone: canon(PHONE_PENDING_DRV) });
    await DriverProfile.updateOne({ userId: pendingUser._id }, { verificationStatus: 'pending', verifiedAt: null });
    const cargoId = await h.publishCargo(ownerToken);

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${pendingToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'driver_unverified' });
    expect(await Offer.countDocuments()).toBe(0);
  });

  test('rejected driver POST /api/offers gets 403 driver_unverified', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: rejectedToken, vehicleId } = await h.setupDriverWithVehicle(PHONE_REJECTED_DRV, 'RJTVOF1IR1');
    // Set profile to rejected
    const DriverProfile = require('../../src/models/DriverProfile');
    const rejectedUser = await User.findOne({ phone: canon(PHONE_REJECTED_DRV) });
    await DriverProfile.updateOne({ userId: rejectedUser._id }, { verificationStatus: 'rejected', rejectionReason: 'bad docs' });
    const cargoId = await h.publishCargo(ownerToken);

    const res = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${rejectedToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'driver_unverified' });
    expect(await Offer.countDocuments()).toBe(0);
  });
});

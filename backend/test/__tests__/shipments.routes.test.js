require('../setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const Cargo = require('../../src/models/Cargo');
const Offer = require('../../src/models/Offer');
const Shipment = require('../../src/models/Shipment');
const ShipmentEvent = require('../../src/models/ShipmentEvent');
const User = require('../../src/models/User');

const PHONE_OWNER = '09121230301';
const PHONE_OWNER2 = '09121230302';
const PHONE_DRIVER = '09121230303';
const PHONE_DRIVER2 = '09121230304';
const canon = (phone) => `+98${phone.slice(1)}`;
const FIXED_CODE = '123456';
const JWT_SECRET = 'test-secret-do-not-use';

describe('shipments routes', () => {
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
      .send({ licenseNumber: 'L-SHIP-001' });
    expect([200, 201]).toContain(res.status);
    return { token, userId };
  }

  async function createVehicle(token, overrides = {}) {
    const plate = overrides.plate || `S${Date.now()}IR11`;
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
      title: 'Shipment test cargo',
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

  // Award a cargo to create a shipment (driver + owner get notification + shipment)
  async function awardCargo(ownerToken, driverToken, vehicleId, cargoTitle) {
    const cargoId = await publishCargo(ownerToken, { title: cargoTitle });
    const offer = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });
    expect(offer.status).toBe(201);
    const accept = await request(app)
      .post(`/api/offers/${offer.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(accept.status).toBe(200);
    return { cargoId, offerId: offer.body.offer.id };
  }

  // --- Auth ---

  test('GET /api/shipments without token is 401', async () => {
    const res = await request(app).get('/api/shipments');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  // --- List shipments ---

  test('GET /api/shipments returns shipments the user participates in (as driver)', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPLST1IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Shipment A');

    const res = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.shipments[0].status).toBe('assigned');
    expect(res.body.shipments[0].driverUserId).toBeDefined();
    expect(res.body.shipments[0].ownerUserId).toBeDefined();
  });

  test('GET /api/shipments returns shipments the user participates in (as owner)', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPOWN1IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Owner Shipment');

    const res = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  test('GET /api/shipments?status=assigned filters by status', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPFLT1IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Filter Test');

    const assigned = await request(app)
      .get('/api/shipments?status=assigned')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(assigned.status).toBe(200);
    expect(assigned.body.count).toBe(1);

    const completed = await request(app)
      .get('/api/shipments?status=completed')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(completed.status).toBe(200);
    expect(completed.body.count).toBe(0);
  });

  test('GET /api/shipments with bogus status is validation_error', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/shipments?status=bogus')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('GET /api/shipments with invalid cargoId is invalid_cargo_id', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/shipments?cargoId=not-a-mongo-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_cargo_id' });
  });

  // --- Get shipment by ID ---

  test('GET /api/shipments/:id returns the shipment for the driver', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPGET1IR1');
    const { cargoId } = await awardCargo(ownerToken, driverToken, vehicleId, 'Get Test');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.shipment.id).toBe(shipmentId);
    expect(res.body.shipment.cargoId).toBe(cargoId);
  });

  test('GET /api/shipments/:id returns the shipment for the owner', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPOW2IR11');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Owner Get');

    const ownerShipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${ownerToken}`);
    const shipmentId = ownerShipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.shipment.id).toBe(shipmentId);
  });

  test('GET /api/shipments/:id for foreign user is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: otherToken } = await register(PHONE_OWNER2);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPFOR1IR1');
    const { cargoId } = await awardCargo(ownerToken, driverToken, vehicleId, 'Foreign Get');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('GET /api/shipments/:id with malformed id is invalid_shipment_id', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/shipments/not-a-mongo-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_shipment_id' });
  });

  test('GET /api/shipments/:id with non-existent id is not_found', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get(`/api/shipments/${'0'.repeat(24)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- List events ---

  test('GET /api/shipments/:id/events returns status_change event from award', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPEVT1IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Events Test');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}/events`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.events[0].eventType).toBe('status_change');
    expect(res.body.events[0].toStatus).toBe('assigned');
  });

  test('GET /api/shipments/:id/events for foreign user is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: otherToken } = await register(PHONE_OWNER2);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPEVT2IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Events Foreign');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}/events`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- Status transitions (driver only) ---

  test('driver can transition assigned → loading → in_transit', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'TRNS11IR11');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Transition Test');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    // assigned → loading
    const t1 = await request(app)
      .post(`/api/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'loading' });
    expect(t1.status).toBe(200);
    expect(t1.body.shipment.status).toBe('loading');
    expect(t1.body.shipment.pickupAt).toBeTruthy();

    // loading → in_transit
    const t2 = await request(app)
      .post(`/api/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'in_transit' });
    expect(t2.status).toBe(200);
    expect(t2.body.shipment.status).toBe('in_transit');
  });

  test('driver can go in_transit → at_customs → in_transit → delivered → completed', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'TRNS22IR11');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Full Journey');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const steps = ['loading', 'in_transit', 'at_customs', 'in_transit', 'delivered', 'completed'];
    let currentStatus = 'assigned';
    for (const next of steps) {
      const res = await request(app)
        .post(`/api/shipments/${id}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: next });
      expect(res.status).toBe(200);
      expect(res.body.shipment.status).toBe(next);
      currentStatus = next;
    }

    // After 'completed', cargo should be completed
    const cargoRes = await request(app)
      .get('/api/cargo')
      .set('Authorization', `Bearer ${ownerToken}`);
    const cargo = cargoRes.body.cargo.find((c) => c.id === shipments.body.shipments[0].cargoId);
    expect(cargo.status).toBe('completed');
  });

  test('POST /api/shipments/:id/status is 401 without token', async () => {
    const res = await request(app)
      .post(`/api/shipments/${'0'.repeat(24)}/status`)
      .send({ status: 'loading' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('POST /api/shipments/:id/status from cargo_owner is 403', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'TRNS33IR11');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Owner Forbidden');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const res = await request(app)
      .post(`/api/shipments/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'loading' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('invalid transition (assigned → delivered) is invalid_status', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'TRNS44IR11');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Bad Transition');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const res = await request(app)
      .post(`/api/shipments/${id}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'delivered' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'invalid_status' });
  });

  test('invalid status value is validation_error', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'TRNS55IR11');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Bad Value');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const res = await request(app)
      .post(`/api/shipments/${id}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'flying' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('transition on foreign shipment is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'TRNS66IR11');
    const other = await setupDriverWithVehicle(PHONE_DRIVER2, 'TRNS77IR11');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Foreign Trans');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const res = await request(app)
      .post(`/api/shipments/${id}/status`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ status: 'loading' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  // --- Add event (driver only) ---

  test('POST /api/shipments/:id/events creates a custom event', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'EVTCRT1IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Event Create');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const res = await request(app)
      .post(`/api/shipments/${id}/events`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        eventType: 'cargo_loaded',
        note: 'All boxes loaded',
        location: { type: 'Point', coordinates: [51.39, 35.69] },
      });
    expect(res.status).toBe(201);
    expect(res.body.event.eventType).toBe('cargo_loaded');
    expect(res.body.event.note).toBe('All boxes loaded');
    expect(res.body.event.location).toEqual({ type: 'Point', coordinates: [51.39, 35.69] });
  });

  test('POST /api/shipments/:id/events with bad eventType is validation_error', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'EVTBAD1IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Event Bad Type');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const res = await request(app)
      .post(`/api/shipments/${id}/events`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ eventType: 'status_change' }); // status_change is service-managed
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('POST /api/shipments/:id/events from cargo_owner is 403', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'EVTOWN1IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Event Owner');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const res = await request(app)
      .post(`/api/shipments/${id}/events`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ eventType: 'checkpoint', note: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('POST /api/shipments/:id/events on foreign shipment is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'EVTFOR1IR1');
    const other = await setupDriverWithVehicle(PHONE_DRIVER2, 'EVTFOR2IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Event Foreign');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    const res = await request(app)
      .post(`/api/shipments/${id}/events`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ eventType: 'checkpoint' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('POST /api/shipments/:id/events with malformed shipment id is invalid_shipment_id', async () => {
    const { token } = await registerDriverViaProfile(PHONE_OWNER);
    const res = await request(app)
      .post('/api/shipments/not-a-mongo-id/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'checkpoint' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_shipment_id' });
  });

  // --- Notifications generated during transitions ---

  test('owner receives notification after driver transitions status', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOTIFY1IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Notify Test');

    // Owner should have a notification from award
    const notifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(notifs.status).toBe(200);
    expect(notifs.body.count).toBeGreaterThanOrEqual(1);
    expect(notifs.body.notifications[0].type).toBe('shipment_assigned');

    // Transition
    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const id = shipments.body.shipments[0].id;

    await request(app)
      .post(`/api/shipments/${id}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'loading' });

    // Owner gets a status notification
    const notifsAfter = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(notifsAfter.body.count).toBeGreaterThanOrEqual(2);
    const statusNotif = notifsAfter.body.notifications.find((n) => n.type === 'shipment_status');
    expect(statusNotif).toBeDefined();
  });

  test('GET /api/shipments/:id/cargo returns publicCargo for the awarded driver', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPCRG1IR1');
    const { cargoId } = await awardCargo(ownerToken, driverToken, vehicleId, 'Cargo Read');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}/cargo`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cargo.id).toBe(cargoId);
    expect(res.body.cargo.title).toBe('Cargo Read');
    expect(res.body.cargo.status).toBe('matched'); // publish + award flips cargo to matched
    expect(res.body.cargo.origin.location.coordinates).toEqual([51.39, 35.69]);
    expect(res.body.cargo.destination).toBeDefined();
    expect(res.body.cargo.destination.address).toBe('Isfahan');
    expect(res.body.cargo.dimensions.weightKg).toBe(10000);
    expect(res.body.cargo.transportMode).toBe('land');
    expect(Object.keys(res.body.cargo).sort()).toEqual(
      [
        'createdAt',
        'deliverBy',
        'description',
        'destination',
        'dimensions',
        'id',
        'origin',
        'ownerUserId',
        'pickupAt',
        'specialCharacteristics',
        'status',
        'title',
        'transportMode',
        'updatedAt',
      ].sort()
    );
  });

  test('GET /api/shipments/:id/cargo returns the same cargo for the owner', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPCRG2IR1');
    const { cargoId } = await awardCargo(ownerToken, driverToken, vehicleId, 'Owner Cargo Read');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${ownerToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}/cargo`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cargo.id).toBe(cargoId);
  });

  test('GET /api/shipments/:id/cargo for unrelated user is not_found (404, not 403)', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: otherToken } = await register(PHONE_OWNER2);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPCRG3IR1');
    await awardCargo(ownerToken, driverToken, vehicleId, 'Foreign Cargo Read');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}/cargo`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('GET /api/shipments/:id/cargo is 401 without token', async () => {
    const res = await request(app).get(`/api/shipments/${'0'.repeat(24)}/cargo`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('GET /api/shipments/:id/cargo with malformed id is invalid_shipment_id', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/shipments/not-a-mongo-id/cargo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_shipment_id' });
  });

  test('GET /api/shipments/:id still has no nested cargo (037 does not change the shipment shape)', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'SHPCRG4IR1');
    const { cargoId } = await awardCargo(ownerToken, driverToken, vehicleId, 'Shape Guard');

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const res = await request(app)
      .get(`/api/shipments/${shipmentId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.shipment.cargo).toBeUndefined();
    expect(res.body.shipment.cargoId).toBe(cargoId);
  });

  test('GET /api/shipments with invalid cargoId is invalid_cargo_id', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/shipments?cargoId=zzzzzz')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_cargo_id' });
  });
});

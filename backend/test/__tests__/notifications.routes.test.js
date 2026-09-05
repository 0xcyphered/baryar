require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const Notification = require('../../src/models/Notification');

const PHONE_OWNER = '09121230401';
const PHONE_DRIVER = '09121230402';
const canon = (phone) => `+98${phone.slice(1)}`;
const FIXED_CODE = '123456';

describe('notifications routes', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.JWT_SECRET='test-...';
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
      .send({ licenseNumber: 'L-NOTIF-001' });
    expect([200, 201]).toContain(res.status);
    return { token, userId };
  }

  async function createVehicle(token, overrides = {}) {
    const plate = overrides.plate || `N${Date.now()}IR11`;
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
      title: 'Notification test cargo',
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

  async function awardCargo(ownerToken, driverToken, vehicleId) {
    const cargoId = await publishCargo(ownerToken);
    const offer = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });
    expect(offer.status).toBe(201);
    const accept = await request(app)
      .post(`/api/offers/${offer.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(accept.status).toBe(200);
    return { cargoId, shipmentId: null }; // shipmentId is obtained from shipments endpoint
  }

  // --- Auth ---

  test('GET /api/notifications without token is 401', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  // --- List notifications ---

  test('GET /api/notifications returns empty list for user with no notifications', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
    expect(res.body.count).toBe(0);
    expect(res.body.unreadCount).toBe(0);
  });

  test('GET /api/notifications returns notifications after a shipment is created', async () => {
    const { token: ownerToken, userId: ownerUserId } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT11IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.unreadCount).toBeGreaterThanOrEqual(1);

    const notif = res.body.notifications[0];
    expect(notif).toHaveProperty('id');
    expect(notif).toHaveProperty('type');
    expect(notif).toHaveProperty('title');
    expect(notif).toHaveProperty('body');
    expect(notif).toHaveProperty('shipmentId');
    expect(notif).toHaveProperty('cargoId');
    expect(notif.readAt).toBeNull();
  });

  test('driver also receives notification from award', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT22IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.notifications[0].type).toBe('shipment_assigned');
  });

  // --- Filter: unread only ---

  test('GET /api/notifications?unread=true returns only unread', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT33IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    // Mark one as read
    const allNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const firstId = allNotifs.body.notifications[0].id;
    await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const unread = await request(app)
      .get('/api/notifications?unread=true')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unread.status).toBe(200);
    for (const n of unread.body.notifications) {
      expect(n.readAt).toBeNull();
    }
    expect(unread.body.unreadCount).toBe(allNotifs.body.unreadCount - 1);
  });

  // --- Mark as read ---

  test('PATCH /api/notifications/:id/read marks a notification as read', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT44IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const allNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const firstId = allNotifs.body.notifications[0].id;

    const res = await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Verify it's now read
    const after = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const updated = after.body.notifications.find((n) => n.id === firstId);
    expect(updated.readAt).not.toBeNull();
  });

  test('PATCH /api/notifications/:id/read on already-read is still 200 (idempotent)', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT55IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const allNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const firstId = allNotifs.body.notifications[0].id;

    await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Second time is still ok
    const res2 = await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ ok: true });
  });

  test('PATCH /api/notifications/:id/read on non-existent is not_found', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .patch(`/api/notifications/${'0'.repeat(24)}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('PATCH /api/notifications/:id/read for foreign user is not_found', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT66IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const allNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const firstId = allNotifs.body.notifications[0].id;

    // Try to read it with the driver's token
    const res = await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('PATCH /api/notifications/:id/read with malformed id is invalid_notification_id', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await request(app)
      .patch('/api/notifications/not-a-mongo-id/read')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_notification_id' });
  });

  // --- Notifications from status transitions ---

  test('notification is created when driver transitions shipment status', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT77IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const before = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const countBefore = before.body.count;

    await request(app)
      .post(`/api/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'loading' });

    const after = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(after.body.count).toBe(countBefore + 1);
    const newest = after.body.notifications[0]; // sorted newest first
    expect(newest.type).toBe('shipment_status');
  });

  test('driver does not get notification for own status transition (excludeUserId)', async () => {
    const { token: ownerToken } = await register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT88IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const shipments = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${driverToken}`);
    const shipmentId = shipments.body.shipments[0].id;

    const before = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${driverToken}`);
    const countBefore = before.body.count;

    await request(app)
      .post(`/api/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'loading' });

    const after = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${driverToken}`);
    // Driver should NOT get a status notification for their own transition
    expect(after.body.count).toBe(countBefore);
  });
});

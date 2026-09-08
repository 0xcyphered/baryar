require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const Notification = require('../../src/models/Notification');
const { applyTestEnv, makeHelpers, cargoBody } = require('../helpers');

const PHONE_OWNER = '09121230401';
const PHONE_DRIVER = '09121230402';

describe('notifications routes', () => {
  const app = createApp();
  const h = makeHelpers(app);

  beforeAll(() => {
    applyTestEnv();
  });

  async function setupDriverWithVehicle(phone, plate) {
    const { token, userId } = await h.registerDriverViaProfile(phone);
    const vehicleId = await h.createVehicle(token, { plate: plate || `V${Date.now()}IR11` });
    await h.approveDriver(userId);
    return { token, vehicleId };
  }

  async function awardCargo(ownerToken, driverToken, vehicleId) {
    const cargoId = await h.publishCargo(ownerToken);
    const offer = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial: 5000000 });
    expect(offer.status).toBe(201);
    const accept = await request(app)
      .post(`/api/offers/${offer.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(accept.status).toBe(200);
    return { cargoId, shipmentId: null };
  }

  // --- Auth ---

  test('GET /api/notifications without token is 401', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  // --- List notifications ---

  test('GET /api/notifications returns empty list for user with no notifications', async () => {
    const { token } = await h.register(PHONE_OWNER);
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
    expect(res.body.count).toBe(0);
    expect(res.body.unreadCount).toBe(0);
  });

  test('GET /api/notifications returns notifications after a shipment is created', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT33IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

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
    const { token: ownerToken } = await h.register(PHONE_OWNER);
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

    const after = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const updated = after.body.notifications.find((n) => n.id === firstId);
    expect(updated.readAt).not.toBeNull();
  });

  test('PATCH /api/notifications/:id/read on already-read is still 200 (idempotent)', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT55IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const allNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const firstId = allNotifs.body.notifications[0].id;

    await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res2 = await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ ok: true });
  });

  test('PATCH /api/notifications/:id/read on non-existent is not_found', async () => {
    const { token } = await h.register(PHONE_OWNER);
    const res = await request(app)
      .patch(`/api/notifications/${'0'.repeat(24)}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('PATCH /api/notifications/:id/read for foreign user is not_found', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle(PHONE_DRIVER, 'NOT66IR11');
    await awardCargo(ownerToken, driverToken, vehicleId);

    const allNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const firstId = allNotifs.body.notifications[0].id;

    const res = await request(app)
      .patch(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('PATCH /api/notifications/:id/read with malformed id is invalid_notification_id', async () => {
    const { token } = await h.register(PHONE_OWNER);
    const res = await request(app)
      .patch('/api/notifications/not-a-mongo-id/read')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_notification_id' });
  });

  // --- Notifications from status transitions ---

  test('notification is created when driver transitions shipment status', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
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
    const newest = after.body.notifications[0];
    expect(newest.type).toBe('shipment_status');
  });

  test('driver does not get notification for own status transition (excludeUserId)', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
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
    expect(after.body.count).toBe(countBefore);
  });

  // --- Offer notifications (plan 029) ---

  async function openCargoForOffer(ownerToken, title) {
    const created = await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(cargoBody({ title }));
    expect(created.status).toBe(201);
    const id = created.body.cargo.id;
    const pub = await request(app)
      .post(`/api/cargo/${id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(pub.status).toBe(200);
    return id;
  }

  async function makeOffer(driverToken, cargoId, vehicleId, priceRial) {
    return request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cargoId, vehicleId, priceRial });
  }

  test('owner gets offer_received with null shipmentId when a driver bids; bidder does not', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle('09121230403', 'NOT91IR11');
    const cargoId = await openCargoForOffer(ownerToken, 'Offer received cargo');

    const offer = await makeOffer(driverToken, cargoId, vehicleId, 7000000);
    expect(offer.status).toBe(201);

    const ownerRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerRes.status).toBe(200);
    const received = ownerRes.body.notifications.filter((n) => n.type === 'offer_received');
    expect(received).toHaveLength(1);
    expect(received[0].shipmentId).toBeNull();
    expect(received[0].cargoId).toBe(cargoId);

    const driverRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${driverToken}`);
    const driverOfferNotifs = driverRes.body.notifications.filter((n) => n.type === 'offer_received');
    expect(driverOfferNotifs).toHaveLength(0);
  });

  test('losing bidder gets offer_rejected; winner gets shipment_assigned and no offer_rejected', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: winnerToken, vehicleId: winnerVehicle } = await setupDriverWithVehicle('09121230404', 'NOT92IR11');
    const { token: loserToken, vehicleId: loserVehicle } = await setupDriverWithVehicle('09121230405', 'NOT93IR11');
    const cargoId = await openCargoForOffer(ownerToken, 'Two-bidder cargo');

    const winOffer = await makeOffer(winnerToken, cargoId, winnerVehicle, 5000000);
    expect(winOffer.status).toBe(201);
    const loseOffer = await makeOffer(loserToken, cargoId, loserVehicle, 6000000);
    expect(loseOffer.status).toBe(201);

    const accept = await request(app)
      .post(`/api/offers/${winOffer.body.offer.id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(accept.status).toBe(200);

    const loserRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${loserToken}`);
    const loserRejected = loserRes.body.notifications.filter((n) => n.type === 'offer_rejected');
    expect(loserRejected.length).toBeGreaterThanOrEqual(1);

    const winnerRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${winnerToken}`);
    const winnerTypes = winnerRes.body.notifications.map((n) => n.type);
    expect(winnerTypes).toContain('shipment_assigned');
    expect(winnerTypes).not.toContain('offer_rejected');
  });

  test('offer_rejected on cancelled cargo has null shipmentId (cancel path)', async () => {
    const { token: ownerToken } = await h.register(PHONE_OWNER);
    const { token: driverToken, vehicleId } = await setupDriverWithVehicle('09121230406', 'NOT94IR11');
    const cargoId = await openCargoForOffer(ownerToken, 'Cancelled with pending bid');

    const offer = await makeOffer(driverToken, cargoId, vehicleId, 3000000);
    expect(offer.status).toBe(201);

    const cancel = await request(app)
      .post(`/api/cargo/${cargoId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(cancel.status).toBe(200);

    const driverRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${driverToken}`);
    const rejected = driverRes.body.notifications.filter((n) => n.type === 'offer_rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].shipmentId).toBeNull();
    expect(rejected[0].cargoId).toBe(cargoId);
  });
});

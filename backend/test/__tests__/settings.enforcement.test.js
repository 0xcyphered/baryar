require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { applyTestEnv, makeHelpers } = require('../helpers');

// Plan 029 Step 6 cases 5 + 6: settings enforcement —
//   maxActiveCargoPerOwner 409 cap on POST /api/cargo
//   maintenanceMode 503 on non-admin writes (reads and auth stay up)

const PHONE_OWNER = '09121230701';
const PHONE_ADMIN = '09121230709';
describe('settings enforcement (plan 029)', () => {
  const app = createApp();
  const h = makeHelpers(app);

  beforeAll(() => {
    applyTestEnv();
  });




  function validCargoBody(overrides = {}) {
    return {
      title: 'Settings enforcement cargo',
      transportMode: 'land',
      origin: { address: 'Tehran depot', location: { coordinates: [51.389, 35.6892] } },
      destination: { address: 'Bandar Abbas', location: { coordinates: [56.2705, 27.1832] } },
      dimensions: { weightKg: 24000, volumeM3: 40 },
      specialCharacteristics: [],
      pickupAt: '2026-09-10T08:00:00.000Z',
      deliverBy: '2026-09-12T18:00:00.000Z',
      ...overrides,
    };
  }

  async function createCargo(token, overrides = {}) {
    return request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${token}`)
      .send(validCargoBody(overrides));
  }

  // --- Case 5: maxActiveCargoPerOwner cap ---

  test('cargo_limit 409 at cap; cancel frees a slot; cap 0 is strict', async () => {
    const { token: adminToken } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownerToken } = await h.register(PHONE_OWNER);

    const put = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxActiveCargoPerOwner: 1 });
    expect(put.status).toBe(200);

    const first = await createCargo(ownerToken, { title: 'Cap first' });
    expect(first.status).toBe(201);

    const second = await createCargo(ownerToken, { title: 'Cap second' });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'cargo_limit' });

    // Another owner is not affected (cap is per owner).
    const { token: otherToken } = await h.register('09121230702');
    const other = await createCargo(otherToken, { title: 'Other owner ok' });
    expect(other.status).toBe(201);

    // Cancel the first draft (draft cancel needs no offers) and create again.
    const cancel = await request(app)
      .post(`/api/cargo/${first.body.cargo.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(cancel.status).toBe(200);

    const third = await createCargo(ownerToken, { title: 'Cap third after cancel' });
    expect(third.status).toBe(201);

    // Cap 0 means no new cargo at all (strict), not unlimited.
    const zero = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxActiveCargoPerOwner: 0 });
    expect(zero.status).toBe(200);
    const blocked = await createCargo(otherToken, { title: 'Cap zero blocked' });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toEqual({ error: 'cargo_limit' });

    // Restore defaults for later tests (setup.js wipes collections, but the
    // settings singleton write keeps the suite honest if ordering changes).
    await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxActiveCargoPerOwner: 20, maintenanceMode: false });
  });

  // --- Case 6: maintenanceMode 503 ---

  test('maintenance 503 on owner writes; GET and auth stay up; admin bypasses', async () => {
    const { token: adminToken, userId: adminId } = await h.createAdmin(PHONE_ADMIN);
    const { token: ownerToken, userId: ownerId } = await h.register(PHONE_OWNER);

    const on = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maintenanceMode: true });
    expect(on.status).toBe(200);
    expect(on.body.settings.maintenanceMode).toBe(true);

    // Owner write -> 503 maintenance
    const post = await createCargo(ownerToken, { title: 'During maintenance' });
    expect(post.status).toBe(503);
    expect(post.body).toEqual({ error: 'maintenance' });

    // Owner read -> 200
    const get = await request(app).get('/api/cargo').set('Authorization', `Bearer ${ownerToken}`);
    expect(get.status).toBe(200);

    // Auth stays up -> 200
    const otp = await request(app).post('/api/auth/request-otp').send({ phone: '09121230703' });
    expect(otp.status).toBe(200);

    // Admin write bypasses -> 200
    const patch = await request(app)
      .patch(`/api/admin/users/${ownerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Owner During Maintenance' });
    expect(patch.status).toBe(200);

    // Turn maintenance off and owner writes work again.
    const off = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maintenanceMode: false });
    expect(off.status).toBe(200);

    const after = await createCargo(ownerToken, { title: 'After maintenance' });
    expect(after.status).toBe(201);

    // Sanity: admin id must exist (guards against a mint mistake).
    expect(adminId).toMatch(/^[0-9a-f]{24}$/);
  });
});

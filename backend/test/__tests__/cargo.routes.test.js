require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');

const PHONE_OWNER = '09121230001'; // canonical +989****0001
const PHONE_OTHER = '09121230002'; // canonical +989****0002
const PHONE_DRIVER = '09121230003'; // roles: ['driver']
const canon = (phone) => `+98${phone.slice(1)}`;
const FIXED_CODE = '123456';

describe('cargo draft CRUD', () => {
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

  async function registerDriver(phone) {
    await User.create({ phone: canon(phone), roles: ['driver'] });
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone, code: FIXED_CODE });
    expect(res.status).toBe(200);
    return res.body.token;
  }

  function validCargoBody() {
    return {
      title: 'Steel coils',
      transportMode: 'land',
      origin: { address: 'Tehran depot', location: { coordinates: [51.3890, 35.6892] } },
      destination: { address: 'Bandar Abbas', location: { coordinates: [56.2705, 27.1832] } },
      dimensions: { weightKg: 24000, volumeM3: 40 },
      specialCharacteristics: ['oversized'],
      pickupAt: '2026-09-10T08:00:00.000Z',
      deliverBy: '2026-09-12T18:00:00.000Z',
    };
  }

  async function createCargo(token, overrides = {}) {
    const res = await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validCargoBody(), ...overrides });
    return res;
  }

  test('1. POST /api/cargo creates a draft owned by the token user', async () => {
    const { token, userId } = await register(PHONE_OWNER);
    const res = await createCargo(token);
    expect(res.status).toBe(201);
    expect(res.body.cargo.status).toBe('draft');
    expect(res.body.cargo.id).toMatch(/^[0-9a-f]{24}$/);
    expect(res.body.cargo.ownerUserId).toBe(userId);
    expect(res.body.cargo.origin.location.coordinates).toEqual([51.3890, 35.6892]);
    expect(res.body.cargo.transportMode).toBe('land');
  });

  test('2. POST ignores smuggled status and ownerUserId — owner always from the token', async () => {
    const { token, userId } = await register(PHONE_OWNER);
    const res = await createCargo(token, { status: 'open', ownerUserId: 'f'.repeat(24) });
    expect(res.status).toBe(201);
    expect(res.body.cargo.status).toBe('draft');
    expect(res.body.cargo.ownerUserId).toBe(userId);
  });

  test('3. POST without origin (or destination) is validation_error', async () => {
    const { token } = await register(PHONE_OWNER);
    const noOrigin = validCargoBody();
    delete noOrigin.origin;
    const res1 = await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${token}`)
      .send(noOrigin);
    expect(res1.status).toBe(400);
    expect(res1.body).toEqual({ error: 'validation_error' });

    const noDest = validCargoBody();
    delete noDest.destination;
    const res2 = await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${token}`)
      .send(noDest);
    expect(res2.status).toBe(400);
    expect(res2.body).toEqual({ error: 'validation_error' });
  });

  test('4. POST rejects bad transportMode, bad specialCharacteristics, and bad coordinates', async () => {
    const { token } = await register(PHONE_OWNER);

    const badMode = await createCargo(token, { transportMode: 'spaceship' });
    expect(badMode.status).toBe(400);
    expect(badMode.body).toEqual({ error: 'validation_error' });

    const badSpecial = await createCargo(token, { specialCharacteristics: ['radioactive'] });
    expect(badSpecial.status).toBe(400);
    expect(badSpecial.body).toEqual({ error: 'validation_error' });

    const badCoords = validCargoBody();
    badCoords.origin.location.coordinates = [51.38];
    const res = await createCargo(token, badCoords);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('5. POST with deliverBy before pickupAt is validation_error', async () => {
    const { token } = await register(PHONE_OWNER);
    const res = await createCargo(token, {
      pickupAt: '2026-09-12T18:00:00.000Z',
      deliverBy: '2026-09-10T08:00:00.000Z',
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });
  });

  test('6. GET /api/cargo lists own cargoes newest first with a count', async () => {
    const { token, userId } = await register(PHONE_OWNER);
    const first = await createCargo(token, { title: 'First load' });
    expect(first.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 5)); // distinct createdAt
    const second = await createCargo(token, { title: 'Second load' });
    expect(second.status).toBe(201);

    const res = await request(app).get('/api/cargo').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.cargo).toHaveLength(2);
    expect(res.body.cargo[0].id).toBe(second.body.cargo.id);
    expect(res.body.cargo[1].id).toBe(first.body.cargo.id);
    for (const cargo of res.body.cargo) {
      expect(cargo.ownerUserId).toBe(userId);
    }
  });

  test('7. GET /api/cargo?status=open filters own published cargo; bogus status is validation_error', async () => {
    const { token } = await register(PHONE_OWNER);
    const draft = await createCargo(token, { title: 'Stays draft' });
    const published = await createCargo(token, { title: 'Gets published' });
    const pub = await request(app)
      .post(`/api/cargo/${published.body.cargo.id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(pub.status).toBe(200);

    const open = await request(app).get('/api/cargo?status=open').set('Authorization', `Bearer ${token}`);
    expect(open.status).toBe(200);
    expect(open.body.count).toBe(1);
    expect(open.body.cargo[0].id).toBe(published.body.cargo.id);
    expect(open.body.cargo[0].id).not.toBe(draft.body.cargo.id);

    const bogus = await request(app).get('/api/cargo?status=bogus').set('Authorization', `Bearer ${token}`);
    expect(bogus.status).toBe(400);
    expect(bogus.body).toEqual({ error: 'validation_error' });
  });

  test('8. GET /api/cargo/:id — own 200, other owner 404, malformed id 400, missing id 404', async () => {
    const owner = await register(PHONE_OWNER);
    const other = await register(PHONE_OTHER);
    const created = await createCargo(owner.token);
    const id = created.body.cargo.id;

    const own = await request(app).get(`/api/cargo/${id}`).set('Authorization', `Bearer ${owner.token}`);
    expect(own.status).toBe(200);
    expect(own.body.cargo.id).toBe(id);

    const foreign = await request(app).get(`/api/cargo/${id}`).set('Authorization', `Bearer ${other.token}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'not_found' });

    const malformed = await request(app)
      .get('/api/cargo/not-an-objectid')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'invalid_cargo_id' });

    const missing = await request(app)
      .get(`/api/cargo/${'0'.repeat(24)}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'not_found' });
  });

  test('9. PATCH own draft updates fields and stays draft', async () => {
    const { token } = await register(PHONE_OWNER);
    const created = await createCargo(token);
    const id = created.body.cargo.id;

    const res = await request(app)
      .patch(`/api/cargo/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Steel coils (revised)', dimensions: { weightKg: 26000 } });
    expect(res.status).toBe(200);
    expect(res.body.cargo.title).toBe('Steel coils (revised)');
    expect(res.body.cargo.dimensions.weightKg).toBe(26000);
    expect(res.body.cargo.status).toBe('draft');

    const refetch = await request(app).get(`/api/cargo/${id}`).set('Authorization', `Bearer ${token}`);
    expect(refetch.body.cargo.title).toBe('Steel coils (revised)');
    expect(refetch.body.cargo.dimensions.weightKg).toBe(26000);
  });

  test('10. PATCH and DELETE are invalid_status after publish', async () => {
    const { token } = await register(PHONE_OWNER);
    const created = await createCargo(token);
    const id = created.body.cargo.id;
    const pub = await request(app).post(`/api/cargo/${id}/publish`).set('Authorization', `Bearer ${token}`);
    expect(pub.status).toBe(200);

    const patch = await request(app)
      .patch(`/api/cargo/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Should not apply' });
    expect(patch.status).toBe(409);
    expect(patch.body).toEqual({ error: 'invalid_status' });

    const del = await request(app).delete(`/api/cargo/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(409);
    expect(del.body).toEqual({ error: 'invalid_status' });
  });

  test('11. PATCH another owner’s draft is not_found', async () => {
    const owner = await register(PHONE_OWNER);
    const other = await register(PHONE_OTHER);
    const created = await createCargo(owner.token);

    const res = await request(app)
      .patch(`/api/cargo/${created.body.cargo.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ title: 'Hijack attempt' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('12. DELETE own draft removes it; subsequent GET is 404', async () => {
    const { token } = await register(PHONE_OWNER);
    const created = await createCargo(token);
    const id = created.body.cargo.id;

    const res = await request(app).delete(`/api/cargo/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const refetch = await request(app).get(`/api/cargo/${id}`).set('Authorization', `Bearer ${token}`);
    expect(refetch.status).toBe(404);
    expect(refetch.body).toEqual({ error: 'not_found' });
  });

  test('13. publish flips draft → open; publishing again is invalid_status', async () => {
    const { token } = await register(PHONE_OWNER);
    const created = await createCargo(token);
    const id = created.body.cargo.id;

    const pub = await request(app).post(`/api/cargo/${id}/publish`).set('Authorization', `Bearer ${token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.cargo.status).toBe('open');

    const again = await request(app).post(`/api/cargo/${id}/publish`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'invalid_status' });
  });

  test('14. cancel works from draft and open; cancelled cannot be cancelled again', async () => {
    const { token } = await register(PHONE_OWNER);

    const draft = await createCargo(token, { title: 'Cancel from draft' });
    const cancelDraft = await request(app)
      .post(`/api/cargo/${draft.body.cargo.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancelDraft.status).toBe(200);
    expect(cancelDraft.body.cargo.status).toBe('cancelled');

    const again = await request(app)
      .post(`/api/cargo/${draft.body.cargo.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'invalid_status' });

    const published = await createCargo(token, { title: 'Cancel from open' });
    await request(app)
      .post(`/api/cargo/${published.body.cargo.id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    const cancelOpen = await request(app)
      .post(`/api/cargo/${published.body.cargo.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancelOpen.status).toBe(200);
    expect(cancelOpen.body.cargo.status).toBe('cancelled');
  });

  test('15. missing Authorization header is unauthorized before any role check', async () => {
    const res = await request(app).get('/api/cargo');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('16. driver-only user is forbidden on /api/cargo', async () => {
    const token = await registerDriver(PHONE_DRIVER);
    const res = await request(app).get('/api/cargo').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('17. GET /api/does-not-exist still falls through to not_found', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});

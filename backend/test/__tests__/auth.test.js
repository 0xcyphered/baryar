require('../setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const OtpChallenge = require('../../src/models/OtpChallenge');

const PHONE = '09121234567';
const CANON = '+989121234567';
const CANON_BLOCKED = '+989121234568';
const CANON_LOCK = '+989121234569';
const FIXED_CODE = '123456';

describe('auth OTP', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use';
    process.env.OTP_FIXED_CODE = FIXED_CODE;
    process.env.NODE_ENV = 'test';
  });

  test('request-otp issues one hashed challenge, never leaks the code, and enforces the resend cooldown', async () => {
    const res = await request(app).post('/api/auth/request-otp').send({ phone: PHONE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(JSON.stringify(res.body)).not.toContain(FIXED_CODE);
    expect(res.body.code).toBeUndefined();

    const challenges = await OtpChallenge.find({ phone: CANON });
    expect(challenges).toHaveLength(1);
    expect(typeof challenges[0].codeHash).toBe('string');
    expect(challenges[0].codeHash).not.toBe(FIXED_CODE);
    expect(challenges[0].codeHash.length).toBeGreaterThan(20);
    expect(challenges[0].consumedAt).toBeNull();
    expect(challenges[0].attemptCount).toBe(0);
    expect(challenges[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    const res2 = await request(app).post('/api/auth/request-otp').send({ phone: PHONE });
    expect(res2.status).toBe(429);
    expect(res2.body).toEqual({ error: 'otp_cooldown' });

    const live = await OtpChallenge.find({ phone: CANON, consumedAt: null });
    expect(live).toHaveLength(1);
  });

  test('verify-otp rejects a wrong code with otp_invalid', async () => {
    await request(app).post('/api/auth/request-otp').send({ phone: PHONE });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone: PHONE, code: '000000' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'otp_invalid' });
  });

  test('verify-otp with the correct code upserts a cargo_owner user and returns a bearer token', async () => {
    await request(app).post('/api/auth/request-otp').send({ phone: PHONE });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone: PHONE, code: FIXED_CODE });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(20);
    expect(res.body.user.phone).toBe(CANON);
    expect(res.body.user.roles).toEqual(['cargo_owner']);
    expect(res.body.user.status).toBe('active');
    expect(res.body.user.id).toMatch(/^[0-9a-f]{24}$/);
    expect(Object.keys(res.body.user).sort()).toEqual([
      'email', 'id', 'name', 'nationalId', 'phone', 'phoneVerifiedAt', 'roles', 'status',
    ]);

    const user = await User.findOne({ phone: CANON });
    expect(user).not.toBeNull();
    expect(user.phoneVerifiedAt).toBeInstanceOf(Date);

    const challenge = await OtpChallenge.findOne({ phone: CANON }).sort({ createdAt: -1 });
    expect(challenge.consumedAt).toBeInstanceOf(Date);
  });

  test('verify-otp replay after success is otp_invalid', async () => {
    await request(app).post('/api/auth/request-otp').send({ phone: PHONE });
    const first = await request(app).post('/api/auth/verify-otp').send({ phone: PHONE, code: FIXED_CODE });
    expect(first.status).toBe(200);

    const replay = await request(app).post('/api/auth/verify-otp').send({ phone: PHONE, code: FIXED_CODE });
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({ error: 'otp_invalid' });
  });

  test('GET /api/auth/me requires a bearer token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('GET /api/auth/me returns the current user for a valid bearer token', async () => {
    await request(app).post('/api/auth/request-otp').send({ phone: PHONE });
    const verify = await request(app).post('/api/auth/verify-otp').send({ phone: PHONE, code: FIXED_CODE });
    const token = verify.body.token;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe(CANON);
    expect(res.body.user.roles).toEqual(['cargo_owner']);
    expect(res.body.user.id).toMatch(/^[0-9a-f]{24}$/);
  });

  test('GET /api/auth/me rejects a garbage bearer token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('request-otp rejects a non-mobile phone with invalid_phone', async () => {
    const res = await request(app).post('/api/auth/request-otp').send({ phone: '02122001000' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_phone' });
  });

  test('blocked users cannot mint a token and cannot use /api/auth/me', async () => {
    await User.create({ phone: CANON_BLOCKED, status: 'blocked', roles: ['cargo_owner'] });

    await request(app).post('/api/auth/request-otp').send({ phone: '09121234568' });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone: '09121234568', code: FIXED_CODE });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'account_blocked' });
    expect(res.body.token).toBeUndefined();

    const token = jwt.sign(
      { sub: (await User.findOne({ phone: CANON_BLOCKED }))._id.toString(), phone: CANON_BLOCKED },
      'test-secret-do-not-use',
      { expiresIn: '7d' }
    );
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
    expect(me.body).toEqual({ error: 'unauthorized' });
  });

  test('five wrong codes lock the challenge; the correct code is then rejected too', async () => {
    await request(app).post('/api/auth/request-otp').send({ phone: '09121234569' });

    for (let i = 0; i < 4; i += 1) {
      const wrong = await request(app).post('/api/auth/verify-otp').send({ phone: '09121234569', code: '000000' });
      expect(wrong.status).toBe(401);
      expect(wrong.body).toEqual({ error: 'otp_invalid' });
    }

    const fifth = await request(app).post('/api/auth/verify-otp').send({ phone: '09121234569', code: '000000' });
    expect(fifth.status).toBe(429);
    expect(fifth.body).toEqual({ error: 'otp_locked' });

    const afterLock = await request(app).post('/api/auth/verify-otp').send({ phone: '09121234569', code: FIXED_CODE });
    expect(afterLock.status).toBe(401);
    expect(afterLock.body).toEqual({ error: 'otp_invalid' });
  });

  test('an expired challenge is rejected even with the correct code', async () => {
    await request(app).post('/api/auth/request-otp').send({ phone: PHONE });
    await OtpChallenge.updateOne(
      { phone: CANON, consumedAt: null },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await request(app).post('/api/auth/verify-otp').send({ phone: PHONE, code: FIXED_CODE });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'otp_invalid' });
  });

  test('unknown /api/auth routes still fall through to the not_found placeholder', async () => {
    const res = await request(app).get('/api/auth/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('GET /health stays available', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('baryar-api');
  });
});

describe('auth profile', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use';
    process.env.OTP_FIXED_CODE = FIXED_CODE;
    process.env.NODE_ENV = 'test';
  });

  async function register() {
    await request(app).post('/api/auth/request-otp').send({ phone: PHONE });
    const verify = await request(app).post('/api/auth/verify-otp').send({ phone: PHONE, code: FIXED_CODE });
    expect(verify.status).toBe(200);
    return verify.body.token;
  }

  test('PATCH /api/auth/me requires a bearer token', async () => {
    const res = await request(app).patch('/api/auth/me').send({ name: 'Ali' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('PATCH /api/auth/me rejects a garbage bearer token', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ name: 'Ali' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('PATCH /api/auth/me updates name, email, and nationalId and persists them', async () => {
    const token = await register();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ali Reza', email: 'Ali@Example.com', nationalId: '0071234567' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Ali Reza');
    expect(res.body.user.email).toBe('ali@example.com');
    expect(res.body.user.nationalId).toBe('0071234567');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Ali Reza');
    expect(me.body.user.email).toBe('ali@example.com');
    expect(me.body.user.nationalId).toBe('0071234567');
  });

  test('PATCH /api/auth/me cannot change roles, status, or phone', async () => {
    const token = await register();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ roles: ['admin'], status: 'blocked', phone: '09120000000' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error' });

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.roles).toEqual(['cargo_owner']);
    expect(me.body.user.status).toBe('active');
    expect(me.body.user.phone).toBe(CANON);
  });

  test('PATCH /api/auth/me applies allowlisted fields even when mixed with protected ones', async () => {
    const token = await register();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x', roles: ['admin'] });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('x');
    expect(res.body.user.roles).toEqual(['cargo_owner']);
  });

  test('PATCH /api/auth/me with an empty name clears it', async () => {
    const token = await register();
    const set = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ali Reza' });
    expect(set.status).toBe(200);
    expect(set.body.user.name).toBe('Ali Reza');

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('');
  });
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');

const FIXED_CODE = '123456';
const JWT_SECRET = 'test-secret-do-not-use';

function canon(phone) {
  return `+98${phone.slice(1)}`;
}

function applyTestEnv() {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.OTP_FIXED_CODE = FIXED_CODE;
  process.env.NODE_ENV = 'test';
}

function cargoBody(overrides) {
  return {
    title: 'Test cargo',
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

function makeHelpers(app) {
  async function register(phone) {
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone, code: FIXED_CODE });
    if (res.status !== 200) {
      throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { token: res.body.token, userId: res.body.user.id };
  }

  async function registerDriverViaProfile(phone) {
    const { token, userId } = await register(phone);
    const res = await request(app)
      .post('/api/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ licenseNumber: 'L-HELPER-001' });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`registerDriverViaProfile failed: ${res.status}`);
    }
    return { token, userId };
  }

  async function createVehicle(token, overrides = {}) {
    const plate = overrides.plate || `V${Date.now()}IR11`;
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
    if (res.status !== 201) {
      throw new Error(`createVehicle failed: ${res.status}`);
    }
    return res.body.vehicle.id;
  }

  async function publishCargo(ownerToken, overrides = {}) {
    const createRes = await request(app)
      .post('/api/cargo')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(cargoBody(overrides));
    if (createRes.status !== 201) {
      throw new Error(`publishCargo create failed: ${createRes.status}`);
    }
    const id = createRes.body.cargo.id;
    const pub = await request(app)
      .post(`/api/cargo/${id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`);
    if (pub.status !== 200) {
      throw new Error(`publishCargo publish failed: ${pub.status}`);
    }
    return id;
  }

  async function approveDriver(userId) {
    const DriverProfile = require('../src/models/DriverProfile');
    const profile = await DriverProfile.findOneAndUpdate(
      { userId },
      { verificationStatus: 'approved', verifiedAt: new Date(), rejectionReason: '' },
      { new: true }
    );
    if (!profile) {
      throw new Error(`approveDriver: no DriverProfile for ${userId}`);
    }
    return profile;
  }

  async function setupDriverWithVehicle(phone, plateOrOverrides) {
    const { token, userId } = await registerDriverViaProfile(phone);
    const overrides = typeof plateOrOverrides === 'string'
      ? { plate: plateOrOverrides }
      : (plateOrOverrides || {});
    const vehicleId = await createVehicle(token, overrides);
    await approveDriver(userId);
    return { token, vehicleId };
  }

  async function createAdmin(phone) {
    const user = await User.create({
      phone: canon(phone),
      roles: ['admin'],
      phoneVerifiedAt: new Date(),
      status: 'active',
    });
    const token = jwt.sign(
      { sub: user._id.toString(), phone: canon(phone) },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return { token, userId: user._id.toString() };
  }

  async function makeDriverOnlyToken(phone) {
    const user = await User.create({
      phone: canon(phone),
      roles: ['driver'],
      phoneVerifiedAt: new Date(),
    });
    const token = jwt.sign(
      { sub: user._id.toString(), phone: canon(phone) },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return { token, userId: user._id.toString() };
  }

  return {
    register,
    registerDriverViaProfile,
    createVehicle,
    approveDriver,
    publishCargo,
    setupDriverWithVehicle,
    createAdmin,
    makeDriverOnlyToken,
  };
}

module.exports = {
  FIXED_CODE,
  JWT_SECRET,
  canon,
  applyTestEnv,
  cargoBody,
  makeHelpers,
};

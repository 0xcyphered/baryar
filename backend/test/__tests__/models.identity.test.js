require('../setup');
const User = require('../../src/models/User');
const DriverProfile = require('../../src/models/DriverProfile');
const Vehicle = require('../../src/models/Vehicle');
const Document = require('../../src/models/Document');

async function makeUser(overrides = {}) {
  return User.create({
    phone: overrides.phone || '+989121111111',
    name: 'آزمون',
    ...overrides,
  });
}

describe('identity models', () => {
  it('creates a user with default cargo_owner role and unique phone', async () => {
    const user = await makeUser();
    expect(user.roles).toEqual(['cargo_owner']);
    expect(user.status).toBe('active');
    expect(user.phoneVerifiedAt).toBeNull();
    await expect(makeUser({ phone: user.phone })).rejects.toThrow();
  });

  it('rejects a user without phone', async () => {
    await expect(User.create({ name: 'x' })).rejects.toThrow();
  });

  it('rejects an unknown role', async () => {
    await expect(makeUser({ phone: '+989****2222', roles: ['company'] })).rejects.toThrow();
  });

  it('accepts transport_company role and pins the full ROLES enum', async () => {
    const user = await makeUser({ phone: '+989****5555', roles: ['transport_company'] });
    expect(user.roles).toEqual(['transport_company']);

    const persisted = await User.findById(user._id);
    expect(persisted.roles).toEqual(['transport_company']);

    // transport_company = شرکت حمل و نقل (operator model correction 2026-09-08)
    expect(User.ROLES).toEqual(['cargo_owner', 'driver', 'transport_company', 'admin']);
  });

  it('creates a driver profile 1-1 with user and a vehicle with unique plate', async () => {
    const user = await makeUser({
      phone: '+989123333333',
      roles: ['driver'],
    });
    const profile = await DriverProfile.create({ userId: user._id, licenseNumber: 'L-1' });
    expect(profile.verificationStatus).toBe('pending');
    await expect(DriverProfile.create({ userId: user._id })).rejects.toThrow();

    const vehicle = await Vehicle.create({
      driverProfileId: profile._id,
      ownerUserId: user._id,
      plate: '12ایران345',
      vehicleType: 'reefer',
      capacityWeightKg: 18000,
    });
    expect(vehicle.status).toBe('active');
    await expect(
      Vehicle.create({
        driverProfileId: profile._id,
        ownerUserId: user._id,
        plate: '12ایران345',
      })
    ).rejects.toThrow();
  });

  it('stores a document metadata stub without a file buffer', async () => {
    const user = await makeUser({ phone: '+989124444444', roles: ['driver'] });
    const doc = await Document.create({
      userId: user._id,
      kind: 'driving_license',
      storageKey: 'uploads/dev/license-1',
      originalName: 'license.jpg',
      mimeType: 'image/jpeg',
    });
    expect(doc.verificationStatus).toBe('pending');
    expect(doc.toObject().data).toBeUndefined();
  });

  it('User has no schema path named id', () => {
    expect(User.schema.path('id')).toBeUndefined();
    expect(User.schema.path('phone')).toBeDefined();
  });
});

require('../setup');
const User = require('../../src/models/User');
const { ensureAdminBootstrap } = require('../../src/services/adminService');

describe('ensureAdminBootstrap', () => {
  const prev = process.env.ADMIN_BOOTSTRAP_PHONES;

  afterEach(() => {
    process.env.ADMIN_BOOTSTRAP_PHONES = prev;
  });

  test('no-ops when env is empty', async () => {
    delete process.env.ADMIN_BOOTSTRAP_PHONES;
    await ensureAdminBootstrap();
    expect(await User.countDocuments()).toBe(0);
  });

  test('upserts listed phones with admin role', async () => {
    process.env.ADMIN_BOOTSTRAP_PHONES = '09121230901, 09121230902';
    await ensureAdminBootstrap();
    const users = await User.find({}).sort({ phone: 1 });
    expect(users).toHaveLength(2);
    expect(users[0].phone).toBe('+989121230901');
    expect(users[0].roles).toEqual(expect.arrayContaining(['admin']));
    expect(users[1].roles).toEqual(expect.arrayContaining(['admin']));
  });

  test('skips invalid phones', async () => {
    process.env.ADMIN_BOOTSTRAP_PHONES = '02122001000,09121230903';
    await ensureAdminBootstrap();
    expect(await User.countDocuments()).toBe(1);
    expect((await User.findOne()).phone).toBe('+989121230903');
  });

  test('is idempotent and keeps extra roles', async () => {
    process.env.ADMIN_BOOTSTRAP_PHONES = '09121230904';
    await User.create({
      phone: '+989121230904',
      roles: ['cargo_owner'],
      phoneVerifiedAt: new Date(),
    });
    await ensureAdminBootstrap();
    await ensureAdminBootstrap();
    const user = await User.findOne({ phone: '+989121230904' });
    expect(user.roles.sort()).toEqual(['admin', 'cargo_owner'].sort());
    expect(await User.countDocuments()).toBe(1);
  });
});

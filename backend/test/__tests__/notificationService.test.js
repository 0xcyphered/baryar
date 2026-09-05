require('../setup');
const notificationService = require('../../src/services/notificationService');
const User = require('../../src/models/User');

describe('notificationService.deliver', () => {
  test('does not throw when called with valid notification shape', async () => {
    const user = await User.create({
      phone: '+989121230901',
      roles: ['cargo_owner'],
      phoneVerifiedAt: new Date(),
    });
    expect(() => {
      notificationService.deliver({
        userId: user._id,
        type: 'shipment_assigned',
        cargoId: user._id, // arbitrary ObjectId-shaped value
        title: 'test',
        body: 'test body',
      });
    }).not.toThrow();
  });
});

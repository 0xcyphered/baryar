require('../setup');
const notificationService = require('../../src/services/notificationService');
const User = require('../../src/models/User');

describe('notificationService.deliver', () => {
  test('does not throw when called with valid notification shape', async () => {
    const user = await User.create({
      phone: '+989****0901',
      roles: ['cargo_owner'],
      phoneVerifiedAt: new Date(),
    });
    expect(() => {
      notificationService.deliver({
        userId: user._id,
        type: 'shipment_assigned',
        cargoId: user._id,
        title: 'test',
        body: 'test body',
      });
    }).not.toThrow();
  });

  test('production log omits the title', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      notificationService.deliver({
        userId: '507f1f77bcf86cd799439011',
        type: 'shipment_assigned',
        title: 'Shipment status',
        body: 'test body',
      });
      const line = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(line).toContain('507f1f77bcf86cd799439011');
      expect(line).toContain('shipment_assigned');
      expect(line).not.toContain('Shipment status');
    } finally {
      spy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });
});

require('../setup');
const otpService = require('../../src/services/otpService');

describe('otpService.sendOtp', () => {
  test('does not throw when called with a valid Iranian mobile phone', () => {
    expect(() => {
      otpService.sendOtp({ phone: '09121230901', code: '123456' });
    }).not.toThrow();
  });

  test('does not throw when called with an invalid phone format', () => {
    expect(() => {
      otpService.sendOtp({ phone: '000000000' });
    }).not.toThrow();
  });

  test('production log omits the code', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      otpService.sendOtp({ phone: '+989****0901', code: '123456' });
      const line = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(line).toContain('+989****0901');
      expect(line).not.toContain('123456');
    } finally {
      spy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });
});

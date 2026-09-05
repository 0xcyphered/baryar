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
});

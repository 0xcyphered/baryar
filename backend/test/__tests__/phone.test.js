require('../setup');
const { normalizeIranPhone } = require('../../src/utils/phone');

describe('normalizeIranPhone', () => {
  it('normalizes Iranian mobile formats to +98 + 10 digits', () => {
    expect(normalizeIranPhone('09121234567')).toBe('+989121234567');
    expect(normalizeIranPhone('9121234567')).toBe('+989121234567');
    expect(normalizeIranPhone('+98 912 123 4567')).toBe('+989121234567');
    expect(normalizeIranPhone('00989121234567')).toBe('+989121234567');
  });

  it('rejects landlines, foreign numbers, and junk input', () => {
    expect(normalizeIranPhone('02122001000')).toBeNull();
    expect(normalizeIranPhone('+12025550100')).toBeNull();
    expect(normalizeIranPhone('')).toBeNull();
    expect(normalizeIranPhone(null)).toBeNull();
    expect(normalizeIranPhone(undefined)).toBeNull();
    expect(normalizeIranPhone(9121234567)).toBeNull();
  });
});

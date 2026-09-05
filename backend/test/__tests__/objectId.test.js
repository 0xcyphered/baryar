require('../setup');
const { isObjectId, assertId } = require('../../src/utils/objectId');

describe('isObjectId', () => {
  it('accepts a 24-char hex string', () => {
    expect(isObjectId('0'.repeat(24))).toBe(true);
    expect(isObjectId('a'.repeat(24))).toBe(true);
    expect(isObjectId('507f1f77bcf86cd799439011')).toBe(true);
  });

  it('rejects non-hex or wrong-length strings', () => {
    expect(isObjectId('not-a-id')).toBe(false);
    expect(isObjectId('g'.repeat(24))).toBe(false);
    expect(isObjectId('a'.repeat(23))).toBe(false);
    expect(isObjectId('a'.repeat(25))).toBe(false);
  });

  it('rejects null and non-string input', () => {
    expect(isObjectId(null)).toBe(false);
    expect(isObjectId(undefined)).toBe(false);
    expect(isObjectId(123)).toBe(false);
  });
});

describe('assertId', () => {
  it('throws an error carrying the given code for invalid ids', () => {
    expect.assertions(2);
    try {
      assertId('not-a-id', 'invalid_cargo_id');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('invalid_cargo_id');
    }
  });

  it('does not throw for a valid 24-char hex id', () => {
    expect(() => assertId('a'.repeat(24), 'invalid_cargo_id')).not.toThrow();
  });
});

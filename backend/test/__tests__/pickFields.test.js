require('../setup');
const { pickFields } = require('../../src/utils/pickFields');

describe('pickFields', () => {
  it('picks only the listed keys', () => {
    const out = pickFields({ a: 1, b: 2, c: 3 }, ['a', 'c']);
    expect(out).toEqual({ a: 1, c: 3 });
  });

  it('ignores missing keys', () => {
    const out = pickFields({ a: 1 }, ['a', 'missing']);
    expect(out).toEqual({ a: 1 });
  });

  it('returns an empty object for null/non-object body', () => {
    expect(pickFields(null, ['a'])).toEqual({});
    expect(pickFields(undefined, ['a'])).toEqual({});
    expect(pickFields('nope', ['a'])).toEqual({});
  });

  it('does not copy undefined values (key absent in output)', () => {
    const out = pickFields({ a: undefined }, ['a']);
    expect(Object.prototype.hasOwnProperty.call(out, 'a')).toBe(false);
  });

  it('copies empty string, 0, and false', () => {
    const out = pickFields({ s: '', n: 0, b: false }, ['s', 'n', 'b']);
    expect(out).toEqual({ s: '', n: 0, b: false });
  });
});

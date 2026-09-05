require('../setup');
const { fail, sendError } = require('../../src/utils/httpError');

function mockRes() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('fail', () => {
  it('throws an Error whose .code and .message are the code', () => {
    expect.assertions(3);
    try {
      fail('not_found');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('not_found');
      expect(err.message).toBe('not_found');
    }
  });
});

describe('sendError', () => {
  it('maps mongoose ValidationError to 400 validation_error', () => {
    const res = mockRes();
    sendError(res, { name: 'ValidationError' }, {});
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: 'validation_error' });
  });

  it('maps a known code through the provided map', () => {
    const res = mockRes();
    sendError(res, { code: 'not_found' }, { not_found: 404 });
    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ error: 'not_found' });
  });

  it('maps an unknown code to 500 server_error with an empty map', () => {
    const res = mockRes();
    sendError(res, { code: 'mystery' }, {});
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'server_error' });
  });

  it('handles a null err as 500 server_error', () => {
    const res = mockRes();
    sendError(res, null, {});
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'server_error' });
  });

  it('maps LIMIT_FILE_SIZE to 413 for the driver upload route', () => {
    const res = mockRes();
    sendError(res, { code: 'LIMIT_FILE_SIZE' }, { LIMIT_FILE_SIZE: 413 });
    expect(res.statusCode).toBe(413);
    expect(res.payload).toEqual({ error: 'LIMIT_FILE_SIZE' });
  });
});

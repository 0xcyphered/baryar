function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function sendError(res, err, map) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error' });
  }
  const code = err && err.code;
  const table = map || {};
  const status = table[code] || 500;
  const error = table[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

module.exports = { fail, sendError };

function pickFields(body, keys) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

module.exports = { pickFields };

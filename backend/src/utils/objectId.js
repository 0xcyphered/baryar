const { fail } = require('./httpError');
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

function isObjectId(id) {
  return typeof id === 'string' && OBJECT_ID_RE.test(id);
}

function assertId(id, code) {
  if (!isObjectId(id)) fail(code);
}

module.exports = { isObjectId, assertId };

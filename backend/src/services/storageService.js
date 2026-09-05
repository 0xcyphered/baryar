const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { fail } = require('../utils/httpError');

const DEFAULT_DIR = path.join(__dirname, '../../uploads');
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const EXT_FOR_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB

function uploadRoot() {
  const raw = process.env.UPLOAD_DIR;
  if (raw && raw.trim()) return path.resolve(raw.trim());
  return DEFAULT_DIR;
}

function assertSafeKey(storageKey) {
  if (typeof storageKey !== 'string' || !storageKey) fail('not_found');
  if (storageKey.includes('..') || path.isAbsolute(storageKey)) fail('not_found');
  const root = uploadRoot();
  const abs = path.resolve(root, storageKey);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail('not_found');
  return abs;
}

async function ensureRoot() {
  await fsp.mkdir(uploadRoot(), { recursive: true });
}

function randomKey(userId, mimeType) {
  const ext = EXT_FOR_MIME[mimeType] || '';
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  return path.posix.join('documents', String(userId), `${id}${ext}`);
}

async function saveBuffer({ userId, mimeType, buffer, originalName }) {
  if (!ALLOWED_MIME.has(mimeType)) fail('invalid_file_type');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) fail('validation_error');
  if (buffer.length > MAX_BYTES) fail('file_too_large');
  await ensureRoot();
  const storageKey = randomKey(userId, mimeType);
  const abs = assertSafeKey(storageKey);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buffer);
  return {
    storageKey,
    originalName: typeof originalName === 'string' ? originalName : '',
    mimeType,
  };
}

async function unlinkKey(storageKey) {
  if (!storageKey) return;
  try {
    const abs = assertSafeKey(storageKey);
    await fsp.unlink(abs);
  } catch (err) {
    if (err && err.code === 'not_found') return;
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
}

function createReadStream(storageKey) {
  const abs = assertSafeKey(storageKey);
  return fs.createReadStream(abs);
}

module.exports = {
  ALLOWED_MIME,
  MAX_BYTES,
  uploadRoot,
  assertSafeKey,
  saveBuffer,
  unlinkKey,
  createReadStream,
};

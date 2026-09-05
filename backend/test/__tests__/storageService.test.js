require('../setup');
const path = require('path');
const storageService = require('../../src/services/storageService');

describe('storageService.saveBuffer limits', () => {
  beforeAll(() => {
    process.env.UPLOAD_DIR = path.join(__dirname, `../tmp-uploads-${process.pid}`);
  });

  afterAll(() => {
    // saveBuffer should throw before writing anything; clean the dir regardless.
    require('fs').rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  });

  test('rejects a buffer larger than MAX_BYTES with file_too_large', async () => {
    expect.assertions(1);
    try {
      await storageService.saveBuffer({
        userId: 'a'.repeat(24),
        mimeType: 'image/png',
        buffer: Buffer.alloc(storageService.MAX_BYTES + 1),
        originalName: 'big.png',
      });
    } catch (err) {
      expect(err.code).toBe('file_too_large');
    }
  });

  test('rejects a disallowed mime type with invalid_file_type', async () => {
    expect.assertions(1);
    try {
      await storageService.saveBuffer({
        userId: 'a'.repeat(24),
        mimeType: 'image/gif',
        buffer: Buffer.from('GIF89a'),
        originalName: 'x.gif',
      });
    } catch (err) {
      expect(err.code).toBe('invalid_file_type');
    }
  });

  test('rejects an empty buffer with validation_error', async () => {
    expect.assertions(1);
    try {
      await storageService.saveBuffer({
        userId: 'a'.repeat(24),
        mimeType: 'image/png',
        buffer: Buffer.alloc(0),
        originalName: 'empty.png',
      });
    } catch (err) {
      expect(err.code).toBe('validation_error');
    }
  });

  test('assertSafeKey refuses traversal and absolute keys', () => {
    expect.assertions(3);
    for (const bad of ['../etc/passwd', '/etc/passwd', 'documents/../../x.png']) {
      try {
        storageService.assertSafeKey(bad);
      } catch (err) {
        expect(err.code).toBe('not_found');
      }
    }
  });
});

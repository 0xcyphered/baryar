require('../setup');
const path = require('path');
const fs = require('fs');
const storageService = require('../../src/services/storageService');

describe('storageService happy path', () => {
  const uploadDir = path.join(__dirname, `../tmp-happy-path-${process.pid}`);

  beforeAll(() => {
    process.env.UPLOAD_DIR = uploadDir;
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  test('saveBuffer persists file to disk and returns storageKey', async () => {
    const userId = 'a'.repeat(24);
    const result = await storageService.saveBuffer({
      userId,
      mimeType: 'image/png',
      buffer: Buffer.from('PNG-content'),
      originalName: 'test.png',
    });
    expect(result.storageKey).toBeTruthy();
    expect(result.storageKey).toContain(userId);
    const filePath = path.join(uploadDir, result.storageKey);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath)).toEqual(Buffer.from('PNG-content'));
  });

  test('assertSafeKey passes for clean relative keys', () => {
    expect(() => storageService.assertSafeKey('documents/file123.png')).not.toThrow();
    expect(() => storageService.assertSafeKey('simple.txt')).not.toThrow();
  });

  test('createReadStream returns readable stream for a saved file', async () => {
    const userId = 'b'.repeat(24);
    const content = 'stream-test-data';
    const { storageKey } = await storageService.saveBuffer({
      userId,
      mimeType: 'image/jpeg',
      buffer: Buffer.from(content),
      originalName: 'photo.jpg',
    });
    const stream = storageService.createReadStream(storageKey);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe(content);
  });

  test('unlinkKey removes the file from disk', async () => {
    const userId = 'c'.repeat(24);
    const { storageKey } = await storageService.saveBuffer({
      userId,
      mimeType: 'image/png',
      buffer: Buffer.from('to-delete'),
      originalName: 'del.png',
    });
    const filePath = path.join(uploadDir, storageKey);
    expect(fs.existsSync(filePath)).toBe(true);
    await storageService.unlinkKey(storageKey);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

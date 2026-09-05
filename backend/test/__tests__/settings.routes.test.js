require('../setup');
const request = require('supertest');
const { createApp } = require('../../src/app');
const SystemSettings = require('../../src/models/SystemSettings');

describe('public settings', () => {
  const app = createApp();

  test('GET /api/settings returns platformName, supportPhone, defaultCurrency and nothing else', async () => {
    await SystemSettings.findOneAndUpdate(
      { key: 'global' },
      { platformName: 'Baryar', supportPhone: '02112345678', defaultCurrency: 'IRR', maintenanceMode: true, maxActiveCargoPerOwner: 3 },
      { upsert: true }
    );
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({
      platformName: 'Baryar',
      supportPhone: '02112345678',
      defaultCurrency: 'IRR',
    });
    expect(res.body.settings.maintenanceMode).toBeUndefined();
    expect(res.body.settings.maxActiveCargoPerOwner).toBeUndefined();
  });

  test('GET /api/settings works with no document yet (upserts defaults)', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({
      platformName: '',
      supportPhone: '',
      defaultCurrency: 'IRR',
    });
  });
});

const SystemSettings = require('../models/SystemSettings');
const { fail } = require('../utils/httpError');

function publicSettings(doc) {
  return {
    platformName: doc.platformName || '',
    supportPhone: doc.supportPhone || '',
    defaultCurrency: doc.defaultCurrency || 'IRR',
    maxActiveCargoPerOwner: doc.maxActiveCargoPerOwner || 20,
    maintenanceMode: doc.maintenanceMode || false,
    updatedAt: doc.updatedAt,
  };
}

// Public/user-facing subset: strips admin-only knobs
// (maxActiveCargoPerOwner, maintenanceMode) so they never leave the API on a
// public endpoint. Enforcement of those knobs is plan 029's job.
function publicPlatformSettings(doc) {
  return {
    platformName: doc.platformName || '',
    supportPhone: doc.supportPhone || '',
    defaultCurrency: doc.defaultCurrency || 'IRR',
  };
}

async function getSettings() {
  const doc = await SystemSettings.findOneAndUpdate(
    { key: 'global' },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

async function putSettings(body) {
  if (!body || typeof body !== 'object') fail('validation_error');
  const fields = {};
  const SETTINGS_FIELDS = SystemSettings.SETTINGS_FIELDS;

  for (const key of SETTINGS_FIELDS) {
    if (body[key] === undefined) continue;
    const val = body[key];
    if (key === 'platformName' || key === 'supportPhone' || key === 'defaultCurrency') {
      if (typeof val !== 'string') fail('validation_error');
      fields[key] = val;
    } else if (key === 'maxActiveCargoPerOwner') {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) fail('validation_error');
      fields[key] = val;
    } else if (key === 'maintenanceMode') {
      if (typeof val !== 'boolean') fail('validation_error');
      fields[key] = val;
    }
  }

  if (Object.keys(fields).length === 0) fail('validation_error');

  const doc = await SystemSettings.findOneAndUpdate(
    { key: 'global' },
    { $set: fields },
    { upsert: true, new: true, runValidators: true }
  );
  return doc;
}

module.exports = { getSettings, putSettings, publicSettings, publicPlatformSettings };

const mongoose = require('mongoose');

const SETTINGS_FIELDS = [
  'platformName',
  'supportPhone',
  'defaultCurrency',
  'maxActiveCargoPerOwner',
  'maintenanceMode',
];

const systemSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    platformName: { type: String, default: '' },
    supportPhone: { type: String, default: '' },
    defaultCurrency: { type: String, default: 'IRR' },
    maxActiveCargoPerOwner: { type: Number, default: 20, min: 0 },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

systemSettingsSchema.statics.SETTINGS_FIELDS = SETTINGS_FIELDS;

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);

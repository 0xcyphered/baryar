const express = require('express');
const settingsService = require('../services/settingsService');
const { sendError } = require('../utils/httpError');

const router = express.Router();

// Public read: platform name, support phone, default currency. No auth —
// the support phone is the help-desk number, not a secret. Admin-only knobs
// are stripped by the serializer and never appear on this endpoint.
router.get('/', async (req, res) => {
  try {
    const settings = await settingsService.getSettings();
    return res.status(200).json({
      settings: settingsService.publicPlatformSettings(settings),
    });
  } catch (err) {
    // Empty map: unexpected codes still map to 500 server_error (plan 038).
    return sendError(res, err, {});
  }
});

module.exports = router;

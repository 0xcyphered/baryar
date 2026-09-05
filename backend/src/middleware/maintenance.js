const settingsService = require('../services/settingsService');

// Plan 029: when SystemSettings.maintenanceMode is true, non-admin writes on
// the business routers return 503. Reads (GET/HEAD/OPTIONS) stay up, and
// admins bypass the gate so they can still operate. Mounted per router AFTER
// `auth` in app.js/route files so req.user exists for the admin bypass.
// Never mounted on /api/auth, /api/admin, or /api/settings — OTP login and
// admin mutation must keep working during maintenance.
async function requireNotMaintenance(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (req.user && Array.isArray(req.user.roles) && req.user.roles.includes('admin')) {
    return next();
  }
  try {
    const settings = await settingsService.getSettings();
    if (settings.maintenanceMode) {
      return res.status(503).json({ error: 'maintenance' });
    }
  } catch (err) {
    return next(err);
  }
  return next();
}

module.exports = { requireNotMaintenance };

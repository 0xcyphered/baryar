const express = require('express');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminGuard');
const adminService = require('../services/adminService');
const settingsService = require('../services/settingsService');

const router = express.Router();

function sendAdminError(res, err) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error' });
  }
  const code = err && err.code;
  const map = {
    invalid_user_id: 400,
    invalid_cargo_id: 400,
    invalid_document_id: 400,
    validation_error: 400,
    admin_self_action: 403,
    forbidden: 403,
    not_found: 404,
    invalid_status: 409,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

router.use(auth, requireAdmin);

// --- Users ---

router.get('/users', async (req, res) => {
  try {
    const result = await adminService.listUsers({
      status: req.query.status,
      role: req.query.role,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await adminService.getUser({ id: req.params.id });
    return res.status(200).json({ user: adminService.publicAdminUser(user) });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const user = await adminService.updateUser({ id: req.params.id, body: req.body });
    return res.status(200).json({ user: adminService.publicAdminUser(user) });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.post('/users/:id/block', async (req, res) => {
  try {
    const user = await adminService.setUserStatus({
      id: req.params.id,
      action: 'block',
      adminUserId: req.user._id,
    });
    return res.status(200).json({ user: adminService.publicAdminUser(user) });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.post('/users/:id/unblock', async (req, res) => {
  try {
    const user = await adminService.setUserStatus({
      id: req.params.id,
      action: 'unblock',
      adminUserId: req.user._id,
    });
    return res.status(200).json({ user: adminService.publicAdminUser(user) });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

// --- Drivers ---

router.get('/drivers', async (req, res) => {
  try {
    const result = await adminService.listDrivers();
    return res.status(200).json(result);
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.get('/drivers/:userId', async (req, res) => {
  try {
    const result = await adminService.getDriverDetail({ userId: req.params.userId });
    return res.status(200).json(result);
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.post('/drivers/:userId/verify', async (req, res) => {
  try {
    const profile = await adminService.verifyDriverProfile({
      userId: req.params.userId,
      decision: req.body.decision,
      reason: req.body.reason,
    });
    return res.status(200).json({ profile });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

// --- Cargo ---

router.get('/cargo', async (req, res) => {
  try {
    const result = await adminService.listCargoAdmin({
      status: req.query.status,
      ownerUserId: req.query.ownerUserId,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.get('/cargo/:id', async (req, res) => {
  try {
    const cargo = await adminService.getCargoAdmin({ id: req.params.id });
    return res.status(200).json({ cargo });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.patch('/cargo/:id', async (req, res) => {
  try {
    const cargo = await adminService.updateCargoAdmin({ id: req.params.id, body: req.body });
    return res.status(200).json({ cargo });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.post('/cargo/:id/cancel', async (req, res) => {
  try {
    const cargo = await adminService.cancelCargoAdmin({ id: req.params.id });
    return res.status(200).json({ cargo });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

// --- Overview ---

router.get('/overview', async (req, res) => {
  try {
    const overview = await adminService.overview();
    return res.status(200).json({ overview });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

// --- Documents ---

router.get('/documents', async (req, res) => {
  try {
    const result = await adminService.listDocuments({
      status: req.query.status,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.get('/documents/:id/file', async (req, res) => {
  try {
    const { document, stream } = await adminService.openDocumentFileAdmin({ id: req.params.id });
    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'not_found' });
      else res.end();
    });
    stream.pipe(res);
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.post('/documents/:id/verify', async (req, res) => {
  try {
    const document = await adminService.verifyDocument({
      id: req.params.id,
      decision: req.body.decision,
      reason: req.body.reason,
      reviewerUserId: req.user._id,
    });
    return res.status(200).json({ document });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

// --- Shipments ---

router.get('/shipments', async (req, res) => {
  try {
    const result = await adminService.listShipmentsAdmin({
      status: req.query.status,
    });
    return res.status(200).json(result);
  } catch (err) {
    return sendAdminError(res, err);
  }
});

// --- Settings ---

router.get('/settings', async (req, res) => {
  try {
    const settings = await settingsService.getSettings();
    return res.status(200).json({ settings: settingsService.publicSettings(settings) });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await settingsService.putSettings(req.body);
    return res.status(200).json({ settings: settingsService.publicSettings(settings) });
  } catch (err) {
    return sendAdminError(res, err);
  }
});

module.exports = router;

const express = require('express');
const { auth } = require('../middleware/auth');
const driverService = require('../services/driverService');

const router = express.Router();

function requireDriver(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('driver')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

function sendDriverError(res, err) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error' });
  }
  const code = err && err.code;
  const map = {
    invalid_vehicle_id: 400,
    invalid_document_id: 400,
    validation_error: 400,
    profile_required: 400,
    forbidden: 403,
    not_found: 404,
    plate_in_use: 409,
    document_locked: 409,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

router.use(auth);

// Decision 2: driver registration is self-service — any active authenticated
// user may call this; it grants the `driver` role (idempotent) and upserts the
// profile. It MUST stay above the requireDriver gate below.
router.post('/profile', async (req, res) => {
  try {
    const { profile, created } = await driverService.upsertProfile({
      userId: req.user._id,
      body: req.body,
    });
    return res.status(created ? 201 : 200).json({ profile: driverService.publicProfile(profile) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

// Everything defined below this line requires the driver role.
router.use(requireDriver);

router.get('/profile', async (req, res) => {
  try {
    const profile = await driverService.getProfile({ userId: req.user._id });
    return res.status(200).json({ profile: driverService.publicProfile(profile) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.post('/vehicles', async (req, res) => {
  try {
    const vehicle = await driverService.createVehicle({ userId: req.user._id, body: req.body });
    return res.status(201).json({ vehicle: driverService.publicVehicle(vehicle) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await driverService.listVehicles({ userId: req.user._id });
    return res.status(200).json({
      vehicles: vehicles.map(driverService.publicVehicle),
      count: vehicles.length,
    });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.patch('/vehicles/:id', async (req, res) => {
  try {
    const vehicle = await driverService.updateVehicle({
      userId: req.user._id,
      id: req.params.id,
      body: req.body,
    });
    return res.status(200).json({ vehicle: driverService.publicVehicle(vehicle) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.delete('/vehicles/:id', async (req, res) => {
  try {
    await driverService.deleteVehicle({ userId: req.user._id, id: req.params.id });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.post('/documents', async (req, res) => {
  try {
    const document = await driverService.createDocument({ userId: req.user._id, body: req.body });
    return res.status(201).json({ document: driverService.publicDocument(document) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.get('/documents', async (req, res) => {
  try {
    const documents = await driverService.listDocuments({
      userId: req.user._id,
      kind: req.query.kind,
    });
    return res.status(200).json({
      documents: documents.map(driverService.publicDocument),
      count: documents.length,
    });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    await driverService.deleteDocument({ userId: req.user._id, id: req.params.id });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

module.exports = router;

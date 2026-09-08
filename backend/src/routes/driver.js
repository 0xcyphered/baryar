const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { requireNotMaintenance } = require('../middleware/maintenance');
const driverService = require('../services/driverService');
const storageService = require('../services/storageService');
const { requireDriver } = require('../middleware/requireRole');
const { sendError } = require('../utils/httpError');

const router = express.Router();

// Plan 030: the ONE place memoryStorage is allowed (max 5MB per file);
// storageService.saveBuffer moves the bytes to local disk afterwards.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storageService.MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (storageService.ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    const err = new Error('invalid_file_type');
    err.code = 'invalid_file_type';
    return cb(err);
  },
});

const DRIVER_ERRORS = {
  invalid_vehicle_id: 400,
  invalid_document_id: 400,
  validation_error: 400,
  profile_required: 400,
  forbidden: 403,
  not_found: 404,
  plate_in_use: 409,
  document_locked: 409,
  invalid_file_type: 400,
  file_too_large: 413,
  LIMIT_FILE_SIZE: 413,
};

function sendDriverError(res, err) {
  return sendError(res, err, DRIVER_ERRORS);
}

router.use(auth, requireNotMaintenance);

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

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return sendDriverError(res, err);
    return next();
  });
}

router.post('/documents/upload', handleUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'validation_error' });
    const document = await driverService.createDocumentFromUpload({
      userId: req.user._id,
      body: req.body,
      file: req.file,
    });
    return res.status(201).json({ document: driverService.publicDocument(document) });
  } catch (err) {
    return sendDriverError(res, err);
  }
});

router.get('/documents/:id/file', async (req, res) => {
  try {
    const { document, stream } = await driverService.openDocumentFile({
      userId: req.user._id,
      id: req.params.id,
    });
    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    if (document.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${document.originalName.replace(/"/g, '')}"`);
    }
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'not_found' });
      else res.end();
    });
    stream.pipe(res);
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

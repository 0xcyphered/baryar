const express = require('express');
const { auth } = require('../middleware/auth');
const { requireNotMaintenance } = require('../middleware/maintenance');
const cargoService = require('../services/cargoService');
const { requireCargoOwner } = require('../middleware/requireRole');
const { sendError } = require('../utils/httpError');

const router = express.Router();

const CARGO_ERRORS = {
  invalid_cargo_id: 400,
  validation_error: 400,
  forbidden: 403,
  not_found: 404,
  invalid_status: 409,
  cargo_limit: 409,
};

function sendCargoError(res, err) {
  return sendError(res, err, CARGO_ERRORS);
}

// Plan 029: maintenance 503 sits between auth and the role gate. In
// maintenance a non-owner 503s first (they cannot write anyway); otherwise
// they still 403 as before.
router.use(auth, requireNotMaintenance, requireCargoOwner);

router.post('/', async (req, res) => {
  try {
    const cargo = await cargoService.createCargo({
      ownerUserId: req.user._id,
      body: req.body,
    });
    return res.status(201).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const cargoes = await cargoService.listCargo({
      ownerUserId: req.user._id,
      status: req.query.status,
    });
    return res.status(200).json({
      cargo: cargoes.map(cargoService.publicCargo),
      count: cargoes.length,
    });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const cargo = await cargoService.findOwned({ ownerUserId: req.user._id, id: req.params.id });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const cargo = await cargoService.updateCargo({
      ownerUserId: req.user._id,
      id: req.params.id,
      body: req.body,
    });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await cargoService.deleteCargo({ ownerUserId: req.user._id, id: req.params.id });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.post('/:id/publish', async (req, res) => {
  try {
    const cargo = await cargoService.publishCargo({ ownerUserId: req.user._id, id: req.params.id });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const cargo = await cargoService.cancelCargo({ ownerUserId: req.user._id, id: req.params.id });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendCargoError(res, err);
  }
});

module.exports = router;

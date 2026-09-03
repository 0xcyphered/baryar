const express = require('express');
const { auth } = require('../middleware/auth');
const cargoService = require('../services/cargoService');

const router = express.Router();

function requireCargoOwner(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('cargo_owner')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

function sendCargoError(res, err) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error' });
  }
  const code = err && err.code;
  const map = {
    invalid_cargo_id: 400,
    validation_error: 400,
    forbidden: 403,
    not_found: 404,
    invalid_status: 409,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

router.use(auth, requireCargoOwner);

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

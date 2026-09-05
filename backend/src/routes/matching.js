const express = require("express");
const { auth } = require("../middleware/auth");
const { requireNotMaintenance } = require("../middleware/maintenance");
const matchingService = require("../services/matchingService");
const cargoService = require("../services/cargoService");
const { requireDriver } = require("../middleware/requireRole");
const { sendError } = require("../utils/httpError");

const router = express.Router();

const MATCHING_ERRORS = {
  invalid_cargo_id: 400,
  invalid_vehicle_id: 400,
  invalid_offer_id: 400,
  validation_error: 400,
  offer_exists: 409,
  forbidden: 403,
  not_found: 404,
  invalid_status: 409,
};

function sendMatchingError(res, err) {
  return sendError(res, err, MATCHING_ERRORS);
}

router.use(auth, requireNotMaintenance, requireDriver);

router.get("/cargo", async (req, res) => {
  try {
    const cargoes = await matchingService.listMatchingCargo({
      userId: req.user._id,
      vehicleId: req.query.vehicleId,
      lat: req.query.lat,
      lng: req.query.lng,
      radiusKm: req.query.radiusKm,
    });
    return res.status(200).json({
      cargo: cargoes.map(cargoService.publicCargo),
      count: cargoes.length,
    });
  } catch (err) {
    return sendMatchingError(res, err);
  }
});

module.exports = router;

const express = require("express");
const { auth } = require("../middleware/auth");
const { requireNotMaintenance } = require("../middleware/maintenance");
const matchingService = require("../services/matchingService");
const cargoService = require("../services/cargoService");

const router = express.Router();

function requireDriver(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes("driver")) {
    return res.status(403).json({ error: "forbidden" });
  }
  return next();
}

function sendMatchingError(res, err) {
  if (err && err.name === "ValidationError") {
    return res.status(400).json({ error: "validation_error" });
  }
  const code = err && err.code;
  const map = {
    invalid_cargo_id: 400,
    invalid_vehicle_id: 400,
    invalid_offer_id: 400,
    validation_error: 400,
    offer_exists: 409,
    forbidden: 403,
    not_found: 404,
    invalid_status: 409,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : "server_error";
  return res.status(status).json({ error });
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

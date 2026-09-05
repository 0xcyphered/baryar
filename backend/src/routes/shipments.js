const express = require("express");
const { auth } = require("../middleware/auth");
const { requireNotMaintenance } = require("../middleware/maintenance");
const shipmentService = require("../services/shipmentService");
// One-way require: cargoService does not require shipmentService, so this
// cannot cycle (plan 037). Serializes the participant cargo read with the
// same publicCargo used by owner CRUD and the matching list.
const cargoService = require("../services/cargoService");

const router = express.Router();

function requireDriver(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes("driver")) {
    return res.status(403).json({ error: "forbidden" });
  }
  return next();
}

function sendShipmentError(res, err) {
  if (err && err.name === "ValidationError") {
    return res.status(400).json({ error: "validation_error" });
  }
  const code = err && err.code;
  const map = {
    invalid_shipment_id: 400,
    invalid_cargo_id: 400,
    validation_error: 400,
    forbidden: 403,
    not_found: 404,
    invalid_status: 409,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : "server_error";
  return res.status(status).json({ error });
}

// Both owner and driver read shipments; transitions and event logging are
// driver-only, so gating is per-route rather than router-wide.
router.use(auth, requireNotMaintenance);

router.get("/", async (req, res) => {
  try {
    const shipments = await shipmentService.listShipments({
      userId: req.user._id,
      status: req.query.status,
      cargoId: req.query.cargoId,
    });
    return res.status(200).json({
      shipments: shipments.map(shipmentService.publicShipment),
      count: shipments.length,
    });
  } catch (err) {
    return sendShipmentError(res, err);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const shipment = await shipmentService.getForUser({
      userId: req.user._id,
      id: req.params.id,
    });
    return res.status(200).json({ shipment: shipmentService.publicShipment(shipment) });
  } catch (err) {
    return sendShipmentError(res, err);
  }
});

router.get("/:id/events", async (req, res) => {
  try {
    const events = await shipmentService.listEvents({
      userId: req.user._id,
      id: req.params.id,
    });
    return res.status(200).json({
      events: events.map(shipmentService.publicEvent),
      count: events.length,
    });
  } catch (err) {
    return sendShipmentError(res, err);
  }
});

// Plan 037: awarded driver / owner reads the cargo parameters and
// destinations of their shipment. Participant gate lives in
// getCargoForUser (strangers get 404, never 403).
router.get("/:id/cargo", async (req, res) => {
  try {
    const cargo = await shipmentService.getCargoForUser({
      userId: req.user._id,
      id: req.params.id,
    });
    return res.status(200).json({ cargo: cargoService.publicCargo(cargo) });
  } catch (err) {
    return sendShipmentError(res, err);
  }
});

router.post("/:id/status", requireDriver, async (req, res) => {
  try {
    const shipment = await shipmentService.transition({
      userId: req.user._id,
      id: req.params.id,
      toStatus: req.body.status,
    });
    return res.status(200).json({ shipment: shipmentService.publicShipment(shipment) });
  } catch (err) {
    return sendShipmentError(res, err);
  }
});

router.post("/:id/events", requireDriver, async (req, res) => {
  try {
    const event = await shipmentService.addEvent({
      userId: req.user._id,
      id: req.params.id,
      body: req.body,
    });
    return res.status(201).json({ event: shipmentService.publicEvent(event) });
  } catch (err) {
    return sendShipmentError(res, err);
  }
});

module.exports = router;

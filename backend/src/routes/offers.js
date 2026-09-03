const express = require("express");
const { auth } = require("../middleware/auth");
const matchingService = require("../services/matchingService");
const cargoService = require("../services/cargoService");

const router = express.Router();

function requireDriver(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes("driver")) {
    return res.status(403).json({ error: "forbidden" });
  }
  return next();
}

function requireCargoOwner(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes("cargo_owner")) {
    return res.status(403).json({ error: "forbidden" });
  }
  return next();
}

function sendOfferError(res, err) {
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

// Both roles appear in this router (drivers bid, owners award), so gating is
// per-route rather than router-wide.
router.use(auth);

router.post("/", requireDriver, async (req, res) => {
  try {
    const offer = await matchingService.createOffer({
      userId: req.user._id,
      cargoId: req.body.cargoId,
      vehicleId: req.body.vehicleId,
      body: req.body,
    });
    return res.status(201).json({ offer: matchingService.publicOffer(offer) });
  } catch (err) {
    return sendOfferError(res, err);
  }
});

router.get("/", requireDriver, async (req, res) => {
  try {
    const offers = await matchingService.listMyOffers({ userId: req.user._id });
    return res.status(200).json({
      offers: offers.map(matchingService.publicOffer),
      count: offers.length,
    });
  } catch (err) {
    return sendOfferError(res, err);
  }
});

router.get("/cargo/:cargoId/offers", requireCargoOwner, async (req, res) => {
  try {
    const offers = await matchingService.listCargoOffers({
      userId: req.user._id,
      cargoId: req.params.cargoId,
    });
    return res.status(200).json({
      offers: offers.map(matchingService.publicOffer),
      count: offers.length,
    });
  } catch (err) {
    return sendOfferError(res, err);
  }
});

router.patch("/:id", requireDriver, async (req, res) => {
  try {
    const offer = await matchingService.updateOffer({
      userId: req.user._id,
      id: req.params.id,
      body: req.body,
    });
    return res.status(200).json({ offer: matchingService.publicOffer(offer) });
  } catch (err) {
    return sendOfferError(res, err);
  }
});

router.delete("/:id", requireDriver, async (req, res) => {
  try {
    await matchingService.withdrawOffer({ userId: req.user._id, id: req.params.id });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendOfferError(res, err);
  }
});

router.post("/:id/accept", requireCargoOwner, async (req, res) => {
  try {
    const { offer, cargo } = await matchingService.acceptOffer({
      userId: req.user._id,
      offerId: req.params.id,
    });
    return res.status(200).json({
      offer: matchingService.publicOffer(offer),
      cargo: cargoService.publicCargo(cargo),
    });
  } catch (err) {
    return sendOfferError(res, err);
  }
});

module.exports = router;

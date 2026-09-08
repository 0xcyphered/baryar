const express = require("express");
const { auth } = require("../middleware/auth");
const { requireNotMaintenance } = require("../middleware/maintenance");
const matchingService = require("../services/matchingService");
const cargoService = require("../services/cargoService");
const { requireDriver, requireCargoOwner } = require("../middleware/requireRole");
const { sendError } = require("../utils/httpError");

const router = express.Router();

const OFFER_ERRORS = {
  invalid_cargo_id: 400,
  invalid_vehicle_id: 400,
  invalid_offer_id: 400,
  validation_error: 400,
  offer_exists: 409,
  forbidden: 403,
  driver_unverified: 403,
  not_found: 404,
  invalid_status: 409,
};

function sendOfferError(res, err) {
  return sendError(res, err, OFFER_ERRORS);
}

// Both roles appear in this router (drivers bid, owners award), so gating is
// per-route rather than router-wide.
router.use(auth, requireNotMaintenance);

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

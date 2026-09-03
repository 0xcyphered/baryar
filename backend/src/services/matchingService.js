const Cargo = require("../models/Cargo");
const Offer = require("../models/Offer");
const Vehicle = require("../models/Vehicle");
const shipmentService = require("./shipmentService");

const MAX_LIST = 100;
// vehicleId/cargoId come from the route/params, never the body.
const OFFER_FIELDS = ["priceRial", "note"];

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertId(id, code) {
  if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) fail(code);
}

function pickOfferFields(body) {
  const out = {};
  if (!body || typeof body !== "object") return out;
  for (const key of OFFER_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function parseRadius(radiusKm) {
  if (radiusKm === undefined || radiusKm === null || radiusKm === "") return 50;
  const n = Number(radiusKm);
  if (!Number.isFinite(n)) fail("validation_error");
  return Math.min(500, Math.max(1, n));
}

function parseCoordinate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail("validation_error");
  return n;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

// Vehicles must be owned by the requesting driver and active to be usable
// for matching or bidding. Not owned -> not_found (do not leak other
// drivers' vehicles); owned but inactive -> validation_error.
async function findOwnedActiveVehicle({ userId, vehicleId }) {
  assertId(vehicleId, "invalid_vehicle_id");
  const vehicle = await Vehicle.findOne({ _id: vehicleId, ownerUserId: userId });
  if (!vehicle) fail("not_found");
  if (vehicle.status !== "active") fail("validation_error");
  return vehicle;
}

// --- Driver side ---

// List open cargo matching the driver's vehicle capacity + origin location.
// capacityWeightKg is >= 0 by schema (min: 0), so "weight is 0 (unspecified)
// OR weight <= capacity" is exactly "weight <= capacity".
async function listMatchingCargo({ userId, vehicleId, lat, lng, radiusKm }) {
  const hasLat = hasValue(lat);
  const hasLng = hasValue(lng);
  if (hasLat !== hasLng) fail("validation_error");

  const query = { status: "open" };
  let sortByDistance = false;

  if (hasLat) {
    const latNum = parseCoordinate(lat);
    const lngNum = parseCoordinate(lng);
    const radius = parseRadius(radiusKm);
    // $near returns results sorted by distance already.
    query["origin.location"] = {
      $near: {
        $geometry: { type: "Point", coordinates: [lngNum, latNum] },
        $maxDistance: radius * 1000,
      },
    };
    sortByDistance = true;
  }

  if (hasValue(vehicleId)) {
    const vehicle = await findOwnedActiveVehicle({ userId, vehicleId });
    query["dimensions.weightKg"] = { $lte: vehicle.capacityWeightKg };
  }

  if (sortByDistance) {
    return Cargo.find(query).limit(MAX_LIST);
  }
  return Cargo.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
}

async function createOffer({ userId, cargoId, vehicleId, body }) {
  assertId(cargoId, "invalid_cargo_id");
  assertId(vehicleId, "invalid_vehicle_id");

  const cargo = await Cargo.findOne({ _id: cargoId, status: "open" });
  if (!cargo) fail("invalid_status");

  await findOwnedActiveVehicle({ userId, vehicleId });

  const fields = pickOfferFields(body);
  if (
    fields.priceRial === undefined ||
    fields.priceRial === null ||
    !Number.isFinite(Number(fields.priceRial))
  ) {
    fail("validation_error");
  }

  const existing = await Offer.findOne({
    cargoId,
    driverUserId: userId,
    status: "pending",
  });
  if (existing) fail("offer_exists");

  const offer = await Offer.create({
    cargoId,
    driverUserId: userId,
    vehicleId,
    priceRial: Number(fields.priceRial),
    note: fields.note !== undefined ? fields.note : "",
  });
  return offer;
}

async function listMyOffers({ userId }) {
  return Offer.find({ driverUserId: userId })
    .sort({ createdAt: -1 })
    .limit(MAX_LIST);
}

async function updateOffer({ userId, id, body }) {
  assertId(id, "invalid_offer_id");
  const offer = await Offer.findOne({ _id: id, driverUserId: userId });
  if (!offer) fail("not_found");
  if (offer.status !== "pending") fail("invalid_status");

  const fields = pickOfferFields(body);
  if (
    fields.priceRial !== undefined &&
    !Number.isFinite(Number(fields.priceRial))
  ) {
    fail("validation_error");
  }
  if (fields.priceRial !== undefined) offer.priceRial = Number(fields.priceRial);
  if (fields.note !== undefined) offer.note = fields.note;
  await offer.save();
  return offer;
}

async function withdrawOffer({ userId, id }) {
  assertId(id, "invalid_offer_id");
  const offer = await Offer.findOne({ _id: id, driverUserId: userId });
  if (!offer) fail("not_found");
  if (offer.status !== "pending") fail("invalid_status");
  offer.status = "withdrawn";
  await offer.save();
  return offer;
}

// --- Owner side ---

async function listCargoOffers({ userId, cargoId }) {
  assertId(cargoId, "invalid_cargo_id");
  const cargo = await Cargo.findOne({ _id: cargoId, ownerUserId: userId });
  if (!cargo) fail("not_found");
  return Offer.find({ cargoId }).sort({ createdAt: -1 }).limit(MAX_LIST);
}

// Award = accept one pending offer on an open cargo the requester owns.
// Both status flips are conditional updates so concurrent accepts/withdraws
// cannot double-award: the cargo can only leave 'open' once, and the offer
// can only leave 'pending' once (with a best-effort cargo revert if the
// offer flip loses the race).
// Plan 018 adds the Shipment creation + notifications tail via
// shipmentService.createForAward.
async function acceptOffer({ userId, offerId }) {
  assertId(offerId, "invalid_offer_id");
  const offer = await Offer.findById(offerId);
  if (!offer) fail("not_found");

  const cargo = await Cargo.findOne({ _id: offer.cargoId, ownerUserId: userId });
  if (!cargo) fail("not_found");

  const cargoUpdate = await Cargo.updateOne(
    { _id: cargo._id, status: "open" },
    { status: "matched" }
  );
  if (cargoUpdate.matchedCount === 0) fail("invalid_status");

  const offerUpdate = await Offer.updateOne(
    { _id: offer._id, status: "pending" },
    { status: "accepted" }
  );
  if (offerUpdate.matchedCount === 0) {
    await Cargo.updateOne(
      { _id: cargo._id, status: "matched" },
      { status: "open" }
    );
    fail("invalid_status");
  }

  await Offer.updateMany(
    { cargoId: offer.cargoId, _id: { $ne: offer._id }, status: "pending" },
    { status: "rejected" }
  );

  // Plan 018: awarding a cargo creates the Shipment. Shipment has a unique
  // index on cargoId, so a partially-completed award retry lands in the
  // idempotency catch inside createForAward instead of double-notifying.
  // createForAward never throws for notification problems (they are
  // swallowed inside notificationService), but it CAN throw for real
  // Shipment-validation problems. Validation here is guaranteed by
  // construction (accepted offer + matched cargo from this transaction), so
  // any throw is a server bug — surface it as 500 like any other failure.
  await shipmentService.createForAward({ cargo, offer });

  const freshOffer = await Offer.findById(offer._id);
  const freshCargo = await Cargo.findById(cargo._id);
  return { offer: freshOffer, cargo: freshCargo };
}

function publicOffer(offer) {
  return {
    id: offer._id.toString(),
    cargoId: offer.cargoId.toString(),
    driverUserId: offer.driverUserId.toString(),
    vehicleId: offer.vehicleId.toString(),
    priceRial: offer.priceRial,
    note: offer.note,
    status: offer.status,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

module.exports = {
  listMatchingCargo,
  createOffer,
  listMyOffers,
  updateOffer,
  withdrawOffer,
  listCargoOffers,
  acceptOffer,
  publicOffer,
};

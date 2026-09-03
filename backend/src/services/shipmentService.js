const Cargo = require("../models/Cargo");
const Shipment = require("../models/Shipment");
const ShipmentEvent = require("../models/ShipmentEvent");
const notificationService = require("./notificationService");

const MAX_LIST = 100;
// eventType on custom events is driver-chosen; 'status_change' events are
// service-managed and can never be created through addEvent.
const DRIVER_EVENT_TYPES = [
  "cargo_loaded",
  "driver_departed",
  "checkpoint",
  "customs_stop",
  "note",
];
const EVENT_FIELDS = ["eventType", "note", "location"];

// Fixed forward path. 'cancelled' has no inbound edge: cancellation is an
// admin surface (plan 019), not a driver/owner action.
const TRANSITIONS = {
  assigned: ["loading"],
  loading: ["in_transit"],
  in_transit: ["at_customs", "delivered"],
  at_customs: ["in_transit"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertId(id, code) {
  if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) fail(code);
}

function pickEventFields(body) {
  const out = {};
  for (const key of EVENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
      out[key] = body[key];
    }
  }
  return out;
}

// Award hook (plan 018): called from matchingService.acceptOffer after the
// offer/cargo flips succeed. Shipment has a unique index on cargoId, so a
// partially-completed award retry lands in the idempotency catch instead of
// double-notifying.
async function createForAward({ cargo, offer }) {
  let shipment;
  try {
    shipment = await Shipment.create({
      cargoId: cargo._id,
      offerId: offer._id,
      ownerUserId: cargo.ownerUserId,
      driverUserId: offer.driverUserId,
      vehicleId: offer.vehicleId,
      status: "assigned",
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await Shipment.findOne({ cargoId: cargo._id });
      return { shipment: existing, created: false };
    }
    throw err;
  }
  await ShipmentEvent.create({
    shipmentId: shipment._id,
    eventType: "status_change",
    fromStatus: null,
    toStatus: "assigned",
    note: "",
  });
  await notifyParticipants({ shipment, cargo, type: "shipment_assigned" });
  return { shipment, created: true };
}

// Participant based, not role based: a user may hold both roles and be the
// owner of one shipment and the driver of another.
async function listShipments({ userId, status, cargoId }) {
  const query = { $or: [{ ownerUserId: userId }, { driverUserId: userId }] };
  if (status !== undefined && status !== null && status !== "") {
    if (!Shipment.STATUSES.includes(status)) fail("validation_error");
    query.status = status;
  }
  if (cargoId !== undefined && cargoId !== null && cargoId !== "") {
    if (typeof cargoId !== "string" || !/^[0-9a-fA-F]{24}$/.test(cargoId)) {
      fail("invalid_cargo_id");
    }
    query.cargoId = cargoId;
  }
  return Shipment.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
}

// Both the participant check and the existence check: a user must never
// learn that another user's shipment exists.
async function getForUser({ userId, id }) {
  assertId(id, "invalid_shipment_id");
  const shipment = await Shipment.findOne({
    _id: id,
    $or: [{ ownerUserId: userId }, { driverUserId: userId }],
  });
  if (!shipment) fail("not_found");
  return shipment;
}

async function listEvents({ userId, id }) {
  const shipment = await getForUser({ userId, id });
  return ShipmentEvent.find({ shipmentId: shipment._id })
    .sort({ occurredAt: 1 })
    .limit(MAX_LIST);
}

// Driver-only status transition along the fixed forward path.
async function transition({ userId, id, toStatus }) {
  const shipment = await getForUser({ userId, id });
  if (String(shipment.driverUserId) !== String(userId)) fail("forbidden");
  if (!Shipment.STATUSES.includes(toStatus)) fail("validation_error");
  const fromStatus = shipment.status;
  if (!(TRANSITIONS[fromStatus] || []).includes(toStatus)) fail("invalid_status");
  shipment.status = toStatus;
  if (toStatus === "loading" && !shipment.pickupAt) {
    shipment.pickupAt = new Date();
  }
  if (toStatus === "delivered") {
    shipment.deliveredAt = new Date();
  }
  await shipment.save();
  await ShipmentEvent.create({
    shipmentId: shipment._id,
    eventType: "status_change",
    fromStatus,
    toStatus,
    note: "",
  });
  if (toStatus === "completed") {
    // Conditional update: only a matched cargo completes; a cargo already
    // completed by a prior retry is a no-op.
    await Cargo.updateOne(
      { _id: shipment.cargoId, status: "matched" },
      { status: "completed" }
    );
  }
  const cargo = await Cargo.findById(shipment.cargoId);
  await notifyParticipants({
    shipment,
    cargo,
    type: "shipment_status",
    excludeUserId: userId,
  });
  return shipment;
}

// Driver-only custom events. occurredAt is server time only (roadmap:
// "Stores exact time and date of major events") — never taken from the body.
async function addEvent({ userId, id, body }) {
  const shipment = await getForUser({ userId, id });
  if (String(shipment.driverUserId) !== String(userId)) fail("forbidden");
  const fields = pickEventFields(body);
  if (!DRIVER_EVENT_TYPES.includes(fields.eventType)) fail("validation_error");
  const event = await ShipmentEvent.create({
    shipmentId: shipment._id,
    eventType: fields.eventType,
    note: fields.note === undefined ? "" : fields.note,
    location: fields.location === undefined ? null : fields.location,
  });
  return event;
}

async function notifyParticipants({ shipment, cargo, type, excludeUserId }) {
  const recipients = [shipment.ownerUserId, shipment.driverUserId].filter(
    (recipientId) => {
      if (!excludeUserId) return true;
      return String(recipientId) !== String(excludeUserId);
    }
  );
  for (const userId of recipients) {
    await notificationService.notifyShipment({ userId, type, shipment, cargo });
  }
}

function publicShipment(shipment) {
  return {
    id: shipment._id.toString(),
    cargoId: shipment.cargoId.toString(),
    offerId: shipment.offerId.toString(),
    ownerUserId: shipment.ownerUserId.toString(),
    driverUserId: shipment.driverUserId.toString(),
    vehicleId: shipment.vehicleId.toString(),
    status: shipment.status,
    pickupAt: shipment.pickupAt,
    deliveredAt: shipment.deliveredAt,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

function publicEvent(event) {
  return {
    id: event._id.toString(),
    shipmentId: event.shipmentId.toString(),
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    note: event.note,
    location: event.location,
    occurredAt: event.occurredAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

module.exports = {
  TRANSITIONS,
  createForAward,
  listShipments,
  getForUser,
  listEvents,
  transition,
  addEvent,
  publicShipment,
  publicEvent,
};

const Notification = require("../models/Notification");
const { fail } = require("../utils/httpError");
const { assertId } = require("../utils/objectId");

const MAX_LIST = 100;

// Pluggable in-app channel. Phase 2 (push provider / SMS gateway, V6 §6/§9)
// replaces this function body only — the Notification store and the HTTP
// contract stay as they are.
function deliver(notification) {
  if (process.env.NODE_ENV === "production") {
    console.log(
      `notification sent ${JSON.stringify({
        userId: notification.userId.toString(),
        type: notification.type,
      })}`
    );
    return;
  }
  console.log(
    `notification sent ${JSON.stringify({
      userId: notification.userId.toString(),
      type: notification.type,
      title: notification.title,
    })}`
  );
}

// Never throws: a notification failure must never fail the shipment
// lifecycle transition that triggered it. Generalized in plan 029 so offer
// notifications (which have no Shipment yet) go through the same swallow.
async function notifyEvent({ userId, type, cargo, shipment, title, body }) {
  try {
    const notification = await Notification.create({
      userId,
      type,
      shipmentId: shipment ? shipment._id : null,
      cargoId: cargo._id,
      title,
      body,
    });
    deliver(notification);
    return notification;
  } catch (err) {
    console.log(`notification create failed: ${err.message}`);
    return null;
  }
}

async function notifyShipment({ userId, type, shipment, cargo }) {
  const cargoTitle = (cargo && cargo.title) || "cargo";
  const body =
    type === "shipment_assigned"
      ? `Cargo "${cargoTitle}" was matched and a shipment was created.`
      : `Cargo "${cargoTitle}" status is now ${shipment.status}.`;
  return notifyEvent({
    userId,
    type,
    cargo,
    shipment,
    title: `Shipment ${shipment.status}`,
    body,
  });
}

function notifyOfferReceived({ ownerUserId, cargo, offer }) {
  const cargoTitle = (cargo && cargo.title) || "cargo";
  return notifyEvent({
    userId: ownerUserId,
    type: "offer_received",
    cargo,
    shipment: null,
    title: "New offer",
    body: `A driver offered ${offer.priceRial} rial on "${cargoTitle}".`,
  });
}

function notifyOfferRejected({ driverUserId, cargo, offer }) {
  const cargoTitle = (cargo && cargo.title) || "cargo";
  return notifyEvent({
    userId: driverUserId,
    type: "offer_rejected",
    cargo,
    shipment: null,
    title: "Offer rejected",
    body: `Your offer on "${cargoTitle}" was rejected.`,
  });
}

async function listForUser({ userId, unread }) {
  const query = { userId };
  if (unread === true) query.readAt = null;
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).limit(MAX_LIST),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  return { notifications, unreadCount };
}

async function markRead({ userId, id }) {
  assertId(id, "invalid_notification_id");
  const notification = await Notification.findOne({ _id: id, userId });
  if (!notification) fail("not_found");
  if (notification.readAt === null) {
    notification.readAt = new Date();
    await notification.save();
  }
  return notification;
}

function publicNotification(notification) {
  return {
    id: notification._id.toString(),
    type: notification.type,
    shipmentId: notification.shipmentId ? notification.shipmentId.toString() : null,
    cargoId: notification.cargoId.toString(),
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

module.exports = {
  notifyEvent,
  notifyShipment,
  notifyOfferReceived,
  notifyOfferRejected,
  listForUser,
  markRead,
  publicNotification,
};

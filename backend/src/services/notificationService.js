const Notification = require("../models/Notification");

const MAX_LIST = 100;

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertId(id, code) {
  if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) fail(code);
}

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
// lifecycle transition that triggered it.
async function notifyShipment({ userId, type, shipment, cargo }) {
  try {
    const cargoTitle = (cargo && cargo.title) || "cargo";
    const body =
      type === "shipment_assigned"
        ? `Cargo "${cargoTitle}" was matched and a shipment was created.`
        : `Cargo "${cargoTitle}" status is now ${shipment.status}.`;
    const notification = await Notification.create({
      userId,
      type,
      shipmentId: shipment._id,
      cargoId: shipment.cargoId,
      title: `Shipment ${shipment.status}`,
      body,
    });
    deliver(notification);
    return notification;
  } catch (err) {
    console.log(`notification create failed: ${err.message}`);
    return null;
  }
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
    shipmentId: notification.shipmentId.toString(),
    cargoId: notification.cargoId.toString(),
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

module.exports = { notifyShipment, listForUser, markRead, publicNotification };

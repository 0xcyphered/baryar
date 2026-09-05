const express = require("express");
const { auth } = require("../middleware/auth");
const { requireNotMaintenance } = require("../middleware/maintenance");
const notificationService = require("../services/notificationService");
const { sendError } = require("../utils/httpError");

const router = express.Router();

const NOTIFICATION_ERRORS = {
  invalid_notification_id: 400,
  validation_error: 400,
  forbidden: 403,
  not_found: 404,
};

function sendNotificationError(res, err) {
  return sendError(res, err, NOTIFICATION_ERRORS);
}

// Every notification is the requester's own; no role gates needed.
router.use(auth, requireNotMaintenance);

router.get("/", async (req, res) => {
  try {
    const { notifications, unreadCount } = await notificationService.listForUser({
      userId: req.user._id,
      unread: req.query.unread === "true",
    });
    return res.status(200).json({
      notifications: notifications.map(notificationService.publicNotification),
      count: notifications.length,
      unreadCount,
    });
  } catch (err) {
    return sendNotificationError(res, err);
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    await notificationService.markRead({
      userId: req.user._id,
      id: req.params.id,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendNotificationError(res, err);
  }
});

module.exports = router;

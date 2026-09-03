const express = require("express");
const { auth } = require("../middleware/auth");
const notificationService = require("../services/notificationService");

const router = express.Router();

function sendNotificationError(res, err) {
  if (err && err.name === "ValidationError") {
    return res.status(400).json({ error: "validation_error" });
  }
  const code = err && err.code;
  const map = {
    invalid_notification_id: 400,
    validation_error: 400,
    forbidden: 403,
    not_found: 404,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : "server_error";
  return res.status(status).json({ error });
}

// Every notification is the requester's own; no role gates needed.
router.use(auth);

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

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requestOtp, verifyOtp } = require('../services/otpService');
const { publicUser, updateMe } = require('../services/userService');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 10 requests / 15 min / IP on the OTP endpoints. Skipped when NODE_ENV=test
// (checked at request time — the Jest globalSetup sets it) so tests stay
// deterministic. Library default keyGenerator: a raw req.ip custom generator
// would throw ERR_ERL_KEY_GEN_IPV6 at construction time.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});

function sendAuthError(res, err) {
  const code = err && err.code;
  const map = {
    invalid_phone: 400,
    otp_cooldown: 429,
    otp_invalid: 401,
    otp_locked: 429,
    account_blocked: 403,
    server_misconfigured: 500,
    unauthorized: 401,
    validation_error: 400,
  };
  const status = map[code] || 500;
  const error = map[code] ? code : 'server_error';
  return res.status(status).json({ error });
}

router.post('/request-otp', authLimiter, async (req, res) => {
  try {
    await requestOtp({ phone: req.body && req.body.phone });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendAuthError(res, err);
  }
});

router.post('/verify-otp', authLimiter, async (req, res) => {
  try {
    const { user, token } = await verifyOtp({
      phone: req.body && req.body.phone,
      code: req.body && req.body.code,
    });
    return res.status(200).json({ token, user: publicUser(user) });
  } catch (err) {
    return sendAuthError(res, err);
  }
});

router.get('/me', auth, async (req, res) => {
  return res.status(200).json({ user: publicUser(req.user) });
});

router.patch('/me', auth, async (req, res) => {
  try {
    const user = await updateMe({ user: req.user, body: req.body });
    return res.status(200).json({ user: publicUser(user) });
  } catch (err) {
    return sendAuthError(res, err);
  }
});

module.exports = router;

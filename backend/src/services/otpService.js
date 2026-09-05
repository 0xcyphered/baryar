const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OtpChallenge = require('../models/OtpChallenge');
const { normalizeIranPhone } = require('../utils/phone');
const { fail } = require('../utils/httpError');

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const BCRYPT_COST = 8;

// Pluggable OTP channel. Phase 2 (SMS gateway, V6 §9) replaces this function
// body only — the OtpChallenge store and HTTP contract stay as they are.
// Never log the code in production; never return the code over HTTP.
function sendOtp({ phone, code }) {
  if (process.env.NODE_ENV === 'production') {
    console.log(`otp sent ${JSON.stringify({ phone })}`);
    return;
  }
  console.log(`otp sent ${JSON.stringify({ phone, code })}`);
}

function pickPlaintextCode() {
  const fixed = process.env.OTP_FIXED_CODE;
  if (process.env.NODE_ENV !== 'production' && /^\d{6}$/.test(fixed || '')) {
    return fixed;
  }
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function requestOtp({ phone: rawPhone }) {
  const phone = normalizeIranPhone(rawPhone);
  if (!phone) fail('invalid_phone');

  const now = new Date();
  const live = await OtpChallenge.findOne({
    phone,
    consumedAt: null,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 });

  if (live) {
    if (now.getTime() - live.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      fail('otp_cooldown');
    }
    // Invalidate previous unused challenges for this phone, then issue a new one.
    await OtpChallenge.updateMany(
      { phone, consumedAt: null, expiresAt: { $gt: now } },
      { $set: { consumedAt: now } }
    );
  }

  const code = pickPlaintextCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  await OtpChallenge.create({
    phone,
    codeHash,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });

  sendOtp({ phone, code });
  return { ok: true };
}

async function verifyOtp({ phone: rawPhone, code }) {
  const phone = normalizeIranPhone(rawPhone);
  if (!phone) fail('invalid_phone');
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) fail('otp_invalid');

  const now = new Date();
  const challenge = await OtpChallenge.findOne({ phone, consumedAt: null }).sort({ createdAt: -1 });
  if (!challenge) fail('otp_invalid');

  if (challenge.expiresAt.getTime() <= now.getTime()) {
    challenge.consumedAt = now;
    await challenge.save();
    fail('otp_invalid');
  }
  if (challenge.attemptCount >= MAX_ATTEMPTS) {
    challenge.consumedAt = now;
    await challenge.save();
    fail('otp_locked');
  }

  const matches = await bcrypt.compare(code, challenge.codeHash);
  if (!matches) {
    challenge.attemptCount += 1;
    if (challenge.attemptCount >= MAX_ATTEMPTS) {
      challenge.consumedAt = now;
      await challenge.save();
      fail('otp_locked');
    }
    await challenge.save();
    fail('otp_invalid');
  }

  challenge.consumedAt = now;
  await challenge.save();

  let user = await User.findOne({ phone });
  if (user && (user.status === 'blocked' || user.status === 'deleted')) {
    fail('account_blocked');
  }

  if (!user) {
    user = await User.create({ phone, phoneVerifiedAt: now, roles: ['cargo_owner'] });
  } else if (!user.phoneVerifiedAt) {
    user.phoneVerifiedAt = now;
    await user.save();
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) fail('server_misconfigured');

  const token = jwt.sign({ sub: user._id.toString(), phone: user.phone }, secret, { expiresIn: '7d' });
  return { user, token };
}

module.exports = { sendOtp, requestOtp, verifyOtp };

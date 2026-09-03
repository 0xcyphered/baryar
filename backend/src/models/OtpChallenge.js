const mongoose = require('mongoose');

const otpChallengeSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true, minlength: 10, maxlength: 16 },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

otpChallengeSchema.index({ phone: 1, createdAt: -1 });
otpChallengeSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('OtpChallenge', otpChallengeSchema);

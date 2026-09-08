const mongoose = require('mongoose');

// transport_company = شرکت حمل و نقل
const ROLES = ['cargo_owner', 'driver', 'transport_company', 'admin'];
const STATUSES = ['active', 'blocked', 'deleted'];

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true, minlength: 10, maxlength: 16 },
    name: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    nationalId: { type: String, default: '', trim: true },
    roles: {
      type: [String],
      enum: ROLES,
      default: () => ['cargo_owner'],
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'roles must contain at least one role',
      },
    },
    status: { type: String, enum: STATUSES, default: 'active' },
    phoneVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ roles: 1, status: 1 });

userSchema.statics.ROLES = ROLES;
userSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('User', userSchema);

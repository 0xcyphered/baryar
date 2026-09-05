const mongoose = require('mongoose');

// offer_* rows exist before a Shipment is created, so shipmentId is optional.
const TYPES = [
  'shipment_assigned',
  'shipment_status',
  'offer_received',
  'offer_rejected',
];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TYPES, required: true },
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      default: null,
    },
    cargoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cargo', required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.statics.TYPES = TYPES;

module.exports = mongoose.model('Notification', notificationSchema);

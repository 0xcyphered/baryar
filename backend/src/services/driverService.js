const mongoose = require('mongoose');
const DriverProfile = require('../models/DriverProfile');
const Vehicle = require('../models/Vehicle');
const Document = require('../models/Document');
const User = require('../models/User');
const storageService = require('./storageService');
const { fail } = require('../utils/httpError');
const { assertId } = require('../utils/objectId');
const { pickFields } = require('../utils/pickFields');

const MAX_LIST = 100;

const PROFILE_FIELDS = ['licenseNumber', 'professionalCardNumber'];
const VEHICLE_FIELDS = ['vehicleType', 'plate', 'capacityWeightKg', 'capacityVolumeM3', 'year'];
const VEHICLE_UPDATE_FIELDS = ['vehicleType', 'capacityWeightKg', 'capacityVolumeM3', 'year', 'status'];
const DOCUMENT_FIELDS = ['kind', 'vehicleId', 'originalName', 'mimeType'];

function publicProfile(profile) {
  return {
    id: profile._id.toString(),
    userId: profile.userId.toString(),
    licenseNumber: profile.licenseNumber || '',
    professionalCardNumber: profile.professionalCardNumber || '',
    verificationStatus: profile.verificationStatus,
    verifiedAt: profile.verifiedAt,
    rejectionReason: profile.rejectionReason || '',
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function publicVehicle(vehicle) {
  return {
    id: vehicle._id.toString(),
    driverProfileId: vehicle.driverProfileId.toString(),
    ownerUserId: vehicle.ownerUserId.toString(),
    vehicleType: vehicle.vehicleType,
    plate: vehicle.plate,
    capacityWeightKg: vehicle.capacityWeightKg,
    capacityVolumeM3: vehicle.capacityVolumeM3,
    year: vehicle.year,
    status: vehicle.status,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

function publicDocument(document) {
  return {
    id: document._id.toString(),
    userId: document.userId.toString(),
    vehicleId: document.vehicleId ? document.vehicleId.toString() : null,
    kind: document.kind,
    storageKey: document.storageKey || '',
    originalName: document.originalName || '',
    mimeType: document.mimeType || '',
    verificationStatus: document.verificationStatus,
    reviewedAt: document.reviewedAt,
    reviewerUserId: document.reviewerUserId ? document.reviewerUserId.toString() : null,
    rejectionReason: document.rejectionReason || '',
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function upsertProfile({ userId, body }) {
  const fields = pickFields(body, PROFILE_FIELDS);
  // Decision 2: the only path to the `driver` role. Idempotent.
  await User.updateOne({ _id: userId }, { $addToSet: { roles: 'driver' } });

  const existing = await DriverProfile.findOne({ userId });
  if (existing) {
    Object.assign(existing, fields);
    await existing.save(); // runs Mongoose validators
    return { profile: existing, created: false };
  }
  try {
    const profile = await DriverProfile.create({ userId, ...fields });
    return { profile, created: true };
  } catch (err) {
    // Unique-index race on userId: another request created it first.
    if (err && err.code === 11000) {
      const profile = await DriverProfile.findOne({ userId });
      if (profile) {
        Object.assign(profile, fields);
        await profile.save();
        return { profile, created: false };
      }
    }
    throw err;
  }
}

async function getProfile({ userId }) {
  const profile = await DriverProfile.findOne({ userId });
  if (!profile) fail('not_found');
  return profile;
}

async function requireOwnProfile({ userId }) {
  const profile = await DriverProfile.findOne({ userId });
  if (!profile) fail('profile_required');
  return profile;
}

async function createVehicle({ userId, body }) {
  const profile = await requireOwnProfile({ userId });
  const fields = pickFields(body, VEHICLE_FIELDS); // decision 9: `status` never copied on create
  try {
    return await Vehicle.create({ ...fields, driverProfileId: profile._id, ownerUserId: userId });
  } catch (err) {
    // `plate` is the only unique field on Vehicle → E11000 here means duplicate plate.
    if (err && err.code === 11000) fail('plate_in_use');
    throw err;
  }
}

async function listVehicles({ userId }) {
  return Vehicle.find({ ownerUserId: userId }).sort({ createdAt: -1 }).limit(MAX_LIST);
}

async function updateVehicle({ userId, id, body }) {
  assertId(id, 'invalid_vehicle_id');
  const vehicle = await Vehicle.findOne({ _id: id, ownerUserId: userId });
  if (!vehicle) fail('not_found');
  const fields = pickFields(body, VEHICLE_UPDATE_FIELDS); // decision 8: plate NOT editable
  Object.assign(vehicle, fields);
  await vehicle.save(); // Mongoose enum/min validation
  return vehicle;
}

async function deleteVehicle({ userId, id }) {
  assertId(id, 'invalid_vehicle_id');
  const vehicle = await Vehicle.findOne({ _id: id, ownerUserId: userId });
  if (!vehicle) fail('not_found');
  await vehicle.deleteOne();
  return vehicle;
}

async function assertDocumentVehicle({ userId, vehicleId }) {
  if (vehicleId !== undefined && vehicleId !== null) {
    assertId(vehicleId, 'invalid_vehicle_id');
    const vehicle = await Vehicle.findOne({ _id: vehicleId, ownerUserId: userId });
    if (!vehicle) fail('not_found'); // decision 10: do not leak other drivers' vehicles
  }
}

async function createDocument({ userId, body }) {
  const fields = pickFields(body, DOCUMENT_FIELDS);
  await assertDocumentVehicle({ userId, vehicleId: fields.vehicleId });
  return Document.create({
    ...fields,
    userId,
    storageKey: '', // server-generated only; JSON stubs have no bytes (plan 030)
    verificationStatus: 'pending', // decision 10: body can never set verification fields
    reviewerUserId: null,
    reviewedAt: null,
    rejectionReason: '',
  });
}

// Plan 030: multipart upload — multer (memory, max 5MB) hands us the bytes and
// storageService owns the server-generated key on local disk.
async function createDocumentFromUpload({ userId, body, file }) {
  if (!file) fail('validation_error');
  const fields = pickFields(body, DOCUMENT_FIELDS);
  if (!fields.kind) fail('validation_error');
  await assertDocumentVehicle({ userId, vehicleId: fields.vehicleId });
  const stored = await storageService.saveBuffer({
    userId,
    mimeType: file.mimetype,
    buffer: file.buffer,
    originalName: file.originalname,
  });
  try {
    return await Document.create({
      ...fields,
      userId,
      storageKey: stored.storageKey,
      originalName: stored.originalName,
      mimeType: stored.mimeType,
      verificationStatus: 'pending',
      reviewerUserId: null,
      reviewedAt: null,
      rejectionReason: '',
    });
  } catch (err) {
    // Do not orphan the file if the DB write fails.
    await storageService.unlinkKey(stored.storageKey);
    throw err;
  }
}

async function listDocuments({ userId, kind }) {
  const query = { userId };
  if (kind !== undefined) {
    if (!Document.KINDS.includes(kind)) fail('validation_error');
    query.kind = kind;
  }
  return Document.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
}

async function deleteDocument({ userId, id }) {
  assertId(id, 'invalid_document_id');
  const document = await Document.findOne({ _id: id, userId });
  if (!document) fail('not_found');
  if (document.verificationStatus !== 'pending') fail('document_locked');
  await storageService.unlinkKey(document.storageKey); // missing file is not an error
  await document.deleteOne();
  return document;
}

// Plan 030: owner-only file download. 404 (not 403) for other users' docs.
async function openDocumentFile({ userId, id }) {
  assertId(id, 'invalid_document_id');
  const document = await Document.findOne({ _id: id, userId });
  if (!document) fail('not_found');
  if (!document.storageKey) fail('not_found');
  let stream;
  try {
    stream = storageService.createReadStream(document.storageKey);
  } catch (err) {
    if (err && err.code === 'not_found') fail('not_found');
    throw err;
  }
  return { document, stream };
}

module.exports = {
  publicProfile,
  publicVehicle,
  publicDocument,
  upsertProfile,
  getProfile,
  createVehicle,
  listVehicles,
  updateVehicle,
  deleteVehicle,
  createDocument,
  createDocumentFromUpload,
  openDocumentFile,
  listDocuments,
  deleteDocument,
};

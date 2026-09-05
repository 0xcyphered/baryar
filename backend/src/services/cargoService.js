const mongoose = require('mongoose');
const Cargo = require('../models/Cargo');
// matchingService does not require cargoService (it uses shipmentService), so
// this is not a circular require (checked in plan 028).
const matchingService = require('./matchingService');
const settingsService = require('./settingsService');
const { fail } = require('../utils/httpError');
const { assertId } = require('../utils/objectId');
const { pickFields } = require('../utils/pickFields');

const MAX_LIST = 100;
const EDITABLE_FIELDS = [
  'title', 'description', 'transportMode', 'origin', 'destination',
  'dimensions', 'specialCharacteristics', 'pickupAt', 'deliverBy',
];

function publicCargo(cargo) {
  return {
    id: cargo._id.toString(),
    ownerUserId: cargo.ownerUserId.toString(),
    title: cargo.title || '',
    description: cargo.description || '',
    transportMode: cargo.transportMode,
    origin: cargo.origin,
    destination: cargo.destination,
    dimensions: cargo.dimensions,
    specialCharacteristics: cargo.specialCharacteristics,
    pickupAt: cargo.pickupAt,
    deliverBy: cargo.deliverBy,
    status: cargo.status,
    createdAt: cargo.createdAt,
    updatedAt: cargo.updatedAt,
  };
}

function pickEditableFields(body) {
  return pickFields(body, EDITABLE_FIELDS);
}

function assertTiming(pickupAt, deliverBy) {
  if (pickupAt && deliverBy && new Date(deliverBy).getTime() < new Date(pickupAt).getTime()) {
    fail('validation_error');
  }
}

async function createCargo({ ownerUserId, body }) {
  const fields = pickEditableFields(body);
  if (!fields.origin || !fields.destination) fail('validation_error');
  assertTiming(fields.pickupAt, fields.deliverBy);
  // Plan 029: enforce the admin cap on active cargo per owner. Applies to
  // create only — publish/update/admin edits never increment the count
  // (a draft already counted). Cap 0 is strict: no new cargo.
  const settings = await settingsService.getSettings();
  const cap = settings.maxActiveCargoPerOwner;
  const activeCount = await Cargo.countDocuments({
    ownerUserId,
    status: { $in: ['draft', 'open', 'matched'] },
  });
  if (activeCount >= cap) fail('cargo_limit');
  const cargo = await Cargo.create({ ...fields, ownerUserId, status: 'draft' });
  return cargo;
}

async function listCargo({ ownerUserId, status }) {
  const query = { ownerUserId };
  if (status !== undefined) {
    if (!Cargo.STATUSES.includes(status)) fail('validation_error');
    query.status = status;
  }
  return Cargo.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
}

async function findOwned({ ownerUserId, id }) {
  assertId(id, 'invalid_cargo_id');
  const cargo = await Cargo.findOne({ _id: id, ownerUserId });
  if (!cargo) fail('not_found');
  return cargo;
}

async function updateCargo({ ownerUserId, id, body }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft') fail('invalid_status');
  const fields = pickEditableFields(body);
  assertTiming(
    fields.pickupAt !== undefined ? fields.pickupAt : cargo.pickupAt,
    fields.deliverBy !== undefined ? fields.deliverBy : cargo.deliverBy
  );
  Object.assign(cargo, fields);
  await cargo.save(); // runs Mongoose validators → ValidationError on bad enums
  return cargo;
}

async function deleteCargo({ ownerUserId, id }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft') fail('invalid_status');
  await cargo.deleteOne();
  return cargo;
}

async function publishCargo({ ownerUserId, id }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft') fail('invalid_status');
  cargo.status = 'open';
  await cargo.save();
  return cargo;
}

async function cancelCargo({ ownerUserId, id }) {
  const cargo = await findOwned({ ownerUserId, id });
  if (cargo.status !== 'draft' && cargo.status !== 'open') fail('invalid_status');
  const wasOpen = cargo.status === 'open';
  cargo.status = 'cancelled';
  await cargo.save();
  if (wasOpen) {
    // Draft cancel has no offers (publish is what makes cargo biddable);
    // open cancel must not leave driver bids pending forever (plan 028).
    await matchingService.rejectPendingOffersForCargo(cargo._id);
  }
  return cargo;
}

module.exports = {
  EDITABLE_FIELDS,
  publicCargo,
  createCargo,
  listCargo,
  findOwned,
  updateCargo,
  deleteCargo,
  publishCargo,
  cancelCargo,
};

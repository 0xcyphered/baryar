const mongoose = require('mongoose');
const Cargo = require('../models/Cargo');
// matchingService does not require cargoService (it uses shipmentService), so
// this is not a circular require (checked in plan 028).
const matchingService = require('./matchingService');

const MAX_LIST = 100;
const EDITABLE_FIELDS = [
  'title', 'description', 'transportMode', 'origin', 'destination',
  'dimensions', 'specialCharacteristics', 'pickupAt', 'deliverBy',
];

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertObjectId(id) {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) fail('invalid_cargo_id');
}

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
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
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
  assertObjectId(id);
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

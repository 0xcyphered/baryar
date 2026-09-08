const User = require('../models/User');
const Cargo = require('../models/Cargo');
const DriverProfile = require('../models/DriverProfile');
const Vehicle = require('../models/Vehicle');
const Document = require('../models/Document');
const Offer = require('../models/Offer');
const Shipment = require('../models/Shipment');
const notificationService = require('./notificationService');
const cargoService = require('./cargoService');
const driverService = require('./driverService');
const matchingService = require('./matchingService');
const { EDITABLE_FIELDS } = require('./cargoService');
const { normalizeIranPhone } = require('../utils/phone');
const storageService = require('./storageService');
const { fail } = require('../utils/httpError');
const { assertId } = require('../utils/objectId');
const { pickFields } = require('../utils/pickFields');

const MAX_LIST = 100;

function publicAdminUser(user) {
  return {
    id: user._id.toString(),
    phone: user.phone,
    name: user.name || '',
    email: user.email || '',
    nationalId: user.nationalId || '',
    roles: user.roles,
    status: user.status,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// --- Users ---

async function listUsers({ status, role } = {}) {
  const query = {};
  if (status !== undefined) {
    if (!User.STATUSES.includes(status)) fail('validation_error');
    query.status = status;
  }
  if (role !== undefined) {
    if (!User.ROLES.includes(role)) fail('validation_error');
    query.roles = role;
  }
  const users = await User.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
  return { users: users.map(publicAdminUser), count: users.length };
}

async function getUser({ id }) {
  assertId(id, 'invalid_user_id');
  const user = await User.findById(id);
  if (!user) fail('not_found');
  return user;
}

async function updateUser({ id, body }) {
  const user = await getUser({ id });
  const USER_EDIT_FIELDS = ['name', 'email', 'nationalId'];
  const fields = pickFields(body, USER_EDIT_FIELDS);
  Object.assign(user, fields);
  await user.save();
  return user;
}

async function setUserStatus({ id, action, adminUserId }) {
  const user = await getUser({ id });
  if (String(user._id) === String(adminUserId)) fail('admin_self_action');
  if (action === 'block') {
    user.status = 'blocked';
  } else if (action === 'unblock') {
    if (user.status !== 'blocked') fail('invalid_status');
    user.status = 'active';
  }
  await user.save();
  return user;
}

// --- Drivers ---

async function listDrivers() {
  const users = await User.find({ roles: 'driver' }).sort({ createdAt: -1 }).limit(MAX_LIST);
  const userIds = users.map((u) => u._id);
  const profiles = await DriverProfile.find({ userId: { $in: userIds } });
  const profileByUser = {};
  for (const p of profiles) {
    profileByUser[p.userId.toString()] = p;
  }

  const drivers = [];
  for (const user of users) {
    const vehicleCount = await Vehicle.countDocuments({ ownerUserId: user._id });
    drivers.push({
      user: publicAdminUser(user),
      profile: profileByUser[user._id.toString()] || null,
      vehicleCount,
    });
  }
  return { drivers, count: drivers.length };
}

async function getDriverDetail({ userId }) {
  assertId(userId, 'invalid_user_id');
  const user = await User.findById(userId);
  if (!user || !user.roles.includes('driver')) fail('not_found');
  const profile = await DriverProfile.findOne({ userId });
  const vehicles = await Vehicle.find({ ownerUserId: userId }).sort({ createdAt: -1 });
  const documents = await Document.find({ userId }).sort({ createdAt: -1 }).limit(MAX_LIST);
  return {
    user: publicAdminUser(user),
    profile: profile ? driverService.publicProfile(profile) : null,
    vehicles: vehicles.map(driverService.publicVehicle),
    documents: documents.map(driverService.publicDocument),
  };
}

async function verifyDriverProfile({ userId, decision, reason }) {
  if (!['approved', 'rejected'].includes(decision)) fail('validation_error');
  assertId(userId, 'invalid_user_id');
  const profile = await DriverProfile.findOne({ userId });
  if (!profile) fail('not_found');
  profile.verificationStatus = decision;
  if (decision === 'approved') {
    profile.verifiedAt = new Date();
    profile.rejectionReason = '';
  } else {
    profile.rejectionReason = reason || '';
  }
  await profile.save();
  return profile;
}

// --- Cargo ---

async function listCargoAdmin({ status, ownerUserId } = {}) {
  const query = {};
  if (status !== undefined) {
    if (!Cargo.STATUSES.includes(status)) fail('validation_error');
    query.status = status;
  }
  if (ownerUserId !== undefined) {
    assertId(ownerUserId, 'invalid_user_id');
    query.ownerUserId = ownerUserId;
  }
  const cargo = await Cargo.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
  return { cargo: cargo.map(cargoService.publicCargo), count: cargo.length };
}

async function getCargoAdmin({ id }) {
  assertId(id, 'invalid_cargo_id');
  const cargo = await Cargo.findById(id);
  if (!cargo) fail('not_found');
  return cargo;
}

async function updateCargoAdmin({ id, body }) {
  const cargo = await getCargoAdmin({ id });
  if (!['draft', 'open', 'matched'].includes(cargo.status)) fail('invalid_status');
  const fields = pickFields(body, cargoService.EDITABLE_FIELDS);
  // Timing validation: deliverBy >= pickupAt when both present
  const pickupAt = fields.pickupAt !== undefined ? fields.pickupAt : cargo.pickupAt;
  const deliverBy = fields.deliverBy !== undefined ? fields.deliverBy : cargo.deliverBy;
  if (pickupAt && deliverBy && new Date(deliverBy).getTime() < new Date(pickupAt).getTime()) {
    fail('validation_error');
  }
  Object.assign(cargo, fields);
  await cargo.save();
  return cargo;
}

async function cancelCargoAdmin({ id }) {
  const cargo = await getCargoAdmin({ id });
  if (!['draft', 'open', 'matched'].includes(cargo.status)) fail('invalid_status');
  const wasMatched = cargo.status === 'matched';
  cargo.status = 'cancelled';
  await cargo.save();

  // Plan 028: admin cancel must also reject any leftover pending bids so a
  // cancelled posting never shows live pending work to drivers. Idempotent
  // (matched cargo normally has none). Notification-free (plan 029).
  await matchingService.rejectPendingOffersForCargo(cargo._id);

  if (wasMatched) {
    // Cancel active shipment for this cargo
    const shipment = await Shipment.findOneAndUpdate(
      { cargoId: cargo._id, status: { $in: ['assigned', 'loading', 'in_transit', 'at_customs', 'delivered'] } },
      { status: 'cancelled' },
      { new: true }
    );
    if (shipment) {
      // Notify both owner and driver
      notificationService.notifyShipment({
        userId: shipment.ownerUserId,
        type: 'shipment_status',
        shipment,
        cargo,
      }).catch(() => {});
      notificationService.notifyShipment({
        userId: shipment.driverUserId,
        type: 'shipment_status',
        shipment,
        cargo,
      }).catch(() => {});
    }
  }

  return cargo;
}

// --- Overview ---

async function overview() {
  const [
    totalUsers,
    drivers,
    cargoOwners,
    admins,
    blocked,
    totalCargo,
    draftCargo,
    openCargo,
    matchedCargo,
    cancelledCargo,
    completedCargo,
    pendingOffers,
    acceptedOffers,
    rejectedOffers,
    withdrawnOffers,
    activeShipments,
    completedShipments,
    cancelledShipments,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ roles: 'driver' }),
    User.countDocuments({ roles: 'cargo_owner' }),
    User.countDocuments({ roles: 'admin' }),
    User.countDocuments({ status: 'blocked' }),
    Cargo.countDocuments(),
    Cargo.countDocuments({ status: 'draft' }),
    Cargo.countDocuments({ status: 'open' }),
    Cargo.countDocuments({ status: 'matched' }),
    Cargo.countDocuments({ status: 'cancelled' }),
    Cargo.countDocuments({ status: 'completed' }),
    Offer.countDocuments({ status: 'pending' }),
    Offer.countDocuments({ status: 'accepted' }),
    Offer.countDocuments({ status: 'rejected' }),
    Offer.countDocuments({ status: 'withdrawn' }),
    Shipment.countDocuments({ status: { $in: ['assigned', 'loading', 'in_transit', 'at_customs', 'delivered'] } }),
    Shipment.countDocuments({ status: 'completed' }),
    Shipment.countDocuments({ status: 'cancelled' }),
  ]);

  return {
    users: { total: totalUsers, drivers, cargoOwners, admins, blocked },
    cargo: { total: totalCargo, draft: draftCargo, open: openCargo, matched: matchedCargo, cancelled: cancelledCargo, completed: completedCargo },
    offers: { pending: pendingOffers, accepted: acceptedOffers, rejected: rejectedOffers, withdrawn: withdrawnOffers },
    shipments: { active: activeShipments, completed: completedShipments, cancelled: cancelledShipments },
  };
}

// --- Documents ---

async function listDocuments({ status } = {}) {
  const query = {};
  if (status !== undefined) {
    if (!Document.VERIFICATION.includes(status)) fail('validation_error');
    query.verificationStatus = status;
  }
  const documents = await Document.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
  return { documents: documents.map(driverService.publicDocument), count: documents.length };
}

// Plan 030: admin file download — streams the stored bytes for verification.
async function openDocumentFileAdmin({ id }) {
  assertId(id, 'invalid_document_id');
  const document = await Document.findById(id);
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

async function verifyDocument({ id, decision, reason, reviewerUserId }) {
  if (!['approved', 'rejected'].includes(decision)) fail('validation_error');
  if (decision === 'rejected' && (!reason || !reason.trim())) fail('validation_error');
  assertId(id, 'invalid_document_id');
  const document = await Document.findById(id);
  if (!document) fail('not_found');
  document.verificationStatus = decision;
  document.reviewedAt = new Date();
  document.reviewerUserId = reviewerUserId;
  if (decision === 'rejected') {
    document.rejectionReason = reason;
  } else {
    document.rejectionReason = '';
  }
  await document.save();
  return document;
}

// --- Shipments ---

async function listShipmentsAdmin({ status } = {}) {
  const query = {};
  if (status !== undefined) {
    if (!Shipment.STATUSES.includes(status)) fail('validation_error');
    query.status = status;
  }
  const shipments = await Shipment.find(query).sort({ createdAt: -1 }).limit(MAX_LIST);
  if (shipments.length === 0) return { shipments: [], count: 0 };

  const cargoIds = [...new Set(shipments.map((s) => s.cargoId))];
  const userIds = [...new Set(
    shipments.flatMap((s) => [s.ownerUserId.toString(), s.driverUserId.toString()])
  )];

  const [users, cargos] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('phone name').lean(),
    Cargo.find({ _id: { $in: cargoIds } }).select('title transportMode').lean(),
  ]);

  const userMap = {};
  for (const u of users) userMap[u._id.toString()] = u;
  const cargoMap = {};
  for (const c of cargos) cargoMap[c._id.toString()] = c;

  const enriched = shipments.map((s) => {
    const owner = userMap[s.ownerUserId.toString()] || {};
    const driver = userMap[s.driverUserId.toString()] || {};
    const cargo = cargoMap[s.cargoId.toString()] || {};
    return {
      id: s._id.toString(),
      cargoId: s.cargoId.toString(),
      cargoTitle: cargo.title || '',
      cargoMode: cargo.transportMode || '',
      ownerName: owner.name || owner.phone || '',
      driverName: driver.name || driver.phone || '',
      status: s.status,
      pickupAt: s.pickupAt,
      deliveredAt: s.deliveredAt,
      createdAt: s.createdAt,
    };
  });

  return { shipments: enriched, count: enriched.length };
}

// --- Admin bootstrap ---

async function ensureAdminBootstrap() {
  const raw = process.env.ADMIN_BOOTSTRAP_PHONES;
  if (!raw || !raw.trim()) return;
  const phones = raw.split(',').map((s) => s.trim()).filter(Boolean);
  let count = 0;
  for (const rawPhone of phones) {
    const phone = normalizeIranPhone(rawPhone);
    if (!phone) {
      // eslint-disable-next-line no-console
      console.log(`admin bootstrap skipped invalid phone: ${rawPhone}`);
      continue;
    }
    try {
      await User.findOneAndUpdate(
        { phone },
        {
          $addToSet: { roles: 'admin' },
          $set: { status: 'active' },
          $setOnInsert: { phone, phoneVerifiedAt: new Date() },
        },
        { upsert: true, new: true, runValidators: true }
      );
      count++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`admin bootstrap failed for phone: ${err.message}`);
    }
  }
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.log(`admin bootstrap: ${count} phones`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`admin bootstrap: ${count} phones granted admin role`);
  }
}

module.exports = {
  publicAdminUser,
  listUsers,
  getUser,
  updateUser,
  setUserStatus,
  listDrivers,
  getDriverDetail,
  verifyDriverProfile,
  listCargoAdmin,
  getCargoAdmin,
  updateCargoAdmin,
  cancelCargoAdmin,
  overview,
  listDocuments,
  verifyDocument,
  openDocumentFileAdmin,
  listShipmentsAdmin,
  ensureAdminBootstrap,
};

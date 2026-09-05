require('../setup');
const mongoose = require('mongoose');
const shipmentService = require('../../src/services/shipmentService');
const Shipment = require('../../src/models/Shipment');
const ShipmentEvent = require('../../src/models/ShipmentEvent');

// Minimal cargo/offer stubs matching the shape createForAward expects.
function stubCargo() {
  return { _id: new mongoose.Types.ObjectId(), ownerUserId: new mongoose.Types.ObjectId() };
}
function stubOffer(cargo) {
  return {
    _id: new mongoose.Types.ObjectId(),
    driverUserId: new mongoose.Types.ObjectId(),
    vehicleId: new mongoose.Types.ObjectId(),
    cargoId: cargo._id,
  };
}

describe('shipmentService.createForAward', () => {
  test('creates a shipment with status assigned and a ShipmentEvent', async () => {
    const cargo = stubCargo();
    const offer = stubOffer(cargo);
    const result = await shipmentService.createForAward({ cargo, offer });
    expect(result.created).toBe(true);
    expect(result.shipment.status).toBe('assigned');
    expect(result.shipment.cargoId.toString()).toBe(cargo._id.toString());
    expect(result.shipment.offerId.toString()).toBe(offer._id.toString());
    const events = await ShipmentEvent.find({ shipmentId: result.shipment._id });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('status_change');
    expect(events[0].toStatus).toBe('assigned');
  });

  test('is idempotent: second call with same cargo returns created:false', async () => {
    const cargo = stubCargo();
    const offer = stubOffer(cargo);
    const first = await shipmentService.createForAward({ cargo, offer });
    expect(first.created).toBe(true);
    const second = await shipmentService.createForAward({ cargo, offer });
    expect(second.created).toBe(false);
    expect(second.shipment._id.toString()).toBe(first.shipment._id.toString());
  });

  test('shipment has ownerUserId and driverUserId from cargo/offer', async () => {
    const cargo = stubCargo();
    const offer = stubOffer(cargo);
    const { shipment } = await shipmentService.createForAward({ cargo, offer });
    expect(shipment.ownerUserId.toString()).toBe(cargo.ownerUserId.toString());
    expect(shipment.driverUserId.toString()).toBe(offer.driverUserId.toString());
    expect(shipment.vehicleId.toString()).toBe(offer.vehicleId.toString());
  });
});

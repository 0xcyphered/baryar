require('../setup');
const {
  vehicleFitsCargo,
  matchingQueryForVehicle,
} = require('../../src/services/matchingService');

function vehicle(overrides) {
  return {
    vehicleType: 'truck',
    capacityWeightKg: 10000,
    capacityVolumeM3: 40,
    ...overrides,
  };
}

function cargo(overrides) {
  return {
    transportMode: 'land',
    dimensions: { weightKg: 1000, volumeM3: 10 },
    specialCharacteristics: [],
    ...overrides,
  };
}

describe('vehicleFitsCargo', () => {
  test('land cargo within cap fits a truck', () => {
    expect(vehicleFitsCargo(vehicle(), cargo())).toBe(true);
  });
  test('sea / air / rail do not fit', () => {
    expect(vehicleFitsCargo(vehicle(), cargo({ transportMode: 'sea' }))).toBe(false);
    expect(vehicleFitsCargo(vehicle(), cargo({ transportMode: 'air' }))).toBe(false);
    expect(vehicleFitsCargo(vehicle(), cargo({ transportMode: 'rail' }))).toBe(false);
  });
  test('multimodal fits', () => {
    expect(vehicleFitsCargo(vehicle(), cargo({ transportMode: 'multimodal' }))).toBe(true);
  });
  test('missing transportMode is treated as land', () => {
    const c = cargo();
    delete c.transportMode;
    expect(vehicleFitsCargo(vehicle(), c)).toBe(true);
  });
  test('weight / volume above cap do not fit; equal cap does', () => {
    expect(vehicleFitsCargo(vehicle({ capacityWeightKg: 1000 }), cargo({ dimensions: { weightKg: 1000, volumeM3: 10 } }))).toBe(true);
    expect(vehicleFitsCargo(vehicle({ capacityWeightKg: 999 }), cargo({ dimensions: { weightKg: 1000, volumeM3: 10 } }))).toBe(false);
  });
  test('missing dimensions count as 0 (unspecified) and fit', () => {
    expect(vehicleFitsCargo(vehicle(), { transportMode: 'land', specialCharacteristics: [] })).toBe(true);
  });
  test('refrigerated needs a reefer; other specials do not', () => {
    expect(vehicleFitsCargo(vehicle(), cargo({ specialCharacteristics: ['refrigerated'] }))).toBe(false);
    expect(vehicleFitsCargo(vehicle({ vehicleType: 'reefer' }), cargo({ specialCharacteristics: ['refrigerated'] }))).toBe(true);
    expect(vehicleFitsCargo(vehicle(), cargo({ specialCharacteristics: ['hazardous'] }))).toBe(true);
  });
});

describe('matchingQueryForVehicle', () => {
  test('always restricts to land/multimodal and weight/volume $lte', () => {
    const q = matchingQueryForVehicle(vehicle());
    expect(q.transportMode).toEqual({ $in: ['land', 'multimodal'] });
    expect(q['dimensions.weightKg']).toEqual({ $lte: 10000 });
    expect(q['dimensions.volumeM3']).toEqual({ $lte: 40 });
  });
  test('non-reefer adds specialCharacteristics $nin refrigerated', () => {
    const q = matchingQueryForVehicle(vehicle({ vehicleType: 'truck' }));
    expect(q.specialCharacteristics).toEqual({ $nin: ['refrigerated'] });
  });
  test('reefer does not set specialCharacteristics', () => {
    const q = matchingQueryForVehicle(vehicle({ vehicleType: 'reefer' }));
    expect(q.specialCharacteristics).toBeUndefined();
  });
});

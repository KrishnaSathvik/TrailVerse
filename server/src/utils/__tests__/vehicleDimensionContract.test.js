'use strict';

const {
  parseTravelerVehicle,
  parseVehicleLengthLimit,
  assessVehicleDimensionFit,
  describeVehicleDimensionConflict,
} = require('../vehicleDimensionContract');

/**
 * P0-5 (audit 2026-08-31): a traveler's 24-ft RV was planned onto
 * Going-to-the-Sun Road (21-ft vehicle length limit) with "check the
 * restriction before driving" as a caveat. A deterministic dimensional
 * incompatibility must be machine-owned arithmetic over normalized units —
 * never prose the model reasons about.
 */

describe('parseTravelerVehicle', () => {
  test.each([
    ['Plan 4 days in Glacier in early October with our 24-foot RV.', 'rv', 24],
    ['We have a 24 ft RV.', 'rv', 24],
    ['Our RV is 24 feet long.', 'rv', 24],
    ['driving a 32-foot motorhome', 'motorhome', 32],
    ['towing a 288-inch trailer', 'trailer', 24],
    ['we rented a 7.3 m camper', 'camper', 23.95],
  ])('%j → %s of ~%d ft', (text, kind, feet) => {
    const vehicle = parseTravelerVehicle(text);
    expect(vehicle).not.toBeNull();
    expect(vehicle.kind).toBe(kind);
    expect(vehicle.lengthFeet).toBeCloseTo(feet, 1);
  });

  test('an RV with no stated length is captured with unknown length', () => {
    const vehicle = parseTravelerVehicle('We are bringing our RV — any road restrictions?');
    expect(vehicle).not.toBeNull();
    expect(vehicle.kind).toBe('rv');
    expect(vehicle.lengthFeet).toBeNull();
  });

  test('campground amenities are not the traveler’s vehicle', () => {
    expect(parseTravelerVehicle('Do the campgrounds have RV sites with hookups?')).toBeNull();
    expect(parseTravelerVehicle('Plan me 3 days in Zion.')).toBeNull();
  });
});

describe('parseVehicleLengthLimit', () => {
  test.each([
    // Actual NPS Going-to-the-Sun Road wording shape.
    ['Vehicles, and vehicle combinations, longer than 21 feet (6.4 m) are prohibited between Apgar and Sun Point.', 21],
    ['Vehicles over 21 feet are prohibited on this road.', 21],
    ['Maximum vehicle length is 21 feet.', 21],
    ['Vehicle length limit: 21 ft.', 21],
    ['RVs longer than 25 feet are not permitted beyond the campground.', 25],
  ])('%j → max %d ft', (text, feet) => {
    const limit = parseVehicleLengthLimit(text);
    expect(limit).not.toBeNull();
    expect(limit.maxLengthFeet).toBeCloseTo(feet, 2);
  });

  test('road mileage and non-limit numbers are not limits', () => {
    expect(parseVehicleLengthLimit('The scenic drive is 21 miles long.')).toBeNull();
    expect(parseVehicleLengthLimit('The road climbs 3,000 feet over 21 miles.')).toBeNull();
    expect(parseVehicleLengthLimit('A gorgeous 50-foot waterfall beside the road.')).toBeNull();
  });

  test('a width limit is not a length limit', () => {
    expect(parseVehicleLengthLimit('Vehicles wider than 8 feet are prohibited.')).toBeNull();
  });
});

describe('assessVehicleDimensionFit', () => {
  const fit = (vehicleLengthFeet, maxLengthFeet) =>
    assessVehicleDimensionFit({ vehicleLengthFeet, maxLengthFeet });

  test('24 ft against a 21 ft maximum is incompatible', () => {
    expect(fit(24, 21).status).toBe('incompatible');
  });

  test('20 ft against a 21 ft maximum is compatible', () => {
    expect(fit(20, 21).status).toBe('compatible');
  });

  test('exactly at the limit is compatible ("longer than 21 ft" allows 21 ft)', () => {
    expect(fit(21, 21).status).toBe('compatible');
  });

  test('unknown vehicle length keeps the requirement as unknown', () => {
    expect(fit(null, 21).status).toBe('unknown');
  });

  test('no dimension restriction produces no dimension verdict', () => {
    expect(fit(24, null).status).toBe('not_applicable');
  });

  test('unit-converted comparisons: 288 in and 7.3 m both exceed 21 ft', () => {
    expect(fit(288 / 12, 21).status).toBe('incompatible');
    expect(fit(7.3 * 3.28084, 21).status).toBe('incompatible');
  });

  test('6.4 m equals the 21 ft limit within tolerance — compatible', () => {
    expect(fit(6.4 * 3.28084, 21).status).toBe('compatible');
  });
});

describe('describeVehicleDimensionConflict', () => {
  test('states both numbers exactly', () => {
    const message = describeVehicleDimensionConflict({
      vehicle: { kind: 'rv', lengthFeet: 24 },
      maxLengthFeet: 21,
      subjectName: 'Going-to-the-Sun Road',
    });
    expect(message).toContain('24');
    expect(message).toContain('21');
    expect(message).toMatch(/RV/i);
    expect(message).toContain('Going-to-the-Sun Road');
  });
});

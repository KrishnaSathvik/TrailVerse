'use strict';

const {
  listOfficialLodgingByParkCode,
  hasOfficialLodgingCoverage,
} = require('../officialLodgingCatalog');

describe('official lodging catalog', () => {
  test('yell returns inside_park properties with official URLs', () => {
    const rows = listOfficialLodgingByParkCode('yell');

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((row) => row.locationClass === 'inside_park')).toBe(true);
    expect(rows.every((row) => /^https?:\/\//.test(row.officialUrl))).toBe(true);
    expect(rows.some((row) => row.name === 'Old Faithful Inn')).toBe(true);
    expect(rows.some((row) => row.name === 'Canyon Lodge & Cabins')).toBe(true);
    expect(hasOfficialLodgingCoverage('yell')).toBe(true);
  });

  test('unknown park has no catalog coverage', () => {
    expect(listOfficialLodgingByParkCode('xxxx')).toEqual([]);
    expect(hasOfficialLodgingCoverage('xxxx')).toBe(false);
  });

  test('lookup normalizes park code casing and whitespace', () => {
    expect(listOfficialLodgingByParkCode(' YELL ')).toHaveLength(
      listOfficialLodgingByParkCode('yell').length,
    );
  });
});

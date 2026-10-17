'use strict';

const {
  silentMatchFromSearchHits,
  toMatchPayload,
  normalizeQuery,
} = require('../whereNextMatchService');

const GLACIER = {
  parkCode: 'glac',
  fullName: 'Glacier National Park',
  states: 'MT',
};
const GLACIER_BAY = {
  parkCode: 'glba',
  fullName: 'Glacier Bay National Park & Preserve',
  states: 'AK',
};
const YOSEMITE = {
  parkCode: 'yose',
  fullName: 'Yosemite National Park',
  states: 'CA',
};

describe('whereNextMatchService', () => {
  it('normalizes raw input', () => {
    expect(normalizeQuery('  Banff  Canada ')).toBe('banff canada');
  });

  it('leaves ambiguous Glacier unmatched (AE-style)', () => {
    const match = silentMatchFromSearchHits([GLACIER, GLACIER_BAY], 'Glacier');
    expect(match).toBeNull();
    expect(toMatchPayload(match).parkCode).toBeNull();
  });

  it('matches an explicit unique prefix like Yosemite', () => {
    const match = silentMatchFromSearchHits([YOSEMITE], 'Yosemite');
    expect(match.parkCode).toBe('yose');
  });

  it('matches exact fullName', () => {
    const match = silentMatchFromSearchHits(
      [GLACIER, GLACIER_BAY],
      'Glacier National Park'
    );
    expect(match.parkCode).toBe('glac');
  });

  it('does not match Banff', () => {
    expect(silentMatchFromSearchHits([GLACIER, YOSEMITE], 'Banff')).toBeNull();
  });

  it('does not match Tokyo', () => {
    expect(silentMatchFromSearchHits([GLACIER, YOSEMITE], 'Tokyo')).toBeNull();
  });

  it('does not match Vermont as a state hub', () => {
    const vtParks = [
      { parkCode: 'appa', fullName: 'Appalachian National Scenic Trail', states: 'VT,NH' },
      { parkCode: 'mabi', fullName: 'Marsh-Billings-Rockefeller National Historical Park', states: 'VT' },
    ];
    expect(silentMatchFromSearchHits(vtParks, 'Vermont')).toBeNull();
  });
});

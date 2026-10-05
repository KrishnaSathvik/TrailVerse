'use strict';

const { travelLogisticsBelongsToTurn } = require('../trailieEnhancementOwnership');

function zionResponse(overrides = {}) {
  return {
    content: 'For Zion, fly into LAS or SGU.',
    canonicalPlan: { parkName: 'Zion National Park', parkCode: 'zion' },
    sources: { parkNames: ['Zion National Park'] },
    ...overrides,
  };
}

function yosemiteAirports() {
  return {
    schemaVersion: 1,
    destination: {
      parkCode: 'yose',
      parkName: 'Yosemite National Park',
      entityId: 'nps:park:yose',
    },
    transport: {
      airports: [{
        airportCode: 'FAT',
        name: 'Fresno Yosemite International',
        groundTransfer: { destinationLabel: 'Yosemite National Park' },
      }],
    },
  };
}

function zionAirports() {
  return {
    schemaVersion: 1,
    destination: {
      parkCode: 'zion',
      parkName: 'Zion National Park',
      entityId: 'nps:park:zion',
    },
    transport: {
      airports: [{
        airportCode: 'LAS',
        name: 'Harry Reid International',
        groundTransfer: { destinationLabel: 'Zion National Park' },
      }],
    },
  };
}

describe('travelLogisticsBelongsToTurn', () => {
  test('Zion response does not own Yosemite logistics', () => {
    expect(travelLogisticsBelongsToTurn(yosemiteAirports(), zionResponse())).toBe(false);
  });

  test('Zion response owns Zion logistics', () => {
    expect(travelLogisticsBelongsToTurn(zionAirports(), zionResponse())).toBe(true);
  });

  test('restored Zion conversation still rejects Yosemite airports without a destination stamp', () => {
    const unstampedYosemite = {
      schemaVersion: 1,
      transport: {
        airports: [{
          airportCode: 'FAT',
          name: 'Fresno Yosemite International',
          groundTransfer: { destinationLabel: 'Yosemite National Park' },
        }],
      },
    };
    expect(travelLogisticsBelongsToTurn(unstampedYosemite, zionResponse())).toBe(false);
  });

  test('does not render logistics just because the payload exists', () => {
    expect(travelLogisticsBelongsToTurn(yosemiteAirports(), {
      content: 'Here is a general packing list.',
      sources: { parkNames: [] },
    })).toBe(false);
  });
});

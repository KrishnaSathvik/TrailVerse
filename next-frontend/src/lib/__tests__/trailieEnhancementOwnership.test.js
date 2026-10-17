import { describe, expect, it } from 'vitest';
import { travelLogisticsBelongsToTurn } from '@/lib/trailieEnhancementOwnership';

function zionResponse(overrides = {}) {
  return {
    content: 'For Zion, fly into LAS or SGU.',
    canonicalPlan: { parkName: 'Zion National Park', parkCode: 'zion' },
    sources: { parkNames: ['Zion National Park'] },
    ...overrides,
  };
}

describe('travelLogisticsBelongsToTurn', () => {
  it('never renders Yosemite airports on a Zion response', () => {
    const yosemiteAirports = {
      destination: { parkCode: 'yose', parkName: 'Yosemite National Park' },
      transport: {
        airports: [{
          airportCode: 'FAT',
          name: 'Fresno Yosemite International',
          groundTransfer: { destinationLabel: 'Yosemite National Park' },
        }],
      },
    };
    expect(travelLogisticsBelongsToTurn(yosemiteAirports, zionResponse())).toBe(false);
  });

  it('renders Zion airports on a Zion response', () => {
    const zionAirports = {
      destination: { parkCode: 'zion', parkName: 'Zion National Park' },
      transport: {
        airports: [{
          airportCode: 'LAS',
          name: 'Harry Reid International',
          groundTransfer: { destinationLabel: 'Zion National Park' },
        }],
      },
    };
    expect(travelLogisticsBelongsToTurn(zionAirports, zionResponse())).toBe(true);
  });

  it('rejects restored leftover logistics with no overlapping destination', () => {
    expect(travelLogisticsBelongsToTurn({
      transport: {
        airports: [{
          airportCode: 'FAT',
          groundTransfer: { destinationLabel: 'Yosemite National Park' },
        }],
      },
    }, zionResponse())).toBe(false);
  });
});
